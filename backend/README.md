# IREC backend

FastAPI API plus an outbox worker on PostgreSQL. It covers leads from WhatsApp, Do-not-contact, adviser handoff and gated human replies.

Contract IDs (CW-xx and SEC-xx in `../docs/IREC V1.pdf`) are cited in code where a rule comes from.

## Layout

| Path | What it does |
|---|---|
| `app/main.py` | App factory, error handlers, `/api/healthz` |
| `app/routes/` | `auth` (login, logout, me), `leads` (list, detail, stop, handoff, reply), `webhooks` (WhatsApp) |
| `app/domain.py` | Pure rules for stop, handoff, inbound keywords and phone numbers, ported from the prototype's `lib/*.ts` |
| `app/actions.py` | State changes shared by the API and the webhook |
| `app/gate.py` | **The send gate.** Checks the kill switch, agency pause, Do-not-contact, ownership, the WhatsApp 24-hour window and the daily cap. It runs when a message is queued and again at delivery. |
| `app/worker.py` | Outbox delivery. It is the only code that calls WhatsApp, and the only process with the sending token and internet access. |
| `app/security.py` | argon2 passwords, hashed server-side sessions, `__Host-` cookie, Origin check (CSRF), roles |
| `migrations/` | Schema, row-level security, least-privilege grants, queue functions |
| `app/cli.py` | Operator bootstrap commands: agency, user, WhatsApp number, kill switch |

## Guarantees and where they are tested

| Guarantee | Test |
|---|---|
| An agency only ever sees its own rows. Postgres RLS enforces this even if a query forgets the filter. | `tests/test_isolation.py` |
| A stop recorded after a message was queued still prevents the send. | `test_outbox.py::test_stop_after_queueing_cancels_the_send` |
| A redelivered webhook or a repeated `Idempotency-Key` has no second effect. | `test_webhooks.py`, `test_outbox.py` |
| A provider error or timeout is never reported as sent. An interrupted delivery becomes `unknown` and is not resent. | `test_outbox.py` |
| A late or duplicate handoff acceptance never changes the owner. | `test_outbox.py`, `test_domain.py` |
| Sessions die on logout and on expiry. Five failed logins lock the account. | `tests/test_auth.py` |

## Develop

The backend container uses Python 3.13.6. For local development, use Python 3.13.x and generate a compatible lockfile before syncing dependencies. The old bundled lockfile targeted Python 3.14 and has been omitted; commit the newly generated `uv.lock` if you need repeatable, pinned dependency resolution.

```bash
uv lock --python 3.13.6
uv sync
export TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/irec_test  # throwaway DB
uv run pytest          # rebuilds the schema with the real migration
uv run ruff check . && uv run ruff format --check . && uv run mypy app
```

**Run the API locally.** It needs Postgres with migrations applied.

```bash
export MIGRATIONS_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost/irec
uv run alembic upgrade head
psql postgresql://postgres:postgres@localhost/irec -c "ALTER ROLE irec_app PASSWORD 'dev-only'"
export DATABASE_URL=postgresql+psycopg://irec_app:dev-only@localhost/irec PUBLIC_ORIGIN=http://localhost:3100 IREC_ENV=development
uv run uvicorn app.main:create_app --factory --reload   # docs at /api/docs (not in production)
uv run python -m app.worker
```

## Configuration

Every setting can also be given as `NAME_FILE`, a path to a secret file; the file takes precedence.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | api, worker | Connects as `irec_app`, which owns nothing and is subject to RLS |
| `MIGRATIONS_DATABASE_URL` | alembic, cli | The schema owner |
| `PUBLIC_ORIGIN` | api | e.g. `https://irec.example.com`. Non-GET requests must come from this origin. |
| `IREC_ENV` | all | `production` hides `/api/docs`; any value except `development` requires secure cookies |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | api | Webhook signature check and subscription handshake. If unset, verification fails closed. |
| `WHATSAPP_TOKEN` | worker only | Cloud API bearer token |
| `SESSION_TTL_HOURS` (12), `DAILY_SEND_CAP` (500) | api, worker | |

## Deploy

For local development, use the root `docker-compose.yml`. For production, see `../deploy/compose.yml`, which runs Caddy (TLS), the frontend, the API, the worker and Postgres 18.

The containers are hardened:

- read-only filesystems
- all capabilities dropped
- no-new-privileges
- resource limits
- internal networks: only the worker can reach the internet

**First deployment:**

```bash
mkdir -m 700 deploy/secrets   # git-ignored; files must be readable by the container users
printf '%s' "$(openssl rand -hex 24)" > deploy/secrets/db_owner_password
printf '%s' "$(openssl rand -hex 24)" > deploy/secrets/db_app_password
printf 'postgresql+psycopg://irec_app:%s@db/irec' "$(cat deploy/secrets/db_app_password)" > deploy/secrets/database_url
printf 'postgresql+psycopg://irec_owner:%s@db/irec' "$(cat deploy/secrets/db_owner_password)" > deploy/secrets/migrations_database_url
# plus whatsapp_app_secret, whatsapp_verify_token, whatsapp_token from the Meta app
chmod 444 deploy/secrets/*
cp deploy/.env.example deploy/.env    # set IREC_DOMAIN
docker compose -f deploy/compose.yml --env-file deploy/.env up -d db
docker compose -f deploy/compose.yml --env-file deploy/.env run --rm migrate
docker compose -f deploy/compose.yml --env-file deploy/.env run --rm migrate python -m app.cli create-agency "Agency name"
docker compose -f deploy/compose.yml --env-file deploy/.env up -d
```

**Kill switch:**

```bash
docker compose -f deploy/compose.yml run --rm migrate python -m app.cli kill-switch on
```

The worker checks it before every delivery, so nothing more is sent once it is on.
