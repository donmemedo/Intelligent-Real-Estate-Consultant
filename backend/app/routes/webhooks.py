"""WhatsApp Cloud API webhook: verify, dedupe, store, then return 200 (contract SEC-07, SEC-08, CW-02).

Processing stays inside the request only as far as storing rows. The AI reply is a later step.
"""

import hmac
import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app import actions
from app.db import set_agency
from app.domain import classify_inbound, normalize_phone
from app.errors import AppError, Forbidden, PayloadTooLarge, Unauthorized
from app.models import ChannelAccount, Contact, InboundMessage, Lead, Outbox, audit
from app.security import DbDep, SettingsDep
from app.whatsapp import WAMessage, WAStatus, WAValue, WAWebhook, signature_valid

router = APIRouter(tags=["webhooks"])
log = logging.getLogger("irec.webhooks")
MAX_BODY_BYTES = 1_000_000  # Caddy enforces the same limit before the body reaches us
STATUS_RANK = {"sent": 1, "delivered": 2, "read": 3}
RESOLVABLE = ("sending", "sent", "delivered", "unknown")


@router.get("/whatsapp", response_class=PlainTextResponse)
async def verify_subscription(
    settings: SettingsDep,
    challenge: Annotated[str, Query(alias="hub.challenge", pattern=r"^[A-Za-z0-9_-]{1,128}$")],
    mode: Annotated[str, Query(alias="hub.mode", max_length=32)] = "",
    token: Annotated[str, Query(alias="hub.verify_token", max_length=256)] = "",
) -> str:
    expected = settings.whatsapp_verify_token
    if mode != "subscribe" or not expected or not hmac.compare_digest(token.encode(), expected.encode()):
        raise Forbidden("Webhook verification failed.")
    return challenge


@router.post("/whatsapp")
async def receive(request: Request, session: DbDep, settings: SettingsDep) -> dict[str, str]:
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise PayloadTooLarge("Webhook body is too large.")
    if not signature_valid(settings.whatsapp_app_secret, body, request.headers.get("x-hub-signature-256")):
        log.warning("webhook signature rejected")
        raise Unauthorized("Invalid webhook signature.")
    try:
        payload = WAWebhook.model_validate_json(body)
    except ValidationError as exc:
        log.warning("webhook payload rejected", extra={"fields": {"errors": exc.error_count()}})
        raise AppError("Unrecognised webhook payload.") from exc
    for entry in payload.entry:
        for change in entry.changes:
            if change.field == "messages":
                await _process(session, change.value)
    await session.commit()
    return {"status": "ok"}


async def _process(session: AsyncSession, value: WAValue) -> None:
    account = await session.scalar(
        select(ChannelAccount).where(
            ChannelAccount.kind == "whatsapp", ChannelAccount.external_id == value.metadata.phone_number_id
        )
    )
    if account is None:
        log.warning(
            "webhook for an unknown WhatsApp number",
            extra={"fields": {"phone_number_id": value.metadata.phone_number_id}},
        )
        return
    await set_agency(session, account.agency_id)
    names = {c.wa_id: c.profile.name for c in value.contacts if c.profile and c.profile.name}
    for message in value.messages:
        await _receive(session, account, message, names.get(message.sender))
    for status in value.statuses:
        await _apply_status(session, account, status)


async def _receive(session: AsyncSession, account: ChannelAccount, message: WAMessage, name: str | None) -> None:
    phone = normalize_phone(message.sender)
    if phone is None:
        session.add(audit(account.agency_id, "whatsapp", "inbound.rejected", message.id, reason="invalid phone number"))
        return
    await session.execute(
        insert(Contact)
        .values(agency_id=account.agency_id, phone_e164=phone, name=name)
        .on_conflict_do_nothing(index_elements=["agency_id", "phone_e164"])
    )
    contact = await session.scalar(select(Contact).where(Contact.phone_e164 == phone))
    assert contact is not None  # noqa: S101 - inserted or already present just above
    if contact.name is None and name:
        contact.name = name
    await session.execute(
        insert(Lead)
        .values(
            agency_id=account.agency_id,
            contact_id=contact.id,
            channel_account_id=account.id,
            source="whatsapp",
        )
        .on_conflict_do_nothing(index_elements=["contact_id"])
    )
    lead = await session.scalar(select(Lead).where(Lead.contact_id == contact.id).with_for_update())
    assert lead is not None  # noqa: S101 - inserted or already present just above

    text = message.text.body if message.type == "text" and message.text else f"[{message.type} message]"
    stored = await session.scalar(
        insert(InboundMessage)
        .values(
            agency_id=account.agency_id, lead_id=lead.id, provider_message_id=message.id, kind=message.type, body=text
        )
        .on_conflict_do_nothing(index_elements=["provider_message_id"])
        .returning(InboundMessage.id)
    )
    if stored is None:
        return  # Meta redelivered a message we already have: no second effect.
    lead.last_inbound_at = datetime.now(UTC)
    session.add(audit(account.agency_id, "customer", "inbound.received", lead.id, kind=message.type))
    intent = classify_inbound(text) if message.type == "text" else None
    if intent == "stop":
        await actions.stop_contact(session, lead, "customer", "Customer asked to stop on WhatsApp.")
    elif intent == "human":
        await actions.request_human(session, lead)


async def _apply_status(session: AsyncSession, account: ChannelAccount, status: WAStatus) -> None:
    """Delivery receipts. They also resolve 'unknown' outcomes via biz_opaque_callback_data."""
    try:
        callback = uuid.UUID(status.biz_opaque_callback_data or "")
    except ValueError:
        callback = None
    # callback None renders "outbox.id IS NULL", which matches nothing.
    match = or_(Outbox.provider_ref == status.id, Outbox.id == callback)
    message = await session.scalar(select(Outbox).where(match).with_for_update())
    if message is None or message.status not in RESOLVABLE:
        return
    if status.status == "failed":
        message.status, message.last_error = "failed", "WhatsApp reported that delivery failed."
    elif STATUS_RANK.get(status.status, 0) > STATUS_RANK.get(message.status, 0):
        message.status = status.status
        message.provider_ref = message.provider_ref or status.id
        message.sent_at = message.sent_at or datetime.now(UTC)
    else:
        return
    session.add(audit(account.agency_id, "whatsapp", f"outbox.{message.status}", message.id))
