-- ============================================================
-- 001_extensions.sql
-- Extensiones PostgreSQL requeridas por TurnoGol (doc13 §9).
-- ============================================================

-- UUIDs como primary keys (alternativa a gen_random_uuid()).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Exclusion constraints sobre tipos no-rango (court_id, day_of_week, etc.)
-- Necesario para no_overlapping_bookings y no_overlapping_abonados.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Búsqueda de texto trigram (nombres de jugadores y complejos).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Supabase auth shim ──────────────────────────────────────────
-- En Supabase real, el schema `auth` y la función `auth.jwt()` los provee la
-- plataforma. En entornos plain-postgres (CI con `postgres:15-alpine`, tests
-- locales sin `supabase start`), creamos un stub equivalente para que las
-- policies que usan `auth.jwt()` (ej. realtime_tenant_select en bookings) se
-- creen y evalúen correctamente. En Supabase real este CREATE OR REPLACE no
-- pisa la implementación oficial porque corre antes que el seed de auth.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  ) $$;
