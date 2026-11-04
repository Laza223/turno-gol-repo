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
-- creen y evalúen correctamente.
-- Solo se crea si no existe. Desde la imagen 15.19 de Supabase (CLI 2),
-- `postgres` no puede crear objetos en `auth`, y en un stack de Supabase la
-- función ya está cuando corre esta migración. Editada el 2026-10-30 con OK del
-- dueño: en prod ya estaba aplicada, así que allá no cambia nada.
CREATE SCHEMA IF NOT EXISTS auth;

DO $guard$
BEGIN
  IF to_regprocedure('auth.jwt()') IS NULL THEN
    CREATE FUNCTION auth.jwt() RETURNS jsonb
      LANGUAGE sql STABLE
      AS $$ SELECT coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb,
        '{}'::jsonb
      ) $$;
  END IF;
END $guard$;
