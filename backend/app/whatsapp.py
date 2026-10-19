"""WhatsApp Cloud API: webhook signature check, payload schema and sending text messages."""

import hashlib
import hmac

import httpx
from pydantic import BaseModel, Field

from app.config import Settings


def signature_valid(secret: str | None, body: bytes, header: str | None) -> bool:
    """Check Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body). Fails closed if unconfigured."""
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


# Webhook payload. Unknown fields are ignored; lengths are capped (contract SEC-06).
class WAText(BaseModel):
    body: str = Field(max_length=4096)


class WAMessage(BaseModel):
    sender: str = Field(alias="from", max_length=32)
    id: str = Field(max_length=256)
    type: str = Field(max_length=32)
    text: WAText | None = None


class WAStatus(BaseModel):
    id: str = Field(max_length=256)
    status: str = Field(max_length=32)
    biz_opaque_callback_data: str | None = Field(default=None, max_length=512)


class WAProfile(BaseModel):
    name: str | None = Field(default=None, max_length=256)


class WAContact(BaseModel):
    wa_id: str = Field(max_length=32)
    profile: WAProfile | None = None


class WAMetadata(BaseModel):
    phone_number_id: str = Field(max_length=64)


class WAValue(BaseModel):
    metadata: WAMetadata
    contacts: list[WAContact] = Field(default_factory=list, max_length=100)
    messages: list[WAMessage] = Field(default_factory=list, max_length=100)
    statuses: list[WAStatus] = Field(default_factory=list, max_length=100)


class WAChange(BaseModel):
    field: str
    value: WAValue


class WAEntry(BaseModel):
    changes: list[WAChange] = Field(max_length=100)


class WAWebhook(BaseModel):
    object: str
    entry: list[WAEntry] = Field(max_length=100)


class RetryLater(Exception):
    """The request never reached WhatsApp, so retrying cannot create a duplicate."""


class OutcomeUnknown(Exception):
    """WhatsApp may have accepted the message. Never resend blindly."""


class Rejected(Exception):
    """WhatsApp refused the message; retrying will not help."""


async def send_text(
    http: httpx.AsyncClient, settings: Settings, phone_number_id: str, to: str, body: str, callback: str
) -> str:
    """Send one text message and return its WhatsApp message id (wamid).

    `callback` comes back in status webhooks as biz_opaque_callback_data, which lets us resolve
    an unknown outcome without the wamid.
    """
    if not settings.whatsapp_token:
        raise Rejected("WhatsApp sending is not configured.")
    payload = {
        "messaging_product": "whatsapp",
        "to": to.removeprefix("+"),
        "type": "text",
        "text": {"body": body},
        "biz_opaque_callback_data": callback,
    }
    try:
        response = await http.post(
            f"{settings.whatsapp_api_base}/{phone_number_id}/messages",
            json=payload,
            headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
        )
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as exc:
        raise RetryLater(f"Could not reach WhatsApp ({type(exc).__name__}).") from exc
    except httpx.HTTPError as exc:
        raise OutcomeUnknown(f"No reliable answer from WhatsApp ({type(exc).__name__}).") from exc
    if response.status_code == 429:
        raise RetryLater("WhatsApp rate limit reached.")
    if response.status_code >= 500:
        raise OutcomeUnknown(f"WhatsApp returned {response.status_code}.")
    if response.status_code >= 400:
        raise Rejected(f"WhatsApp refused the message ({response.status_code}): {_error_text(response)}")
    try:
        wamid: str = response.json()["messages"][0]["id"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise OutcomeUnknown("WhatsApp answered without a message id.") from exc
    return wamid


def _error_text(response: httpx.Response) -> str:
    try:
        return str(response.json()["error"]["message"])[:200]
    except ValueError, KeyError, TypeError:
        return "no details"
