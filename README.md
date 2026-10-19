# Intelligent Real Estate Consultant (IREC)

IREC is an AI-assisted lead-management application for real-estate agencies. The production app is a Next.js frontend backed by a FastAPI API, PostgreSQL, and an outbox worker. The older click-through prototype is retained separately for product/design reference.

## Repository layout

```text
.
├── backend/       # FastAPI API, worker, DB models, Alembic migrations, tests
├── frontend/      # Production Next.js UI
├── deploy/        # Production Compose, Caddy TLS config, DB init and secret examples
├── docs/          # Product, architecture and QA documentation
├── prototype/     # Original frontend-only prototype, tests and its own package files
├── .github/       # CI workflows
├── docker-compose.yml  # Local development stack
└── .env.example   # Local-only environment template
```

## Run locally with Docker Compose

Requirements: Docker Engine or Docker Desktop with the Compose plugin.

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Open **http://localhost:3100**. The API and worker are internal Compose services; PostgreSQL is published only on `127.0.0.1` for local tools. Compose runs the Alembic migrations before starting the API and worker.

The database role and schema are initialized on the first run. To create an agency and its first administrator, run:

```bash
docker compose run --rm migrate python -m app.cli create-agency "Example Realty"
# Copy the agency UUID printed by the previous command into AGENCY_ID.
docker compose run --rm migrate python -m app.cli create-user "$AGENCY_ID" admin@example.com "Agency Admin" agency_admin
```

The `create-user` command prompts for a password (minimum 12 characters). Sign in at `/login` using that email and password. The local stack starts with WhatsApp credentials unset, so webhook verification and outbound sending remain disabled until valid Meta credentials are configured. Do not expose this development Compose stack to the public internet or reuse its local credentials in production.

Useful commands:

```bash
docker compose logs -f api worker
docker compose logs -f frontend
docker compose down                 # stops services; keeps the database volume
docker compose down -v              # DELETES local PostgreSQL data
```

If you change either database password after the database volume has already been initialized, update the role password in PostgreSQL or remove the local volume and re-create it. PostgreSQL's initialization script only runs against an empty data directory.

## Production deployment

The hardened production stack is in [`deploy/compose.yml`](deploy/compose.yml). It uses Caddy for HTTPS, Docker secrets, an internal API/database network, resource limits, read-only containers and a separate worker. Follow the full secret-generation, migration, and domain setup in [`backend/README.md`](backend/README.md). Do not use the root development Compose file as a production deployment.

## Run the prototype separately

The old click-through prototype is isolated under `prototype/` and has its own dependencies and scripts:

```bash
cd prototype
pnpm install
pnpm dev
```

It runs on http://localhost:3000 and uses fictional, frontend-only data; it is not the production app and does not connect to the API. See [`prototype/README.md`](prototype/README.md).
