#!/usr/bin/env bash
set -euo pipefail

# Provision a disposable local PostgreSQL server for the repository check.
# This never connects to Supabase or any preconfigured remote database.
data_directory="/tmp/orvel_trial_reminder_postgres_${$}"
port="$((55432 + ($$ % 1000)))"

cleanup() {
  if [[ -d "$data_directory" ]]; then
    timeout 10s pg_ctl -D "$data_directory" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$data_directory"
  fi
}
trap cleanup EXIT

if ! command -v initdb >/dev/null 2>&1; then
  for postgres_bin in /usr/lib/postgresql/*/bin; do
    if [[ -x "$postgres_bin/initdb" && -x "$postgres_bin/pg_ctl" ]]; then
      export PATH="$postgres_bin:$PATH"
      break
    fi
  done
fi

for command_name in initdb pg_ctl psql createdb dropdb; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required PostgreSQL command is unavailable: $command_name" >&2
    exit 1
  fi
done

initdb -A trust -U postgres -D "$data_directory" >/dev/null
pg_ctl -D "$data_directory" \
  -l "$data_directory/postgres.log" \
  -o "-h 127.0.0.1 -k $data_directory -p $port" \
  -w start >/dev/null

export PGHOST=127.0.0.1
export PGPORT="$port"
export PGUSER=postgres
export PGDATABASE=postgres

pnpm run test:supabase:trial-reminder
