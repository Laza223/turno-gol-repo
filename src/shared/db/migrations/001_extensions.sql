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
