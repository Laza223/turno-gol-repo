-- ============================================================
-- 024_player_notification_prefs.sql
-- Preferencias de notificación del jugador (toggles en /perfil).
--
-- notify_email gobierna los emails OPCIONALES al jugador (hoy: recordatorio
-- 24h, booking_reminder). Los transaccionales (confirmación, cancelación)
-- se envían siempre — son comprobantes del servicio, no marketing.
-- notify_push reserva la preferencia para Web Push al jugador (el pipeline
-- actual de push es solo para staff; ver push_subscriptions).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. players es tabla global (sin RLS
-- tenant); el jugador edita su propia fila vía policy por player_id ya
-- existente — las columnas nuevas la heredan.
-- ============================================================

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_push  BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN players.notify_email IS
  'Preferencia del jugador para emails opcionales (recordatorios). Los emails transaccionales (confirmación/cancelación) se envían siempre.';
COMMENT ON COLUMN players.notify_push IS
  'Preferencia del jugador para notificaciones Web Push (pipeline de push al jugador pendiente; hoy solo se persiste la preferencia).';
