"""Database engine, sessions and the per-transaction tenant context.

Tenant tables have row-level security (see migrations/versions/0001_initial.py). A query only
sees rows of the agency set with `set_agency()` in the *current transaction*; with no agency
set it sees nothing. That makes a forgotten `WHERE agency_id = ...` fail closed.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def set_agency(session: AsyncSession, agency_id: UUID) -> None:
    """Scope the current transaction to one agency (transaction-local, like SET LOCAL)."""
    await session.execute(text("SELECT set_config('app.agency_id', :id, true)"), {"id": str(agency_id)})
