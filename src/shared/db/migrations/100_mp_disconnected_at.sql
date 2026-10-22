-- ============================================================
-- 100_mp_disconnected_at.sql
-- Aviso de MercadoPago desconectado (feature #3, ola 2).
--
-- Racional: docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md
--
-- `tenants.mp_disconnected_at` marca el instante en que TurnoGol comprobó que
-- el permiso OAuth de Checkout Pro del complejo ya no sirve: el refresh del
-- token respondió `invalid_grant` o `unauthorized_client`. Lo escribe
-- `markMpDisconnected` con compare-and-set sobre el refresh token usado y lo
-- limpia cualquier refresh exitoso, la reconexión y el "Desconectar".
--
-- Va en columna y no en `settings` jsonb para que un guardado de Configuración
-- no la pise. Los tokens NO se borran al marcar: la marca es reversible.
--
-- Aditiva e inerte: nullable y sin default (en Postgres es solo metadata, no
-- reescribe la tabla). Ningún código viejo la lee ni la escribe.
--
-- Rollback: ALTER TABLE tenants DROP COLUMN mp_disconnected_at; (el código
-- nuevo deja de correr antes, sino rompe).
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS mp_disconnected_at timestamptz;
