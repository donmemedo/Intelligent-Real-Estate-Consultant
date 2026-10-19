"""Runtime configuration from the environment (12-factor).

Every value can also be given as NAME_FILE pointing at a file (Docker/Compose secrets);
the file wins. Secrets therefore never need to live in the image or in plain env vars.
"""

import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path


def _read(name: str, default: str | None = None) -> str | None:
    path = os.environ.get(f"{name}_FILE")
    if path:
        return Path(path).read_text().strip()
    return os.environ.get(name, default)


def _require(name: str) -> str:
    value = _read(name)
    if not value:
        raise RuntimeError(f"{name} (or {name}_FILE) must be set")
    return value


@dataclass(frozen=True)
class Settings:
    """Validated settings. WhatsApp values are optional: each process gets only what it uses,
    and every check that needs a missing value fails closed."""

    env: str
    database_url: str
    public_origin: str
    session_ttl_hours: int = 12
    daily_send_cap: int = 500
    whatsapp_app_secret: str | None = None
    whatsapp_verify_token: str | None = None
    whatsapp_token: str | None = None
    whatsapp_api_base: str = "https://graph.facebook.com/v24.0"

    @property
    def production(self) -> bool:
        return self.env == "production"

    @property
    def secure_cookies(self) -> bool:
        return self.env != "development"


@cache
def get_settings() -> Settings:
    defaults = Settings(env="", database_url="", public_origin="")
    return Settings(
        env=_read("IREC_ENV", "development") or "development",
        database_url=_require("DATABASE_URL"),
        public_origin=_require("PUBLIC_ORIGIN").rstrip("/"),
        session_ttl_hours=int(_read("SESSION_TTL_HOURS") or defaults.session_ttl_hours),
        daily_send_cap=int(_read("DAILY_SEND_CAP") or defaults.daily_send_cap),
        whatsapp_app_secret=_read("WHATSAPP_APP_SECRET"),
        whatsapp_verify_token=_read("WHATSAPP_VERIFY_TOKEN"),
        whatsapp_token=_read("WHATSAPP_TOKEN"),
        whatsapp_api_base=_read("WHATSAPP_API_BASE") or defaults.whatsapp_api_base,
    )
