#!/bin/sh
set -eu

pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" >/dev/null
