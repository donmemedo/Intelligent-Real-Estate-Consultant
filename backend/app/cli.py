"""Operator commands. They run as the schema owner (MIGRATIONS_DATABASE_URL), never as the app role.

    python -m app.cli create-agency "Harbour & Key Real Estate"
    python -m app.cli create-user AGENCY_ID admin@agency.ae "Sara Ahmed" agency_admin
    python -m app.cli add-whatsapp AGENCY_ID PHONE_NUMBER_ID
    python -m app.cli kill-switch on|off

create-user reads the password from IREC_NEW_PASSWORD, or prompts for it.
"""

import argparse
import getpass
import os
import uuid

from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from app.config import _read
from app.models import ROLES, Agency, ChannelAccount, SystemSettings, User
from app.security import hash_password

MIN_PASSWORD = 12


def create_agency(session: Session, name: str) -> Agency:
    agency = Agency(name=name)
    session.add(agency)
    session.flush()
    return agency


def create_user(session: Session, agency_id: uuid.UUID, email: str, name: str, role: str, password: str) -> User:
    if role not in ROLES:
        raise ValueError(f"role must be one of {', '.join(ROLES)}, got {role!r}")
    if len(password) < MIN_PASSWORD:
        raise ValueError(f"password must be at least {MIN_PASSWORD} characters")
    user = User(
        agency_id=agency_id, email=email.strip().lower(), name=name, role=role, password_hash=hash_password(password)
    )
    session.add(user)
    session.flush()
    return user


def add_whatsapp(session: Session, agency_id: uuid.UUID, phone_number_id: str) -> ChannelAccount:
    account = ChannelAccount(agency_id=agency_id, kind="whatsapp", external_id=phone_number_id)
    session.add(account)
    session.flush()
    return account


def set_kill_switch(session: Session, on: bool) -> None:
    session.execute(update(SystemSettings).where(SystemSettings.id == 1).values(kill_switch=on))


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("create-agency").add_argument("name")
    user = commands.add_parser("create-user")
    for arg in ("agency_id", "email", "name", "role"):
        user.add_argument(arg)
    whatsapp = commands.add_parser("add-whatsapp")
    whatsapp.add_argument("agency_id")
    whatsapp.add_argument("phone_number_id")
    commands.add_parser("kill-switch").add_argument("state", choices=["on", "off"])
    args = parser.parse_args()

    url = _read("MIGRATIONS_DATABASE_URL")
    if not url:
        parser.error("MIGRATIONS_DATABASE_URL (or _FILE) must be set")
    with Session(create_engine(url)) as session, session.begin():
        match args.command:
            case "create-agency":
                print(create_agency(session, args.name).id)
            case "create-user":
                password = os.environ.get("IREC_NEW_PASSWORD") or getpass.getpass("Password: ")
                print(create_user(session, uuid.UUID(args.agency_id), args.email, args.name, args.role, password).id)
            case "add-whatsapp":
                print(add_whatsapp(session, uuid.UUID(args.agency_id), args.phone_number_id).id)
            case "kill-switch":
                set_kill_switch(session, args.state == "on")
                print(f"kill switch {args.state}")


if __name__ == "__main__":
    main()
