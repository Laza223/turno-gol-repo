-- ============================================================
-- 028 — Eliminar "Falta Uno" (partidos abiertos)
-- ============================================================
-- Decisión de negocio (2026-06-18): la feature de partidos abiertos sale de v1
-- y se rediseñará desde cero más adelante. Se elimina TODO rastro en DB:
-- tablas open_matches/open_match_players, sus triggers, funciones y el enum.
--
-- Las tablas se crearon en 018_open_matches.sql; los triggers/funciones se
-- reescribieron en 020_public_backend_review_fixes.sql. Esos archivos quedan
-- como historia; esta migración revierte su efecto (convergencia para DBs
-- locales ya migradas y create→drop inocuo en DBs nuevas).
-- ============================================================

-- Tablas (CASCADE limpia índices, policies RLS y triggers asociados).
DROP TABLE IF EXISTS open_match_players CASCADE;
DROP TABLE IF EXISTS open_matches CASCADE;

-- Funciones SECURITY DEFINER del bookkeeping de cupos (no caen con la tabla).
DROP FUNCTION IF EXISTS enforce_open_match_join() CASCADE;
DROP FUNCTION IF EXISTS sync_open_match_slots() CASCADE;
DROP FUNCTION IF EXISTS enforce_open_match_immutable() CASCADE;

-- Enum del estado del partido.
DROP TYPE IF EXISTS open_match_status;
