#!/bin/sh
# Runs once, on an empty data volume. Creates the application role with its password before the
# first migration; the migration then only grants it least-privilege access (it owns nothing).
set -eu
psql -v ON_ERROR_STOP=1 -v pw="$(cat /run/secrets/db_app_password)" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE irec_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'pw';
SQL
