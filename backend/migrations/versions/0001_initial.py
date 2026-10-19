"""Initial schema: tenancy, identity, leads, WhatsApp intake, handoff, gated outbox, audit log.

Security model (contract SEC-03, SEC-14):
- Migrations run as the schema owner. The app connects as `irec_app`, which owns nothing,
  so row-level security applies to it. RLS is not FORCEd: only the owner bypasses it, and the
  two SECURITY DEFINER queue functions below rely on that.
- Tenant tables only show rows whose agency_id equals `app.agency_id` for the current
  transaction. No agency set means no rows.
- audit_log is append-only for the app role.

Revision ID: 0001
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TENANT_TABLES = ("contacts", "leads", "suppressions", "inbound_messages", "handoffs", "outbox", "audit_log")

SCHEMA = """
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'irec_app') THEN
    CREATE ROLE irec_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

CREATE TABLE agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  timezone text NOT NULL DEFAULT 'Asia/Dubai',
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('adviser', 'manager', 'agency_admin', 'operator')),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  kind text NOT NULL CHECK (kind IN ('whatsapp')),
  external_id text NOT NULL,
  UNIQUE (kind, external_id)
);

CREATE TABLE system_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  kill_switch boolean NOT NULL DEFAULT false
);
INSERT INTO system_settings (id) VALUES (1);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\\+[1-9][0-9]{6,14}$'),
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, phone_e164)
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  contact_id uuid NOT NULL UNIQUE REFERENCES contacts(id),
  channel_account_id uuid NOT NULL REFERENCES channel_accounts(id),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'New',
  response_state text NOT NULL DEFAULT 'ai' CHECK (response_state IN ('ai', 'paused', 'human')),
  owner_user_id uuid REFERENCES users(id),
  last_inbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_agency_updated_idx ON leads (agency_id, updated_at DESC);

CREATE TABLE suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  channel text NOT NULL DEFAULT 'all' CHECK (channel IN ('all', 'whatsapp', 'email')),
  reason text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, channel)
);

CREATE TABLE inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  lead_id uuid NOT NULL REFERENCES leads(id),
  provider_message_id text NOT NULL UNIQUE,
  kind text NOT NULL,
  body text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbound_lead_idx ON inbound_messages (lead_id, received_at);

CREATE TABLE handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  lead_id uuid NOT NULL REFERENCES leads(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'returned', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  closed_at timestamptz
);
-- One owner at a time (contract CW-07): at most one open handoff per lead.
CREATE UNIQUE INDEX handoffs_one_open_per_lead ON handoffs (lead_id) WHERE status IN ('requested', 'accepted');

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  lead_id uuid NOT NULL REFERENCES leads(id),
  channel text NOT NULL CHECK (channel IN ('whatsapp')),
  to_address text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4096),
  by_ai boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  provider_ref text UNIQUE,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (agency_id, idempotency_key)
);
CREATE INDEX outbox_due_idx ON outbox (run_at) WHERE status = 'pending';
CREATE INDEX outbox_lead_idx ON outbox (lead_id, created_at);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES agencies(id),
  actor text NOT NULL,
  action text NOT NULL,
  subject text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_agency_created_idx ON audit_log (agency_id, created_at DESC);

-- Queue: claim one due message across agencies. The only cross-tenant read in the app.
CREATE FUNCTION claim_outbox() RETURNS TABLE (id uuid, agency_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  UPDATE outbox o
     SET status = 'sending', attempts = o.attempts + 1, locked_until = now() + interval '5 minutes'
   WHERE o.id = (SELECT q.id FROM outbox q
                  WHERE q.status = 'pending' AND q.run_at <= now()
                  ORDER BY q.run_at FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING o.id, o.agency_id;
$fn$;

-- A worker that died mid-delivery may or may not have sent the message. Never resend blindly:
-- mark it unknown so a status webhook or a human resolves it (contract CW-11, SEC-15).
CREATE FUNCTION expire_stuck_outbox() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  WITH stuck AS (
    UPDATE outbox
       SET status = 'unknown', locked_until = NULL,
           last_error = 'Delivery was interrupted; the outcome is unknown and was not retried.'
     WHERE status = 'sending' AND locked_until < now()
    RETURNING 1)
  SELECT count(*)::integer FROM stuck;
$fn$;
REVOKE ALL ON FUNCTION claim_outbox(), expire_stuck_outbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_outbox(), expire_stuck_outbox() TO irec_app;

-- Grants: least privilege for the app role.
GRANT USAGE ON SCHEMA public TO irec_app;
GRANT SELECT ON agencies, channel_accounts, system_settings TO irec_app;
GRANT SELECT, UPDATE (failed_logins, locked_until, password_hash) ON users TO irec_app;
GRANT SELECT, INSERT, DELETE ON sessions TO irec_app;
GRANT SELECT, INSERT, UPDATE ON contacts, leads, inbound_messages, handoffs, outbox TO irec_app;
GRANT SELECT, INSERT ON suppressions, audit_log TO irec_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO irec_app;
"""


def upgrade() -> None:
    op.execute(SCHEMA)
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY agency_isolation ON {table} "
            "USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) "
            "WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)"
        )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS claim_outbox(), expire_stuck_outbox()")
    op.execute(
        "DROP TABLE IF EXISTS audit_log, outbox, handoffs, inbound_messages, suppressions, leads, contacts, "
        "system_settings, channel_accounts, sessions, users, agencies"
    )
