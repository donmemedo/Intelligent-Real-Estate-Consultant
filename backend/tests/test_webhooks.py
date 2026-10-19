"""Contract SEC-06, SEC-07, SEC-08, CW-02, CW-03: WhatsApp intake."""

import pytest

from tests.conftest import VERIFY_TOKEN, post_webhook, rows, scalar, text_message, wa_payload

pytestmark = pytest.mark.anyio


async def test_subscription_handshake(client) -> None:
    ok = await client.get(
        "/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444"},
    )
    assert ok.status_code == 200 and ok.text == "1158201444"
    bad = await client.get(
        "/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "guess", "hub.challenge": "1"}
    )
    assert bad.status_code == 403
    script = await client.get(
        "/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "<script>"},
    )
    assert script.status_code == 422


@pytest.mark.parametrize("secret", ["wrong-secret", ""])
async def test_unsigned_or_badly_signed_posts_are_rejected(client, db, agency, secret) -> None:
    response = await post_webhook(
        client, wa_payload(agency.phone_number_id, [text_message("wamid.1", "hi")]), secret=secret
    )
    assert response.status_code == 401
    assert scalar(db, "SELECT count(*) FROM inbound_messages") == 0


async def test_inbound_message_creates_contact_lead_and_message(client, db, agency) -> None:
    response = await post_webhook(
        client, wa_payload(agency.phone_number_id, [text_message("wamid.1", "Hi, 2BR in Dubai Hills?")])
    )
    assert response.status_code == 200
    [(phone, name)] = rows(db, "SELECT phone_e164, name FROM contacts")
    assert (phone, name) == ("+971501234567", "Maya Khan")
    [(status, response_state, last_inbound)] = rows(db, "SELECT status, response_state, last_inbound_at FROM leads")
    assert (status, response_state) == ("New", "ai") and last_inbound is not None
    assert scalar(db, "SELECT body FROM inbound_messages") == "Hi, 2BR in Dubai Hills?"


async def test_redelivered_webhooks_have_no_second_effect(client, db, agency) -> None:
    payload = wa_payload(agency.phone_number_id, [text_message("wamid.dup", "hello")])
    for _ in range(5):
        assert (await post_webhook(client, payload)).status_code == 200
    counts = rows(
        db,
        "SELECT (SELECT count(*) FROM contacts), (SELECT count(*) FROM leads), "
        "(SELECT count(*) FROM inbound_messages), "
        "(SELECT count(*) FROM audit_log WHERE action = 'inbound.received')",
    )
    assert tuple(counts[0]) == (1, 1, 1, 1)


async def test_invalid_phone_numbers_are_rejected_and_audited(client, db, agency) -> None:
    await post_webhook(client, wa_payload(agency.phone_number_id, [text_message("wamid.bad", "hi", sender="12345")]))
    assert scalar(db, "SELECT count(*) FROM contacts") == 0
    assert scalar(db, "SELECT count(*) FROM audit_log WHERE action = 'inbound.rejected'") == 1


async def test_unknown_whatsapp_number_is_ignored(client, db, agency) -> None:
    response = await post_webhook(client, wa_payload("PNID-UNKNOWN", [text_message("wamid.x", "hi")]))
    assert response.status_code == 200
    assert scalar(db, "SELECT count(*) FROM inbound_messages") == 0


async def test_malformed_but_signed_payload_is_a_400(client, agency) -> None:
    response = await post_webhook(client, {"object": "whatsapp_business_account", "entry": "nope"})
    assert response.status_code == 400 and response.json()["error"]["code"] == "bad_request"


async def test_oversized_body_is_refused(client, agency) -> None:
    payload = wa_payload(agency.phone_number_id, [text_message("wamid.big", "x" * 4000)] * 300)
    assert (await post_webhook(client, payload)).status_code == 413


async def test_customer_stop_suppresses_the_contact(client, db, agency) -> None:
    await post_webhook(client, wa_payload(agency.phone_number_id, [text_message("wamid.1", "Hi")]))
    await post_webhook(client, wa_payload(agency.phone_number_id, [text_message("wamid.2", "STOP")]))
    assert scalar(db, "SELECT status FROM leads") == "Do not contact"
    assert rows(db, "SELECT channel, created_by FROM suppressions") == [("all", "customer")]


async def test_customer_asking_for_a_human_pauses_the_ai(client, db, agency) -> None:
    await post_webhook(client, wa_payload(agency.phone_number_id, [text_message("wamid.1", "human")]))
    assert tuple(rows(db, "SELECT status, response_state FROM leads")[0]) == ("Waiting for adviser", "paused")
