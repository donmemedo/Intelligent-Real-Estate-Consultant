"""The send gate: the single check every outbound message passes, at enqueue and again at delivery
(contract SEC-09, SEC-10, SEC-13, SEC-25). Call it with the lead row locked (SELECT ... FOR UPDATE)
so a concurrent stop is serialised with the send.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import SendBlocked
from app.models import DO_NOT_CONTACT, Agency, Lead, Outbox, Suppression, SystemSettings

WHATSAPP_WINDOW = timedelta(hours=24)
COUNTS_TOWARD_CAP = ("sending", "sent", "delivered", "read", "unknown")


async def check_send(
    session: AsyncSession, lead: Lead, settings: Settings, *, by_ai: bool, exclude_id: UUID | None = None
) -> None:
    """Raise SendBlocked unless `lead` may receive a WhatsApp message right now."""
    now = datetime.now(UTC)
    if await session.scalar(select(SystemSettings.kill_switch).where(SystemSettings.id == 1)):
        raise SendBlocked("All sending is stopped by the kill switch.")
    if await session.scalar(select(Agency.paused).where(Agency.id == lead.agency_id)):
        raise SendBlocked("Sending is paused for this agency.")
    suppressed = await session.scalar(
        select(Suppression.id)
        .where(Suppression.contact_id == lead.contact_id, Suppression.channel.in_(("all", "whatsapp")))
        .limit(1)
    )
    if lead.status == DO_NOT_CONTACT or suppressed:
        raise SendBlocked("This contact asked not to be contacted.")
    if by_ai and lead.response_state != "ai":
        raise SendBlocked("A person owns this conversation, so the AI may not reply.")
    if lead.last_inbound_at is None or now - lead.last_inbound_at > WHATSAPP_WINDOW:
        raise SendBlocked("The WhatsApp 24-hour window is closed. Only an approved template may be sent.")
    # ponytail: UTC day; switch to the agency's timezone when caps are reported per local day.
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    counted = (
        select(func.count())
        .select_from(Outbox)
        .where(Outbox.created_at >= day_start, Outbox.status.in_(COUNTS_TOWARD_CAP))
    )
    if exclude_id is not None:
        counted = counted.where(Outbox.id != exclude_id)
    if (await session.scalar(counted) or 0) >= settings.daily_send_cap:
        raise SendBlocked("The daily sending limit for this agency has been reached.")
