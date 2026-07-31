-- ============================================================
-- 068_trial_warning_tracking.sql
-- Idempotencia del aviso de fin de prueba.
--
-- El problema: la prueba gratuita vence a los 30 días y
-- `expire-trials.worker.ts` manda el complejo a `blocked` DIRECTO, sin ningún
-- aviso previo. Las plantillas `trial_welcome` / `trial_ending` existían desde
-- siempre pero ningún `enqueueNotification` las referenciaba: el dueño se
-- despertaba con el complejo apagado y sin haber recibido nada.
--
-- Por qué hace falta una columna: en el sweep de dunning la idempotencia sale
-- gratis de la máquina de estados — la notificación va adentro de una
-- transición (`past_due` → `suspended`) que por definición ocurre una sola vez,
-- así que el barrido del día siguiente ya no lo levanta. El aviso de prueba NO
-- tiene transición: el complejo sigue en `trialing` antes y después de que se
-- le avise. Sin registrar nada, el cron diario le mandaría el mismo mail todos
-- los días hasta que venza.
--
-- Guarda el umbral MÁS CHICO ya avisado (no un booleano ni un timestamp) para
-- soportar varios avisos escalonados con una sola columna: se avisa el umbral T
-- sólo si `trial_warning_days_sent` es NULL o mayor que T. Con umbrales [7, 1]:
-- primero queda en 7, después en 1, y nunca se repite ninguno. Un timestamp no
-- alcanzaría — no distingue CUÁL de los dos avisos se mandó.
--
-- NULL = todavía no se le avisó nada. Los complejos que ya existen arrancan en
-- NULL y por lo tanto reciben su aviso normalmente si les queda tiempo.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_warning_days_sent integer;

COMMENT ON COLUMN tenants.trial_warning_days_sent IS
  'Umbral en días del último aviso de fin de prueba enviado (el más chico). NULL = ninguno. Gate de idempotencia del cron expire-trials.';
