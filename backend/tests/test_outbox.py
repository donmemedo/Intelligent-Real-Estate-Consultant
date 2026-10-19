"""Contract CW-07, CW-11, SEC-08, SEC-09, SEC-13, SEC-15: handoff, the send gate and delivery."""

import json
import uuid

import httpx
import pytest

from app.worker import run_once
from tests.conftest import email, inbound_lead, post_webhook, rows, scalar, wa_payload

pytestmark = pytest.mark.anyio


class FakeWhatsApp:
    """Records requests and answers with the next scripted response (or raises it)."""

    def __init__(self, *answers: httpx.Response | Exception) -> None:
        self.answers = list(answers)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def sent(wamid: str = "wamid.OUT1") -> httpx.Response:
    return httpx.Response(200, json={"messages": [{"id": wamid}]})


async def deliver(app, settings, fake: FakeWhatsApp) -> bool:
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as http:
        return await run_once(app.state.sessionmaker, settings, http)


async def handed_over(client, login, db, agency):
    """A lead whose handoff to `adviser` was accepted. Returns (lead_id, adviser client)."""
    lead = await inbound_lead(client, db, agency)
    manager = await login(email(agency, "manager"))
    requested = await manager.post(f"/api/leads/{lead}/handoffs", json={"target_user_id": str(agency.adviser)})
    assert requested.json()["changed"] is True
    adviser = await login(email(agency, "adviser"))
    handoff = (await adviser.get(f"/api/leads/{lead}")).json()["open_handoff"]["id"]
    assert (await adviser.post(f"/api/handoffs/{handoff}/accept")).json()["changed"] is True
    return lead, adviser


async def reply(adviser, lead: str, body: str = "Hello Maya, Sara here.", key: str | None = None) -> httpx.Response:
    return await adviser.post(
        f"/api/leads/{lead}/messages", json={"body": body}, headers={"Idempotency-Key": key or uuid.uuid4().hex}
    )


