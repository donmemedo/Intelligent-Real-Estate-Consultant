"""Outbox delivery worker. Run with: python -m app.worker

The only process with outbound internet access and sending credentials. Each message is
delivered in one transaction with its lead row locked and the send gate checked again, so a
stop that lands after a message was queued still blocks it (contract SEC-09, CW-11).
"""

import asyncio
import contextlib
import logging
import signal
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import whatsapp
from app.config import Settings, get_settings
from app.db import make_engine, make_sessionmaker, set_agency
from app.errors import SendBlocked
from app.gate import check_send
from app.models import ChannelAccount, Lead, Outbox, audit
from app.observability import configure_logging

log = logging.getLogger("irec.worker")
MAX_ATTEMPTS = 5
POLL_SECONDS = 1.0


async def run_once(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings, http: httpx.AsyncClient) -> bool:
    """Deliver at most one due message. Returns False when nothing was due."""
    async with sessionmaker() as session:
        stuck = await session.scalar(text("SELECT expire_stuck_outbox()"))
        claimed = (await session.execute(text("SELECT id, agency_id FROM claim_outbox()"))).first()
        await session.commit()
    if stuck:
        log.warning("interrupted deliveries marked unknown", extra={"fields": {"count": stuck}})
    if claimed is None:
        return False
    async with sessionmaker() as session:
        await set_agency(session, claimed.agency_id)
        await deliver(session, claimed.id, settings, http)
        await session.commit()
    return True


async def deliver(session: AsyncSession, outbox_id: UUID, settings: Settings, http: httpx.AsyncClient) -> None:
    lead_id = await session.scalar(select(Outbox.lead_id).where(Outbox.id == outbox_id))
    lead = await session.scalar(
        select(Lead).where(Lead.id == lead_id).with_for_update()
    )  # lock order: lead, then outbox
    message = await session.scalar(
        select(Outbox).where(Outbox.id == outbox_id).with_for_update().execution_options(populate_existing=True)
    )
    if lead is None or message is None or message.status != "sending":
        return
    now = datetime.now(UTC)
    message.locked_until = None
    try:
        await check_send(session, lead, settings, by_ai=message.by_ai, exclude_id=message.id)
    except SendBlocked as blocked:
        message.status, message.last_error = "cancelled", blocked.message
        session.add(audit(message.agency_id, "system", "outbox.blocked", message.id, reason=blocked.message))
        return

    account = await session.get(ChannelAccount, lead.channel_account_id)
    phone_number_id = account.external_id if account else ""
    try:
        message.provider_ref = await whatsapp.send_text(
            http, settings, phone_number_id, message.to_address, message.body, callback=str(message.id)
        )
    except whatsapp.RetryLater as exc:
        retry = message.attempts < MAX_ATTEMPTS
        message.status, message.last_error = ("pending" if retry else "failed"), str(exc)
        message.run_at = now + timedelta(seconds=30 * 2 ** (message.attempts - 1))  # 30s, 1m, 2m, 4m
    except whatsapp.OutcomeUnknown as exc:
        message.status, message.last_error = "unknown", str(exc)
    except whatsapp.Rejected as exc:
        message.status, message.last_error = "failed", str(exc)
    else:
        message.status, message.sent_at, message.last_error = "sent", now, None
    session.add(audit(message.agency_id, "system", f"outbox.{message.status}", message.id, attempts=message.attempts))
    log.info("delivery attempt", extra={"fields": {"outbox_id": str(message.id), "status": message.status}})


async def main() -> None:
    configure_logging()
    settings = get_settings()
    engine = make_engine(settings.database_url)
    sessionmaker = make_sessionmaker(engine)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)  # finish the current delivery, then exit
    log.info("worker started")
    async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as http:
        while not stop.is_set():
            try:
                busy = await run_once(sessionmaker, settings, http)
            except Exception:
                log.exception("worker iteration failed")
                busy = False
            if not busy:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), POLL_SECONDS)
    await engine.dispose()
    log.info("worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
