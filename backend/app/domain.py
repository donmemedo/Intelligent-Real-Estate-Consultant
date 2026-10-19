"""Business rules for stop and handoff, ported from the prototype (lib/lead-handoff.ts,
lib/lead-meetings.ts). Pure functions: no I/O, so they are cheap to test exhaustively.

Each `plan_*` either returns what to change, raises `Unchanged` (the request is already
satisfied, so nothing happens) or raises `Blocked` (the current state forbids it).
"""

from dataclasses import dataclass
from uuid import UUID

import phonenumbers

from app.errors import Conflict, Forbidden
from app.models import DO_NOT_CONTACT, IN_CONVERSATION, WAITING_FOR_ADVISER


class Blocked(Conflict):
    pass


class Unchanged(Exception):  # noqa: N818 - an outcome, not an error
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class HandoffView:
    id: UUID
    target_user_id: UUID
    status: str  # requested | accepted


@dataclass(frozen=True)
class LeadView:
    status: str
    response_state: str  # ai | paused | human
    open_handoff: HandoffView | None


def plan_stop(lead: LeadView) -> None:
    """Stop is always allowed, and idempotent."""
    if lead.status == DO_NOT_CONTACT:
        raise Unchanged("Contact is already blocked. Nothing was changed.")


def plan_handoff_request(
    lead: LeadView, target_user_id: UUID, by_user_id: UUID, *, supervisor: bool
) -> HandoffView | None:
    """Returns the open handoff that the new request replaces, if any.

    Once a lead is with someone, only a manager or that person may move it: otherwise any
    adviser could reassign a colleague's conversation to themselves and take it over.
    """
    if lead.status == DO_NOT_CONTACT:
        raise Blocked("Contact is blocked. Response control cannot be transferred.")
    current = lead.open_handoff
    if current and current.target_user_id == target_user_id:
        raise Unchanged("This handoff is already requested or accepted. Nothing was changed.")
    if current and not supervisor and current.target_user_id != by_user_id:
        raise Forbidden("Only a manager, or the adviser this lead is with, can reassign it.")
    return current


def plan_handoff_accept(lead: LeadView, handoff_id: UUID, user_id: UUID) -> str:
    """Returns the lead status after acceptance. A late or duplicate accept never changes the owner."""
    if lead.status == DO_NOT_CONTACT:
        raise Blocked("Contact is blocked. This handoff can no longer be accepted.")
    current = lead.open_handoff
    if current is None or current.id != handoff_id:
        raise Blocked("This handoff is no longer the current one. Review the lead again.")
    if current.target_user_id != user_id:
        raise Blocked("Only the adviser this handoff was sent to can accept it.")
    if current.status == "accepted":
        raise Unchanged("You already accepted this handoff. Nothing was changed.")
    if lead.response_state != "paused":
        raise Blocked("Only a pending handoff can be accepted.")
    return IN_CONVERSATION if lead.status == WAITING_FOR_ADVISER else lead.status


def plan_handoff_return(lead: LeadView, handoff_id: UUID, user_id: UUID, *, supervisor: bool) -> None:
    if lead.status == DO_NOT_CONTACT:
        raise Blocked("Contact is blocked. Response control cannot be returned to AI.")
    current = lead.open_handoff
    if current is None or current.id != handoff_id or current.status != "accepted" or lead.response_state != "human":
        raise Blocked("Returning to AI requires the current accepted handoff.")
    if current.target_user_id != user_id and not supervisor:
        raise Blocked("Only the adviser who accepted this lead, or a manager, can return it to AI.")


# ponytail: exact whole-message keywords; replaced by LLM intent detection in week 4.
STOP_WORDS = frozenset({"stop", "unsubscribe", "توقف", "الغاء", "إلغاء", "ايقاف", "إيقاف"})
HUMAN_WORDS = frozenset({"agent", "human", "adviser", "advisor", "موظف", "مستشار"})


def classify_inbound(text: str) -> str | None:
    """'stop', 'human' or None for an inbound customer message."""
    word = text.strip().strip(".!؟?").casefold()
    if word in STOP_WORDS:
        return "stop"
    if word in HUMAN_WORDS:
        return "human"
    return None


def normalize_phone(raw: str) -> str | None:
    """E.164 (+971501234567) for a valid number, otherwise None (contract CW-02)."""
    try:
        number = phonenumbers.parse("+" + raw.strip().lstrip("+"))
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_valid_number(number):
        return None
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
