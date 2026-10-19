#!/bin/sh
# Local-development initializer only. Production uses db-init.sh and Docker secrets.
set -eu
: "${IREC_DB_APP_PASSWORD:?IREC_DB_APP_PASSWORD must be set}"
psql -v ON_ERROR_STOP=1 -v pw="$IREC_DB_APP_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE irec_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'pw';
SQL
