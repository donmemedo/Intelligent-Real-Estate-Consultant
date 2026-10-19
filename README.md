# IREC

AI lead team for real-estate agencies. WhatsApp enquiries are captured per agency, a person can take over, stop is always honoured, and every send passes one gate.

| Folder | What it is |
|---|---|
| `backend/` | FastAPI API and outbox worker on PostgreSQL (row-level security). Setup, configuration and tests: [backend/README.md](backend/README.md) |
| `frontend/` | Next.js panel: sign-in, leads, handoff, adviser replies, stop contact |
| `deploy/` | Docker Compose stack: Caddy (TLS), frontend, api, worker, Postgres 18 |
| `docs/` | Contract mapping, implementation plan and security reports |
| repo root (`app/`, `components/`, `lib/`, `scripts/`) | The original click-through prototype, kept as the design reference |

**Local development:** start the backend (see its README) on port 8000, then:

```bash
cd frontend && pnpm install && BACKEND_URL=http://127.0.0.1:8000 pnpm dev   # http://localhost:3100
```

---

## Original prototype (repo root)

A clickable, frontend-only product prototype for validating the first-run experience and the ten main PropAgent journeys.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Prototype routes

- `/welcome` - first entry and product promise
- `/demo` - branching, stateful lead simulation for first-time users
- `/leads` - persistent interactive lead inbox and lead-detail workspace
- `/setup` - guided eight-step setup
- `/home` - outcome-first agency home
- `/team` - nine agent workspaces plus one shared lead journey
- `/agents/[id]` - four interactive scenarios for each role, including the normal path, visible result, next-action owner and primary exception
- `/journey` - interactive end-to-end lead story

The ten journey entries are Lead journey, Lead Agent, WhatsApp Agent, Voice Agent, Knowledge Agent, Property Recommendation Agent, Appointment Agent, Manager & Sales Coach, Email Agent, and Orchestrator & Shared Memory.

## Boundaries

- Uses fictional data only.
- Does not call, message, write to a CRM or connect to a provider.
- Does not represent production security, integrations or backend readiness.
- Current Sample contracts, acceptance evidence and unresolved decisions are in [the fix plan](docs/product/reviews/mvp-fix-plan.md). Historical results are not evidence for a newer build.
- Setup completion means a saved preview, never connected intake, enabled sending or operational readiness.
- Sample D1 separates blocked communication from explicit internal meeting keep/cancel. Sample D2 separates lead owner, response control and meeting owner; handoff needs explicit simulated acceptance.
- D1/D2 production permissions, D3, authoritative property sources and final qualification criteria remain product decisions, not implemented policy.
- The guided story names one illustrative property; it is not a recommendation engine or real source verification. Its pending next step is not completed by ending the story.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm check:home-baseline
pnpm check:agent-journeys
pnpm build
```

For the browser walkthrough, keep `pnpm start --port 3200` running in another terminal, then run `pnpm check:walkthrough`. Set `PROTOTYPE_URL` if using a different port. The check uses an isolated Chrome profile and fictional data, not the reviewer's saved setup.

See [Founder review guide](docs/FOUNDER_REVIEW_GUIDE.md) and [final review evidence](docs/QA_REVIEW_2026-09-23.md).
Run related controlled checks with `node scripts/check-sample-wrapup.cjs` (B7),
`check-lead-actions.cjs`, `check-lead-activity.cjs`, `check-lead-navigation.cjs`,
`check-lead-tasks.cjs`, `check-lead-handoff.cjs` and `check-lead-meetings.cjs`
(each under `scripts/`). These do not replace fresh-build browser verification.
