"""Contract SEC-03 / CW-01: two agencies, no cross access through the API or the database role."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from tests.conftest import APP_URL, email, inbound_lead

pytestmark = pytest.mark.anyio


async def test_agencies_never_see_each_other(client, login, db, agency, other_agency) -> None:
    lead_a = await inbound_lead(client, db, agency)
    lead_b = await inbound_lead(client, db, other_agency)
    a = await login(email(agency, "manager"))

    listed = {item["id"] for item in (await a.get("/api/leads")).json()}
    assert listed == {lead_a}
    assert (await a.get(f"/api/leads/{lead_b}")).status_code == 404
    assert (await a.post(f"/api/leads/{lead_b}/stop", json={"reason": "x"})).status_code == 404
    cross_handoff = await a.post(f"/api/leads/{lead_a}/handoffs", json={"target_user_id": str(other_agency.adviser)})
    assert cross_handoff.status_code == 404
    people = {u["email"] for u in (await a.get("/api/users")).json()}
    assert people and all(e.endswith("@a.test") for e in people)


def test_row_level_security_hides_rows_without_an_agency_context(db, agency, other_agency) -> None:
    with db.begin() as conn:  # owner seeds one contact per agency
        for ag in (agency, other_agency):
            conn.execute(
                text("INSERT INTO contacts (agency_id, phone_e164) VALUES (:a, '+971501234567')"), {"a": ag.id}
            )
    app_engine = create_engine(APP_URL)
    try:
        with app_engine.begin() as conn:
            assert conn.execute(text("SELECT count(*) FROM contacts")).scalar() == 0
            conn.execute(text("SELECT set_config('app.agency_id', :a, true)"), {"a": str(agency.id)})
            assert conn.execute(text("SELECT count(*) FROM contacts")).scalar() == 1
            with pytest.raises(ProgrammingError):  # cannot write into another agency
                conn.execute(
                    text("INSERT INTO contacts (agency_id, phone_e164) VALUES (:a, '+971501111111')"),
                    {"a": other_agency.id},
                )
    finally:
        app_engine.dispose()


def test_audit_log_is_append_only_for_the_app(db, agency) -> None:
    app_engine = create_engine(APP_URL)
    try:
        with app_engine.begin() as conn, pytest.raises(ProgrammingError, match="permission denied"):
            conn.execute(text("UPDATE audit_log SET action = 'x'"))
        with app_engine.begin() as conn, pytest.raises(ProgrammingError, match="permission denied"):
            conn.execute(text("DELETE FROM suppressions"))
    finally:
        app_engine.dispose()