async def test_full_human_reply_is_delivered_once(app, settings, client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    first = await reply(adviser, lead, key="key-0001")
    again = await reply(adviser, lead, key="key-0001")
    assert (first.status_code, again.status_code) == (202, 200)
    assert first.json()["id"] == again.json()["id"]
    assert scalar(db, "SELECT count(*) FROM outbox") == 1

    fake = FakeWhatsApp(sent())
    assert await deliver(app, settings, fake) is True
    assert await deliver(app, settings, fake) is False  # nothing left
    [request] = fake.requests
    payload = json.loads(request.content)
    assert request.url.path == "/v24.0/PNID-A/messages"
    assert request.headers["authorization"] == "Bearer wa-token"
    assert payload["to"] == "971501234567" and payload["biz_opaque_callback_data"] == first.json()["id"]
    assert tuple(rows(db, "SELECT status, provider_ref FROM outbox")[0]) == ("sent", "wamid.OUT1")


async def test_reusing_a_key_for_different_content_is_refused(client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    await reply(adviser, lead, body="one", key="key-0002")
    assert (await reply(adviser, lead, body="two", key="key-0002")).status_code == 409


async def test_no_human_message_without_an_accepted_handoff(client, login, db, agency) -> None:
    lead = await inbound_lead(client, db, agency)
    adviser = await login(email(agency, "adviser"))
    assert (await reply(adviser, lead)).status_code == 409


async def test_only_the_accepting_adviser_or_a_supervisor_may_reply(client, login, db, agency) -> None:
    lead, _ = await handed_over(client, login, db, agency)
    other = await login(email(agency, "adviser2"))
    assert (await reply(other, lead)).status_code == 403
    manager = await login(email(agency, "manager"))
    assert (await reply(manager, lead)).status_code == 202


async def test_stop_after_queueing_cancels_the_send(app, settings, client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    await reply(adviser, lead)
    stopped = await adviser.post(f"/api/leads/{lead}/stop", json={"reason": "Customer called and asked us to stop."})
    assert stopped.json() == {"changed": True, "message": "Contact stopped. Nothing more will be sent."}
    fake = FakeWhatsApp()
    assert await deliver(app, settings, fake) is False and fake.requests == []
    assert scalar(db, "SELECT status FROM outbox") == "cancelled"
    assert (await reply(adviser, lead)).status_code == 409  # and nothing new can be queued


async def test_gate_rechecks_at_delivery(app, settings, client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    await reply(adviser, lead)
    with db.begin() as conn:
        conn.exec_driver_sql("UPDATE system_settings SET kill_switch = true")
    fake = FakeWhatsApp()
    assert await deliver(app, settings, fake) is True and fake.requests == []
    assert tuple(rows(db, "SELECT status, last_error FROM outbox")[0]) == (
        "cancelled",
        "All sending is stopped by the kill switch.",
    )


async def test_closed_whatsapp_window_blocks_free_text(client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    with db.begin() as conn:
        conn.exec_driver_sql("UPDATE leads SET last_inbound_at = now() - interval '25 hours'")
    response = await reply(adviser, lead)
    assert response.status_code == 409 and response.json()["error"]["code"] == "send_blocked"


async def test_daily_cap(client, login, db, agency, app, settings) -> None:
    from dataclasses import replace

    app.state.settings = replace(settings, daily_send_cap=1)
    lead, adviser = await handed_over(client, login, db, agency)
    await reply(adviser, lead)
    await deliver(app, settings, FakeWhatsApp(sent()))
    assert (await reply(adviser, lead)).status_code == 409


@pytest.mark.parametrize(
    ("answer", "status", "retried"),
    [
        (httpx.Response(400, json={"error": {"message": "Recipient not allowed"}}), "failed", False),
        (httpx.Response(429), "pending", True),
        (httpx.ConnectError("refused"), "pending", True),
        (httpx.ReadTimeout("slow"), "unknown", False),
        (httpx.Response(503), "unknown", False),
        (httpx.Response(200, json={}), "unknown", False),
    ],
)
async def test_provider_outcomes_never_fake_success(
    app, settings, client, login, db, agency, answer, status, retried
) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    await reply(adviser, lead)
    await deliver(app, settings, FakeWhatsApp(answer))
    [(got, run_later)] = rows(db, "SELECT status, run_at > now() FROM outbox")
    assert got == status and run_later is retried


async def test_interrupted_delivery_becomes_unknown_not_resent(app, settings, client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    await reply(adviser, lead)
    with db.begin() as conn:  # a worker claimed it and died mid-call
        conn.exec_driver_sql("UPDATE outbox SET status = 'sending', locked_until = now() - interval '1 second'")
    fake = FakeWhatsApp()
    await deliver(app, settings, fake)
    assert fake.requests == [] and scalar(db, "SELECT status FROM outbox") == "unknown"


async def test_status_webhook_resolves_an_unknown_outcome(app, settings, client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    message_id = (await reply(adviser, lead)).json()["id"]
    await deliver(app, settings, FakeWhatsApp(httpx.ReadTimeout("slow")))
    receipt = {
        "id": "wamid.LATE",
        "status": "delivered",
        "timestamp": "1",
        "recipient_id": "971501234567",
        "biz_opaque_callback_data": message_id,
    }
    await post_webhook(client, wa_payload(agency.phone_number_id, statuses=[receipt]))
    assert tuple(rows(db, "SELECT status, provider_ref FROM outbox")[0]) == ("delivered", "wamid.LATE")


async def test_late_accept_of_a_replaced_handoff_does_not_change_owner(client, login, db, agency) -> None:
    lead = await inbound_lead(client, db, agency)
    manager = await login(email(agency, "manager"))
    await manager.post(f"/api/leads/{lead}/handoffs", json={"target_user_id": str(agency.adviser)})
    first = scalar(db, "SELECT id FROM handoffs")
    await manager.post(f"/api/leads/{lead}/handoffs", json={"target_user_id": str(agency.adviser2)})
    sara = await login(email(agency, "adviser"))
    late = await sara.post(f"/api/handoffs/{first}/accept")
    assert late.status_code == 409
    assert scalar(db, "SELECT owner_user_id FROM leads") == agency.adviser2
    assert rows(db, "SELECT status FROM handoffs ORDER BY created_at") == [("cancelled",), ("requested",)]


async def test_return_to_ai(client, login, db, agency) -> None:
    lead, adviser = await handed_over(client, login, db, agency)
    handoff = scalar(db, "SELECT id FROM handoffs WHERE status = 'accepted'")
    assert (await adviser.post(f"/api/handoffs/{handoff}/return")).status_code == 200
    assert scalar(db, "SELECT response_state FROM leads") == "ai"
    assert (await adviser.post(f"/api/handoffs/{handoff}/return")).status_code == 409


async def test_an_adviser_cannot_take_over_a_colleagues_conversation(client, login, db, agency) -> None:
    lead, _ = await handed_over(client, login, db, agency)  # Sara accepted it
    omar = await login(email(agency, "adviser2"))
    takeover = await omar.post(f"/api/leads/{lead}/handoffs", json={"target_user_id": str(agency.adviser2)})
    assert takeover.status_code == 403
    assert scalar(db, "SELECT owner_user_id FROM leads") == agency.adviser


async def test_operators_are_never_handoff_targets(client, login, db, agency) -> None:
    lead = await inbound_lead(client, db, agency)
    manager = await login(email(agency, "manager"))
    response = await manager.post(f"/api/leads/{lead}/handoffs", json={"target_user_id": str(agency.operator)})
    assert response.status_code == 404
