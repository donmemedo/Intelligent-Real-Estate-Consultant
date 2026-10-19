"""Contract SEC-01 (authentication and sessions), SEC-02 (roles), errors and request ids."""

import pytest
from fastapi import FastAPI

from tests.conftest import PASSWORD, email, new_client, rows, scalar

pytestmark = pytest.mark.anyio


async def test_login_sets_a_host_only_secure_cookie_and_me_works(client, agency) -> None:
    response = await client.post("/api/auth/login", json={"email": email(agency, "adviser"), "password": PASSWORD})
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("__Host-irec_session=")
    assert all(flag in cookie.lower() for flag in ("httponly", "secure", "samesite=lax", "path=/"))
    me = await client.get("/api/auth/me")
    assert me.json()["role"] == "adviser"
    assert "password_hash" not in me.text


async def test_wrong_password_and_unknown_email_get_the_same_answer(client, agency) -> None:
    wrong = await client.post("/api/auth/login", json={"email": email(agency, "adviser"), "password": "nope"})
    unknown = await client.post("/api/auth/login", json={"email": "ghost@a.test", "password": "nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


async def test_five_failures_lock_the_account_even_for_the_right_password(client, agency, db) -> None:
    for _ in range(5):
        await client.post("/api/auth/login", json={"email": email(agency, "adviser"), "password": "wrong"})
    locked = await client.post("/api/auth/login", json={"email": email(agency, "adviser"), "password": PASSWORD})
    assert locked.status_code == 401
    assert scalar(db, "SELECT count(*) FROM audit_log WHERE action = 'auth.locked'") == 1


async def test_logout_ends_the_session_server_side(app: FastAPI, login, agency) -> None:
    c = await login(email(agency, "adviser"))
    token = c.cookies.get("__Host-irec_session")
    assert (await c.post("/api/auth/logout")).status_code == 204
    async with new_client(app) as replay:  # an attacker who copied the old cookie
        replay.cookies.set("__Host-irec_session", token)
        assert (await replay.get("/api/auth/me")).status_code == 401


async def test_expired_session_is_rejected(login, agency, db) -> None:
    c = await login(email(agency, "adviser"))
    with db.begin() as conn:
        conn.exec_driver_sql("UPDATE sessions SET expires_at = now() - interval '1 second'")
    assert (await c.get("/api/auth/me")).status_code == 401


async def test_only_the_token_hash_is_stored(login, agency, db) -> None:
    c = await login(email(agency, "adviser"))
    stored = rows(db, "SELECT token_hash FROM sessions")
    assert len(stored) == 1 and stored[0][0] != c.cookies.get("__Host-irec_session")


@pytest.mark.parametrize("origin", ["https://evil.example", None])
async def test_state_changes_from_another_origin_are_refused(app: FastAPI, login, agency, origin) -> None:
    c = await login(email(agency, "adviser"))
    headers = {"Origin": origin} if origin else {}
    if origin is None:
        del c.headers["Origin"]
    response = await c.post("/api/auth/logout", headers=headers)
    assert response.status_code == 403
    assert (await c.get("/api/auth/me")).status_code == 200  # still signed in: nothing happened


async def test_protected_routes_need_a_session(client, agency) -> None:
    for path in ("/api/leads", "/api/auth/me"):
        assert (await client.get(path)).status_code == 401


async def test_operator_cannot_assign_a_handoff(login, agency) -> None:
    c = await login(email(agency, "operator"))
    response = await c.post(f"/api/leads/{agency.id}/handoffs", json={"target_user_id": str(agency.adviser)})
    assert response.status_code == 403


async def test_errors_have_one_shape_and_echo_a_safe_request_id(client) -> None:
    response = await client.get("/api/leads", headers={"X-Request-ID": "abc12345-req"})
    assert response.status_code == 401
    assert response.headers["x-request-id"] == "abc12345-req"
    assert response.json()["error"] == {
        "code": "unauthorized",
        "message": "Please sign in.",
        "request_id": "abc12345-req",
    }
    injected = await client.get("/api/leads", headers={"X-Request-ID": "bad\nvalue"})
    assert injected.headers["x-request-id"] != "bad\nvalue"


async def test_validation_errors_do_not_echo_input(client) -> None:
    response = await client.post("/api/auth/login", json={"email": "x" * 300, "password": "secret-value", "extra": 1})
    assert response.status_code == 422
    assert "secret-value" not in response.text and "xxxx" not in response.text


async def test_unhandled_errors_hide_internals(app: FastAPI) -> None:
    async def boom() -> None:
        raise RuntimeError("database password is hunter2")

    app.add_api_route("/api/boom", boom)
    async with new_client(app) as c:
        response = await c.get("/api/boom")
    assert response.status_code == 500
    assert "hunter2" not in response.text and response.json()["error"]["code"] == "internal_error"


async def test_docs_are_hidden_in_production(settings) -> None:
    from dataclasses import replace

    from app.main import create_app

    prod = create_app(replace(settings, env="production"))
    async with new_client(prod) as c:
        assert (await c.get("/api/docs")).status_code == 404
        assert (await c.get("/api/openapi.json")).status_code == 404
    await prod.state.engine.dispose()


async def test_parallel_wrong_guesses_cannot_race_the_lockout(client, agency, db) -> None:
    import asyncio

    wrong = {"email": email(agency, "adviser"), "password": "wrong"}
    await asyncio.gather(*(client.post("/api/auth/login", json=wrong) for _ in range(8)))
    right = await client.post("/api/auth/login", json={"email": email(agency, "adviser"), "password": PASSWORD})
    assert right.status_code == 401  # locked: every one of the parallel failures was counted
    assert scalar(db, "SELECT count(*) FROM audit_log WHERE action = 'auth.login_failed'") == 5


async def test_a_parallel_burst_cannot_slip_past_the_throttle(app: FastAPI, client, agency) -> None:
    import asyncio

    from app.security import FailedLoginThrottle

    app.state.login_throttle = FailedLoginThrottle(limit=3)
    burst = [client.post("/api/auth/login", json={"email": f"u{i}@a.test", "password": "x"}) for i in range(10)]
    codes = [r.status_code for r in await asyncio.gather(*burst)]
    assert codes.count(429) == 7 and codes.count(401) == 3


async def test_password_spraying_is_throttled_per_client_but_good_logins_are_not(app: FastAPI, client, agency) -> None:
    from app.security import FailedLoginThrottle

    app.state.login_throttle = FailedLoginThrottle(limit=3)
    for _ in range(3):  # good sign-ins never count
        assert (
            await client.post("/api/auth/login", json={"email": email(agency, "manager"), "password": PASSWORD})
        ).status_code == 200
    for i in range(3):  # a different account each time: per-account lockout would not catch this
        await client.post("/api/auth/login", json={"email": f"user{i}@a.test", "password": "Spring2026!"})
    blocked = await client.post("/api/auth/login", json={"email": email(agency, "manager"), "password": PASSWORD})
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "rate_limited"


async def test_failed_logins_take_constant_time_so_emails_cannot_be_enumerated(client, agency, monkeypatch) -> None:
    import time

    from app.routes import auth

    monkeypatch.setattr(auth, "FAILED_LOGIN_SECONDS", 0.25)
    for mail in ("nobody@a.test", email(agency, "adviser")):  # unknown email, then a real account
        started = time.perf_counter()
        response = await client.post("/api/auth/login", json={"email": mail, "password": "wrong"})
        assert response.status_code == 401 and time.perf_counter() - started >= 0.25
