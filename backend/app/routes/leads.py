"""Leads, stop, handoff and human replies (contract CW-03, CW-07, CW-12)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response
from sqlalchemy import select

from app import actions
from app.errors import NotFound
from app.models import Contact, Handoff, InboundMessage, Lead, Outbox, User
from app.schemas import (
    ActionResult,
    ConversationItem,
    HandoffIn,
    HandoffOut,
    LeadDetail,
    LeadSummary,
    MessageIn,
    OutboxOut,
    StopIn,
    UserOut,
)
from app.security import CanAssign, CurrentUser, DbDep, SettingsDep

router = APIRouter(tags=["leads"])
IdempotencyKey = Annotated[
    str, Header(alias="Idempotency-Key", min_length=8, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
]


def _summary(lead: Lead, contact: Contact) -> LeadSummary:
    return LeadSummary(
        id=lead.id,
        name=contact.name,
        phone=contact.phone_e164,
        status=lead.status,
        response_state=lead.response_state,
        owner_user_id=lead.owner_user_id,
        last_inbound_at=lead.last_inbound_at,
        updated_at=lead.updated_at,
    )


def _result(changed: bool, done: str, unchanged: str) -> ActionResult:
    return ActionResult(changed=changed, message=done if changed else unchanged)


@router.get("/users", response_model=list[UserOut])
async def list_users(user: CurrentUser, session: DbDep) -> list[User]:
    """Active people in the caller's agency. `users` has no RLS, so the filter here is the boundary."""
    rows = await session.scalars(select(User).where(User.agency_id == user.agency_id, User.active).order_by(User.name))
    return list(rows)


@router.get("/leads", response_model=list[LeadSummary])
async def list_leads(
    user: CurrentUser,
    session: DbDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> list[LeadSummary]:
    rows = await session.execute(
        select(Lead, Contact)
        .join(Contact, Contact.id == Lead.contact_id)
        .order_by(Lead.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_summary(lead, contact) for lead, contact in rows]


@router.get("/leads/{lead_id}", response_model=LeadDetail)
async def get_lead(lead_id: UUID, user: CurrentUser, session: DbDep) -> LeadDetail:
    row = (
        await session.execute(
            select(Lead, Contact).join(Contact, Contact.id == Lead.contact_id).where(Lead.id == lead_id)
        )
    ).first()
    if row is None:
        raise NotFound("Lead not found.")
    lead, contact = row
    handoff = await session.scalar(select(Handoff).where(Handoff.lead_id == lead.id, Handoff.status.in_(actions.OPEN)))
    inbound = await session.scalars(select(InboundMessage).where(InboundMessage.lead_id == lead.id))
    outbound = await session.scalars(select(Outbox).where(Outbox.lead_id == lead.id))
    conversation = [ConversationItem(direction="in", body=m.body, at=m.received_at) for m in inbound]
    conversation += [ConversationItem(direction="out", body=m.body, at=m.created_at, status=m.status) for m in outbound]
    conversation.sort(key=lambda item: item.at)
    return LeadDetail(
        **_summary(lead, contact).model_dump(),
        open_handoff=HandoffOut.model_validate(handoff) if handoff else None,
        conversation=conversation[-200:],
    )


@router.post("/leads/{lead_id}/stop", response_model=ActionResult)
async def stop_lead(lead_id: UUID, payload: StopIn, user: CurrentUser, session: DbDep) -> ActionResult:
    """Anyone in the agency may stop contact: a safety action is never blocked by role."""
    lead = await actions.lock_lead(session, lead_id)
    changed = await actions.stop_contact(session, lead, f"user:{user.id}", payload.reason)
    await session.commit()
    return _result(
        changed, "Contact stopped. Nothing more will be sent.", "Contact is already blocked. Nothing was changed."
    )


@router.post("/leads/{lead_id}/handoffs", response_model=ActionResult)
async def request_handoff(lead_id: UUID, payload: HandoffIn, user: CanAssign, session: DbDep) -> ActionResult:
    target = await session.scalar(
        select(User).where(
            User.id == payload.target_user_id, User.agency_id == user.agency_id, User.active, User.role != "operator"
        )
    )
    if target is None:
        raise NotFound("Adviser not found.")
    lead = await actions.lock_lead(session, lead_id)
    changed = await actions.request_handoff(session, lead, target, user)
    await session.commit()
    return _result(
        changed,
        "Handoff requested. The AI is paused for this lead.",
        "This handoff is already open. Nothing was changed.",
    )


@router.post("/handoffs/{handoff_id}/accept", response_model=ActionResult)
async def accept_handoff(handoff_id: UUID, user: CurrentUser, session: DbDep) -> ActionResult:
    changed = await actions.accept_handoff(session, handoff_id, user)
    await session.commit()
    return _result(
        changed,
        "Handoff accepted. You now own this conversation.",
        "You already accepted this handoff. Nothing was changed.",
    )


@router.post("/handoffs/{handoff_id}/return", response_model=ActionResult)
async def return_handoff(handoff_id: UUID, user: CurrentUser, session: DbDep) -> ActionResult:
    await actions.return_handoff(session, handoff_id, user)
    await session.commit()
    return ActionResult(changed=True, message="Returned to AI. The AI may reply again within policy.")


@router.post("/leads/{lead_id}/messages", response_model=OutboxOut, status_code=202)
async def send_message(
    lead_id: UUID,
    payload: MessageIn,
    key: IdempotencyKey,
    user: CurrentUser,
    session: DbDep,
    settings: SettingsDep,
    response: Response,
) -> Outbox:
    """Queue an adviser's WhatsApp reply. 202 when queued, 200 when the key was already used."""
    message, created = await actions.enqueue_human_message(session, lead_id, user, payload.body, key, settings)
    await session.commit()
    if not created:
        response.status_code = 200
    return message
