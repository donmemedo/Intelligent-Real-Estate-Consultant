"""Passwords, sessions, the current user and role checks (contract SEC-01, SEC-02).

Sessions are opaque random tokens; only their SHA-256 is stored, so a database leak does not
leak usable sessions. Logout deletes the row. State-changing requests must come from our own
origin (CSRF), on top of SameSite=Lax cookies.
"""

import hashlib
import secrets
import time
from collections import deque
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import set_agency
from app.errors import Forbidden, Unauthorized
from app.models import SUPERVISORS, User, UserSession

_hasher = PasswordHasher()
# Verified when the email is unknown, so both cases take the same time.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
MAX_FAILED_LOGINS = 5
LOCKOUT = timedelta(minutes=15)


class FailedLoginThrottle:
    """Per-client cap on failed sign-ins, against password spraying across many accounts
    (per-account lockout alone does not stop that). Successful sign-ins are not counted, so a
    whole office behind one IP is never locked out by people who type their password right.
    """

    # ponytail: in-process memory, one API container. Move to Postgres if the API is scaled out.
    def __init__(self, limit: int = 20, window_seconds: float = 900, max_clients: int = 10_000) -> None:
        self.limit, self.window, self.max_clients = limit, window_seconds, max_clients
        self._failures: dict[str, deque[float]] = {}

    def _recent(self, client: str) -> deque[float]:
        failures = self._failures.get(client, deque())
        while failures and failures[0] <= time.monotonic() - self.window:
            failures.popleft()
        return failures

    def acquire(self, client: str) -> bool:
        """Count this attempt *before* the password check, so a burst of parallel requests cannot
        all pass. No await happens between the check and the append, so it is atomic on the loop."""
        recent = self._failures[client] = self._recent(client)
        if len(recent) >= self.limit:
            return False
        recent.append(time.monotonic())
        if len(self._failures) > self.max_clients:  # bound memory: forget the oldest client
            del self._failures[next(iter(self._failures))]
        return True

    def release(self, client: str) -> None:
        """A successful sign-in gives its slot back: only failures count."""
        if recent := self._failures.get(client):
            recent.pop()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def cookie_name(settings: Settings) -> str:
    # __Host- cookies must be Secure, host-only and path=/; browsers then refuse any override.
    return "__Host-irec_session" if settings.secure_cookies else "irec_session"


def new_session(user: User, settings: Settings) -> tuple[str, UserSession]:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours)
    return token, UserSession(token_hash=token_hash(token), user_id=user.id, expires_at=expires)


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        cookie_name(settings),
        token,
        max_age=settings.session_ttl_hours * 3600,
        path="/",
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(cookie_name(settings), path="/", secure=settings.secure_cookies, httponly=True)


def check_origin(request: Request, settings: Settings) -> None:
    if request.method not in SAFE_METHODS and request.headers.get("origin") != settings.public_origin:
        raise Forbidden("This request did not come from the IREC panel.")


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """One database session per request. Routes commit explicitly; anything uncommitted rolls back."""
    async with request.app.state.sessionmaker() as session:
        yield session


DbDep = Annotated[AsyncSession, Depends(get_session)]


async def current_user(request: Request, session: DbDep, settings: SettingsDep) -> User:
    """Resolve the session cookie, then scope the transaction to the user's agency."""
    check_origin(request, settings)
    token = request.cookies.get(cookie_name(settings))
    if not token:
        raise Unauthorized("Please sign in.")
    user = await session.scalar(
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .where(UserSession.token_hash == token_hash(token), UserSession.expires_at > datetime.now(UTC))
    )
    if user is None or not user.active:
        raise Unauthorized("Your session has ended. Please sign in again.")
    await set_agency(session, user.agency_id)
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def can_assign(user: CurrentUser) -> User:
    """Advisers, managers and agency admins may hand a lead to someone; operators may not."""
    if user.role not in ("adviser", *SUPERVISORS):
        raise Forbidden("Your role does not allow this action.")
    return user


CanAssign = Annotated[User, Depends(can_assign)]


async def end_session(session: AsyncSession, token: str) -> None:
    await session.execute(delete(UserSession).where(UserSession.token_hash == token_hash(token)))
