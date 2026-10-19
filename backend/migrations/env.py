"""Alembic environment. Runs as the schema owner: MIGRATIONS_DATABASE_URL (or _FILE), never the app role."""

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import _read

url = context.config.get_main_option("sqlalchemy.url") or _read("MIGRATIONS_DATABASE_URL")
if not url:
    raise RuntimeError("MIGRATIONS_DATABASE_URL (or _FILE) must be set")

engine = create_engine(url, poolclass=pool.NullPool)
with engine.connect() as connection:
    context.configure(connection=connection, transaction_per_migration=True)
    with context.begin_transaction():
        context.run_migrations()
