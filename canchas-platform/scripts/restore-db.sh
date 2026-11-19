#!/usr/bin/env bash
# Restaura un respaldo de backup-db.sh en la BD DESTINO indicada (nunca lee .env.local
# para no pisar producción por accidente).
# Uso: scripts/restore-db.sh backups/canchero-XXXX.dump "postgresql://usuario:clave@host:5432/bd"
# Destino Postgres "puro" (no Supabase): se crean antes los esquemas/roles/extensiones de Supabase.
set -euo pipefail
dump=${1:?ruta del .dump}; destino=${2:?URL postgresql:// de la BD destino}
read -r -p "Se REEMPLAZARÁN las tablas de 'public' en el destino. Escribe RESTAURAR: " ok
[[ $ok == RESTAURAR ]] || { echo "Cancelado"; exit 1; }

psql -v ON_ERROR_STOP=1 -q "$destino" <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
-- En Supabase existe; aquí solo para que las políticas RLS se puedan crear.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
SQL

# Postgres puro: auth.users no existe (vive en Supabase). Se crea un stub solo con ids.
stub=$(psql -tAq "$destino" -c "SELECT to_regclass('auth.users') IS NULL")
[[ $stub == t ]] && psql -q "$destino" -c "CREATE TABLE auth.users (id uuid PRIMARY KEY)"

r() { PGOPTIONS='-c search_path=public,extensions' pg_restore --no-owner --no-privileges \
  --single-transaction --exit-on-error -d "$destino" "$@" "$dump"; }
r --clean --if-exists --section=pre-data
r --section=data
[[ $stub == t ]] && psql -q "$destino" -c \
  "INSERT INTO auth.users SELECT DISTINCT id_auth FROM public.usuario_auth_google ON CONFLICT DO NOTHING"
r --section=post-data
echo "Restauración terminada."
