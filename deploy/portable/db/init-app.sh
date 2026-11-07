#!/bin/sh
# Runs only on a NEW named PG volume; no participant/event seed.
set -eu
app_password="$(cat /run/secrets/db_app_password)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$app_password" <<'SQL'
CREATE ROLE nu_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
GRANT CONNECT ON DATABASE nu_container_demo TO nu_app;
GRANT USAGE, CREATE ON SCHEMA public TO nu_app;
SQL
unset app_password
