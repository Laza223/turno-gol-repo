-- ============================================================
-- 101_plus_billing.sql
-- Cobro automático de TurnoGol Plus (Asistente de WhatsApp), Fase A.
--
-- Racional: docs/decisions/2026-10-22-cobro-turnogol-plus.md (P1-P11).
--
-- Plus se suma al monto del MISMO débito del plan (P1): un preapproval por
-- complejo. Estas columnas dicen si el débito lleva Plus, a qué precio y qué
-- pasa en las bajas y en el alta de un anual ya pago.
--
--   plus_enabled                Plus va en el débito. Es lo único que mueve el monto:
--                               nunca el override del flag `whatsapp_bot`.
--   plus_price_per_court_cents  Precio especial por cancha y por mes. NULL = lista.
--                               Tiene que ser > 0 (P10): regalar Plus se decide aparte.
--   plus_access_until           Baja agendada: el débito ya no lleva Plus pero el bot
--                               sigue hasta este instante (fin del período pago).
--   plus_prorate_cents /        Cotización congelada del alta en un anual ya pago
--   plus_prorate_months /       (P7), pendiente de que el dueño pague el link.
--   plus_prorate_period_end /   `period_end` es el current_period_end contra el que se
--   plus_prorate_quoted_at      cotizó (si el año renovó, la cotización venció) y
--                               `quoted_at` cuándo (un pago anterior no la acredita).
--                               Van las cuatro o ninguna.
--
-- Aditiva e inerte: todas las filas existentes quedan con plus_enabled=false y el
-- resto en NULL, así que ningún monto cambia. En Postgres, ADD COLUMN con default
-- constante no reescribe la tabla.
--
-- El índice parcial es para el barrido diario de vencimiento (dunning-retry):
-- solo indexa las bajas agendadas, que son pocas.
--
-- tenant_subscriptions no tiene GRANTs por columna ni triggers que filtren
-- columnas (solo el set_updated_at y las policies tenant_isolation_*, que son
-- por fila): las columnas nuevas heredan los permisos de la tabla.
--
-- Rollback: el código nuevo deja de correr antes, sino rompe.
--   DROP INDEX IF EXISTS idx_tenant_subs_plus_access_until;
--   ALTER TABLE tenant_subscriptions
--     DROP COLUMN plus_prorate_quoted_at, DROP COLUMN plus_prorate_period_end,
--     DROP COLUMN plus_prorate_months, DROP COLUMN plus_prorate_cents,
--     DROP COLUMN plus_access_until, DROP COLUMN plus_price_per_court_cents,
--     DROP COLUMN plus_enabled;
-- ============================================================

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS plus_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plus_price_per_court_cents integer,
  ADD COLUMN IF NOT EXISTS plus_access_until timestamptz,
  ADD COLUMN IF NOT EXISTS plus_prorate_cents integer,
  ADD COLUMN IF NOT EXISTS plus_prorate_months smallint,
  ADD COLUMN IF NOT EXISTS plus_prorate_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS plus_prorate_quoted_at timestamptz;

ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subs_plus_price_positive
    CHECK (plus_price_per_court_cents IS NULL OR plus_price_per_court_cents > 0),
  ADD CONSTRAINT tenant_subs_plus_prorate_cents_positive
    CHECK (plus_prorate_cents IS NULL OR plus_prorate_cents > 0),
  ADD CONSTRAINT tenant_subs_plus_prorate_months_range
    CHECK (plus_prorate_months IS NULL OR plus_prorate_months BETWEEN 1 AND 12),
  ADD CONSTRAINT tenant_subs_plus_prorate_pair
    CHECK (
      (plus_prorate_cents IS NULL) = (plus_prorate_months IS NULL)
      AND (plus_prorate_cents IS NULL) = (plus_prorate_period_end IS NULL)
      AND (plus_prorate_cents IS NULL) = (plus_prorate_quoted_at IS NULL)
    );

CREATE INDEX IF NOT EXISTS idx_tenant_subs_plus_access_until
  ON tenant_subscriptions (plus_access_until)
  WHERE plus_access_until IS NOT NULL;
