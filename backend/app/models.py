"""ORM mappings. The schema itself (constraints, RLS, grants) lives in the Alembic migration."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

TZ = DateTime(timezone=True)


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


# Lead statuses (labels shared with the panel).
NEW = "New"
WAITING_FOR_ADVISER = "Waiting for adviser"
IN_CONVERSATION = "In conversation"
DO_NOT_CONTACT = "Do not contact"

ROLES = ("adviser", "manager", "agency_admin", "operator")
SUPERVISORS = ("manager", "agency_admin")


class Agency(Base):
    __tablename__ = "agencies"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(Text, default="Asia/Dubai")
    paused: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    email: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(TZ)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class UserSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(TZ)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class ChannelAccount(Base):
    """A connected sender, e.g. one WhatsApp Business phone number (Meta phone_number_id)."""

    __tablename__ = "channel_accounts"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    kind: Mapped[str] = mapped_column(Text)
    external_id: Mapped[str] = mapped_column(Text)


class SystemSettings(Base):
    __tablename__ = "system_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    kill_switch: Mapped[bool] = mapped_column(default=False)


class Contact(Base):
    __tablename__ = "contacts"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    phone_e164: Mapped[str] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    channel_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("channel_accounts.id"))
    source: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default=NEW)
    response_state: Mapped[str] = mapped_column(Text, default="ai")
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    last_inbound_at: Mapped[datetime | None] = mapped_column(TZ)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now(), onupdate=func.now())


class Suppression(Base):
    """Do-not-contact record. Never deleted by retention or restore (contract SEC-17)."""

    __tablename__ = "suppressions"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    channel: Mapped[str] = mapped_column(Text, default="all")
    reason: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class InboundMessage(Base):
    __tablename__ = "inbound_messages"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id"))
    provider_message_id: Mapped[str] = mapped_column(Text, unique=True)
    kind: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Handoff(Base):
    __tablename__ = "handoffs"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id"))
    target_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(Text, default="requested")
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    accepted_at: Mapped[datetime | None] = mapped_column(TZ)
    closed_at: Mapped[datetime | None] = mapped_column(TZ)


class Outbox(Base):
    """Every outbound effect. Also the delivery queue (status/run_at/locked_until)."""

    __tablename__ = "outbox"
    id: Mapped[uuid.UUID] = uuid_pk()
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id"))
    channel: Mapped[str] = mapped_column(Text, default="whatsapp")
    to_address: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    by_ai: Mapped[bool] = mapped_column(default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    run_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    locked_until: Mapped[datetime | None] = mapped_column(TZ)
    provider_ref: Mapped[str | None] = mapped_column(Text)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(TZ)


class AuditLog(Base):
    """Append-only: the application role has no UPDATE or DELETE on this table."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    actor: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    subject: Mapped[str] = mapped_column(Text)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


def audit(agency_id: uuid.UUID, actor: str, action: str, subject: object, **detail: Any) -> AuditLog:
    """Build an audit row (caller adds it to the session). Never pass secrets or message bodies."""
    return AuditLog(agency_id=agency_id, actor=actor, action=action, subject=str(subject), detail=detail or None)
