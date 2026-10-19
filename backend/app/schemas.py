"""API request and response models. Inputs reject unknown fields and cap every length (SEC-06)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginIn(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)  # caps argon2 work per request


class StopIn(Input):
    reason: str = Field(min_length=1, max_length=500)


class HandoffIn(Input):
    target_user_id: UUID


class MessageIn(Input):
    body: str = Field(min_length=1, max_length=4096)


class UserOut(Output):
    id: UUID
    agency_id: UUID
    email: str
    name: str
    role: str


class ActionResult(BaseModel):
    changed: bool
    message: str


class HandoffOut(Output):
    id: UUID
    target_user_id: UUID
    status: str
    created_at: datetime
    accepted_at: datetime | None


class OutboxOut(Output):
    id: UUID
    status: str
    body: str
    created_by: UUID | None
    created_at: datetime
    sent_at: datetime | None
    last_error: str | None


class ConversationItem(BaseModel):
    direction: Literal["in", "out"]
    body: str
    at: datetime
    status: str | None = None  # delivery status for outbound messages


class LeadSummary(BaseModel):
    id: UUID
    name: str | None
    phone: str
    status: str
    response_state: str
    owner_user_id: UUID | None
    last_inbound_at: datetime | None
    updated_at: datetime


class LeadDetail(LeadSummary):
    open_handoff: HandoffOut | None
    conversation: list[ConversationItem]
