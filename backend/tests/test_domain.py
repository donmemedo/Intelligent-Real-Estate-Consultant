"""Pure rule tests, ported from the prototype's scripts/check-lead-handoff.cjs and check-lead-meetings.cjs."""

import uuid

import pytest

from app.domain import (
    Blocked,
    HandoffView,
    LeadView,
    Unchanged,
    classify_inbound,
    normalize_phone,
    plan_handoff_accept,
    plan_handoff_request,
    plan_handoff_return,
    plan_stop,
)
from app.errors import Forbidden
from app.models import DO_NOT_CONTACT, IN_CONVERSATION, WAITING_FOR_ADVISER

SARA, OMAR = uuid.uuid4(), uuid.uuid4()
HID = uuid.uuid4()


def lead(status: str = WAITING_FOR_ADVISER, response: str = "paused", handoff: HandoffView | None = None) -> LeadView:
    return LeadView(status, response, handoff)


def requested(target: uuid.UUID = SARA) -> HandoffView:
    return HandoffView(HID, target, "requested")


def accepted(target: uuid.UUID = SARA) -> HandoffView:
    return HandoffView(HID, target, "accepted")


def test_stop_is_idempotent() -> None:
    plan_stop(lead(status="New", response="ai"))
    with pytest.raises(Unchanged):
        plan_stop(lead(status=DO_NOT_CONTACT))


@pytest.mark.parametrize(
    "plan",
    [
        lambda v: plan_handoff_request(v, SARA, SARA, supervisor=True),
        lambda v: plan_handoff_accept(v, HID, SARA),
        lambda v: plan_handoff_return(v, HID, SARA, supervisor=True),
    ],
)
def test_do_not_contact_blocks_every_handoff_step(plan) -> None:
    with pytest.raises(Blocked):
        plan(lead(status=DO_NOT_CONTACT, handoff=requested()))


def test_request_to_same_target_changes_nothing() -> None:
    with pytest.raises(Unchanged):
        plan_handoff_request(lead(handoff=requested(SARA)), SARA, SARA, supervisor=False)


def test_request_to_new_target_replaces_the_open_handoff() -> None:
    assert plan_handoff_request(lead(handoff=requested(SARA)), OMAR, uuid.uuid4(), supervisor=True) == requested(SARA)
    assert plan_handoff_request(lead(status="New", response="ai"), SARA, OMAR, supervisor=False) is None


def test_an_adviser_cannot_take_over_a_colleagues_lead() -> None:
    with pytest.raises(Forbidden):  # Omar reassigning Sara's accepted lead to himself
        plan_handoff_request(lead(response="human", handoff=accepted(SARA)), OMAR, OMAR, supervisor=False)
    # Sara may pass on her own lead, and a manager may move any lead.
    assert plan_handoff_request(lead(response="human", handoff=accepted(SARA)), OMAR, SARA, supervisor=False)
    assert plan_handoff_request(lead(response="human", handoff=accepted(SARA)), OMAR, uuid.uuid4(), supervisor=True)


def test_only_the_target_can_accept() -> None:
    with pytest.raises(Blocked, match="Only the adviser"):
        plan_handoff_accept(lead(handoff=requested(SARA)), HID, OMAR)


def test_late_accept_of_a_replaced_handoff_is_blocked() -> None:
    with pytest.raises(Blocked, match="no longer the current"):
        plan_handoff_accept(lead(handoff=requested(OMAR)), uuid.uuid4(), SARA)


def test_duplicate_accept_changes_nothing() -> None:
    with pytest.raises(Unchanged):
        plan_handoff_accept(lead(status=IN_CONVERSATION, response="human", handoff=accepted()), HID, SARA)


def test_accept_moves_waiting_to_in_conversation_and_keeps_other_statuses() -> None:
    assert plan_handoff_accept(lead(handoff=requested()), HID, SARA) == IN_CONVERSATION
    assert plan_handoff_accept(lead(status="Qualified", handoff=requested()), HID, SARA) == "Qualified"


def test_return_requires_the_current_accepted_handoff() -> None:
    with pytest.raises(Blocked):
        plan_handoff_return(lead(handoff=requested()), HID, SARA, supervisor=False)
    plan_handoff_return(lead(response="human", handoff=accepted()), HID, SARA, supervisor=False)


def test_only_the_owner_or_a_supervisor_can_return() -> None:
    current = lead(response="human", handoff=accepted(SARA))
    with pytest.raises(Blocked, match="or a manager"):
        plan_handoff_return(current, HID, OMAR, supervisor=False)
    plan_handoff_return(current, HID, OMAR, supervisor=True)


@pytest.mark.parametrize(
    ("text", "intent"),
    [
        ("STOP", "stop"),
        (" stop. ", "stop"),
        ("توقف", "stop"),
        ("إلغاء", "stop"),
        ("human", "human"),
        ("موظف", "human"),
        ("please stop sending prices after 5pm", None),
        ("Hi", None),
        ("", None),
    ],
)
def test_classify_inbound_matches_whole_message_only(text: str, intent: str | None) -> None:
    assert classify_inbound(text) == intent


@pytest.mark.parametrize(
    ("raw", "e164"),
    [
        ("971501234567", "+971501234567"),
        ("+971 50 123 4567", "+971501234567"),
        ("12345", None),
        ("not-a-number", None),
        ("971000000000", None),
    ],
)
def test_normalize_phone(raw: str, e164: str | None) -> None:
    assert normalize_phone(raw) == e164
