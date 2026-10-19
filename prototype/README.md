# Original IREC click-through prototype

This is the original frontend-only product prototype used to validate the first-run experience and the ten main PropAgent journeys. It is retained separately from the production Next.js frontend in `../frontend/`.

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
- Setup completion means a saved preview, never connected intake, enabled sending or operational readiness.
- The guided story names one illustrative property; it is not a recommendation engine or real source verification.

Product and QA references are retained in `../docs/`. The prototype has its own `package.json`, lockfile and TypeScript/Next.js configuration and should be run from this directory.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm check:home-baseline
pnpm check:agent-journeys
pnpm build
```

For the browser walkthrough, keep `pnpm start --port 3200` running in another terminal, then run `pnpm check:walkthrough`. Set `PROTOTYPE_URL` if using a different port. Run related controlled checks under `scripts/` as needed. These do not replace fresh-build browser verification.
