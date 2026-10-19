"""State-changing operations shared by the panel API and the WhatsApp webhook.

Every function expects the caller's transaction to be scoped to the lead's agency, applies one
domain decision, writes an audit row and leaves the commit to the caller.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.domain import (
    HandoffView,
    LeadView,
    Unchanged,
    plan_handoff_accept,
    plan_handoff_request,
    plan_handoff_return,
    plan_stop,
)
from app.errors import Conflict, Forbidden, NotFound
from app.gate import check_send
from app.models import (
    DO_NOT_CONTACT,
    SUPERVISORS,
    WAITING_FOR_ADVISER,
    Contact,
    Handoff,
    Lead,
    Outbox,
    Suppression,
    User,
    audit,
)

OPEN = ("requested", "accepted")


async def lock_lead(session: AsyncSession, lead_id: UUID) -> Lead:
    """Load and row-lock a lead of the current agency. Other agencies' leads are invisible (404)."""
    lead = await session.scalar(select(Lead).where(Lead.id == lead_id).with_for_update())
    if lead is None:
        raise NotFound("Lead not found.")
    return lead


async def _view(session: AsyncSession, lead: Lead) -> tuple[LeadView, Handoff | None]:
    handoff = await session.scalar(select(Handoff).where(Handoff.lead_id == lead.id, Handoff.status.in_(OPEN)))
    open_view = HandoffView(handoff.id, handoff.target_user_id, handoff.status) if handoff else None
    return LeadView(lead.status, lead.response_state, open_view), handoff


async def stop_contact(session: AsyncSession, lead: Lead, actor: str, reason: str) -> bool:
    """Record Do-not-contact: suppress the contact and cancel everything still queued for it."""
    view, _ = await _view(session, lead)
    try:
        plan_stop(view)
    except Unchanged:
        return False
    lead.status, lead.response_state = DO_NOT_CONTACT, "paused"
    await session.execute(
        insert(Suppression)
        .values(agency_id=lead.agency_id, contact_id=lead.contact_id, channel="all", reason=reason, created_by=actor)
        .on_conflict_do_nothing(index_elements=["contact_id", "channel"])
    )
    cancelled = await session.execute(
        update(Outbox)
        .where(Outbox.lead_id == lead.id, Outbox.status == "pending")
        .values(status="cancelled", last_error="Contact was stopped before delivery.")
    )
    session.add(audit(lead.agency_id, actor, "lead.stopped", lead.id, cancelled=cancelled.rowcount))  # type: ignore[attr-defined]
    return True


async def request_human(session: AsyncSession, lead: Lead) -> bool:
    """The customer asked for a person: pause the AI until a manager assigns an adviser."""
    if lead.status == DO_NOT_CONTACT or lead.response_state != "ai":
        return False
    lead.response_state, lead.status = "paused", WAITING_FOR_ADVISER
    session.add(audit(lead.agency_id, "customer", "lead.human_requested", lead.id))
    return True


async def request_handoff(session: AsyncSession, lead: Lead, target: User, by: User) -> bool:
    view, current = await _view(session, lead)
    try:
        plan_handoff_request(view, target.id, by.id, supervisor=by.role in SUPERVISORS)
    except Unchanged:
        return False
    if current is not None:
        current.status, current.closed_at = "cancelled", datetime.now(UTC)
        await session.flush()  # free the one-open-handoff index before inserting the new one
    session.add(Handoff(agency_id=lead.agency_id, lead_id=lead.id, target_user_id=target.id, requested_by=by.id))
    lead.owner_user_id, lead.response_state, lead.status = target.id, "paused", WAITING_FOR_ADVISER
    session.add(audit(lead.agency_id, f"user:{by.id}", "handoff.requested", lead.id, target=str(target.id)))
    return True


async def _lock_handoff_lead(session: AsyncSession, handoff_id: UUID) -> Lead:
    lead_id = await session.scalar(select(Handoff.lead_id).where(Handoff.id == handoff_id))
    if lead_id is None:
        raise NotFound("Handoff not found.")
    return await lock_lead(session, lead_id)


async def accept_handoff(session: AsyncSession, handoff_id: UUID, user: User) -> bool:
    lead = await _lock_handoff_lead(session, handoff_id)
    view, current = await _view(session, lead)
    try:
        lead.status = plan_handoff_accept(view, handoff_id, user.id)
    except Unchanged:
        return False
    assert current is not None  # noqa: S101 - type narrowing; plan_handoff_accept guarantees it
    current.status, current.accepted_at = "accepted", datetime.now(UTC)
    lead.response_state = "human"
    session.add(audit(lead.agency_id, f"user:{user.id}", "handoff.accepted", lead.id))
    return True


async def return_handoff(session: AsyncSession, handoff_id: UUID, user: User) -> bool:
    lead = await _lock_handoff_lead(session, handoff_id)
    view, current = await _view(session, lead)
    plan_handoff_return(view, handoff_id, user.id, supervisor=user.role in SUPERVISORS)
    assert current is not None  # noqa: S101 - type narrowing; plan_handoff_return guarantees it
    current.status, current.closed_at = "returned", datetime.now(UTC)
    lead.response_state = "ai"
    session.add(audit(lead.agency_id, f"user:{user.id}", "handoff.returned", lead.id))
    return True


async def enqueue_human_message(
    session: AsyncSession, lead_id: UUID, user: User, body: str, key: str, settings: Settings
) -> tuple[Outbox, bool]:
    """Queue an adviser's reply. Returns (message, created). Replaying the same Idempotency-Key
    returns the original message instead of sending twice (contract SEC-08)."""
    lead = await lock_lead(session, lead_id)  # serialises concurrent requests for this lead
    existing = await session.scalar(select(Outbox).where(Outbox.idempotency_key == key))
    if existing is not None:
        if existing.lead_id != lead.id or existing.body != body:
            raise Conflict("This Idempotency-Key was already used for a different message.")
        return existing, False
    handoff = await session.scalar(select(Handoff).where(Handoff.lead_id == lead.id, Handoff.status == "accepted"))
    if lead.response_state != "human" or handoff is None:
        raise Conflict("Accept the handoff before messaging this lead.")
    if handoff.target_user_id != user.id and user.role not in SUPERVISORS:
        raise Forbidden("Only the adviser who accepted this lead, or a manager, can message it.")
    await check_send(session, lead, settings, by_ai=False)
    phone = await session.scalar(select(Contact.phone_e164).where(Contact.id == lead.contact_id))
    assert phone is not None  # noqa: S101 - NOT NULL column behind a foreign key
    message = Outbox(
        agency_id=lead.agency_id,
        lead_id=lead.id,
        channel="whatsapp",
        to_address=phone,
        body=body,
        by_ai=False,
        created_by=user.id,
        idempotency_key=key,
    )
    session.add(message)
    await session.flush()
    session.add(audit(lead.agency_id, f"user:{user.id}", "outbox.queued", message.id, lead=str(lead.id)))
    return message, True
