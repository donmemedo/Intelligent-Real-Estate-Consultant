"""Sign in, sign out, current user (contract SEC-01)."""

import asyncio
import logging
import time
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.db import set_agency
from app.errors import TooManyRequests, Unauthorized
from app.models import User, audit
from app.schemas import LoginIn, UserOut
from app.security import (
    LOCKOUT,
    MAX_FAILED_LOGINS,
    CurrentUser,
    DbDep,
    FailedLoginThrottle,
    SettingsDep,
    check_origin,
    clear_session_cookie,
    cookie_name,
    end_session,
    hash_password,
    needs_rehash,
    new_session,
    set_session_cookie,
    verify_password,
)

router = APIRouter(tags=["auth"])
log = logging.getLogger("irec.auth")
INVALID = "The email or password is not correct."
FAILED_LOGIN_SECONDS = 0.3  # above the slowest normal failure (p90 ≈ 0.12 s with argon2)


@router.post("/login", response_model=UserOut)
async def login(payload: LoginIn, request: Request, response: Response, session: DbDep, settings: SettingsDep) -> User:
    started = time.perf_counter()
    check_origin(request, settings)
    throttle: FailedLoginThrottle = request.app.state.login_throttle
    client = request.client.host if request.client else "unknown"
    if not throttle.acquire(client):
        raise TooManyRequests("Too many failed sign-ins from this network. Try again in a few minutes.")
    now = datetime.now(UTC)
    # Row lock for the whole attempt: parallel guesses at one account are serialised, so every
    # failure is counted and the lockout cannot be raced (no lost update on failed_logins).
    user = await session.scalar(select(User).where(User.email == payload.email.lower()).with_for_update())
    locked = user is not None and user.locked_until is not None and user.locked_until > now
    # argon2 is CPU-bound: keep it off the event loop. Unknown and locked accounts cost the same time.
    valid = await run_in_threadpool(
        verify_password, None if locked or user is None else user.password_hash, payload.password
    )
    if user is None or not valid or not user.active:
        if user is not None and not locked:
            await set_agency(session, user.agency_id)
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILED_LOGINS:
                user.locked_until, user.failed_logins = now + LOCKOUT, 0
                session.add(audit(user.agency_id, f"user:{user.id}", "auth.locked", user.id))
            session.add(audit(user.agency_id, f"user:{user.id}", "auth.login_failed", user.id))
            await session.commit()
        log.info("login failed", extra={"fields": {"known_user": user is not None, "locked": locked}})
        # Every failure takes the same total time, so the extra bookkeeping for a real account
        # cannot reveal which emails exist (timing oracle for user enumeration).
        await asyncio.sleep(max(0.0, FAILED_LOGIN_SECONDS - (time.perf_counter() - started)))
        raise Unauthorized(INVALID)

    throttle.release(client)
    await set_agency(session, user.agency_id)
    user.failed_logins, user.locked_until = 0, None
    if needs_rehash(user.password_hash):
        user.password_hash = await run_in_threadpool(hash_password, payload.password)
    token, row = new_session(user, settings)  # a fresh token on every login: no session fixation
    session.add(row)
    session.add(audit(user.agency_id, f"user:{user.id}", "auth.login", user.id))
    await session.commit()
    set_session_cookie(response, token, settings)
    return user


@router.post("/logout", status_code=204)
async def logout(request: Request, session: DbDep, settings: SettingsDep) -> Response:
    check_origin(request, settings)
    token = request.cookies.get(cookie_name(settings))
    if token:
        await end_session(session, token)
        await session.commit()
    response = Response(status_code=204)
    clear_session_cookie(response, settings)
    return response


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user
