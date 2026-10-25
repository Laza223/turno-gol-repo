-- ============================================================
-- 103_payments_mp_init_point.sql
-- Guardar el init_point de la preferencia de la seña.
--
-- Racional: pedir el link de nuevo (el bot de WhatsApp, o "Reintentar pago" del
-- portal) creaba OTRA preferencia de MercadoPago con el mismo external_reference,
-- y si el jugador pagaba las dos cobraba la seña dos veces. Con el init_point
-- guardado, `createDepositPayment` reusa la preferencia pendiente vigente en vez
-- de crear otra. Reconstruirlo desde mp_preference_id depende del país de MP y
-- del mock, por eso se guarda.
--
-- Aditiva e inerte: nullable y sin default (en Postgres es solo metadata, no
-- reescribe la tabla). Las filas anteriores quedan en NULL y no se reusan.
--
-- Rollback: ALTER TABLE payments DROP COLUMN mp_init_point; (el código nuevo
-- deja de correr antes, sino rompe).
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mp_init_point text;
