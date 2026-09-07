-- ============================================================
-- 086_notifications_sending_since.sql
-- AUD-15 de la auditoría integral del 2026-09-06
-- (docs/audits/2026-09-06-auditoria-integral-fase-diagnostico.md).
--
-- `claimNotificationForSend` pasa la fila de 'queued' a 'sending' y las únicas
-- salidas de 'sending' (markNotificationSent / markNotificationFailed /
-- updateNotificationLastError) viven en la MISMA invocación del worker. Si el
-- proceso muere entre el claim y el marcado — deploy de Railway, OOM, kill —
-- la fila queda en 'sending' para siempre: el barrido de send-email solo mira
-- `status = 'queued'`, así que no se reintenta nunca ni avisa nadie.
--
-- Para reclamarla hace falta saber DESDE CUÁNDO está tomada, y la tabla no
-- tenía ninguna marca de tiempo que sirva:
--   * `queued_at` es del alta y no se mueve en el claim. Usarla implicaría
--     reclamar una fila que entró a la cola hace rato pero cuyo envío arrancó
--     recién — o sea, mandar el mismo mail dos veces.
--   * `created_at` es peor por lo mismo.
--   * `sent_at` / `delivered_at` son posteriores al envío.
--
-- Por eso una columna propia, escrita por el claim y limpiada en cada salida
-- de 'sending'. Nullable y sin backfill: las filas que hoy estén clavadas en
-- 'sending' quedan con NULL, y para ellas `reclaimStalledSendingNotifications`
-- cae a `queued_at` vía coalesce — para una fila abandonada, el alta en la cola
-- es una cota inferior perfectamente buena.
--
-- El índice es parcial sobre 'sending': la cola sana tiene cero o unas pocas
-- filas en ese estado, así que el barrido no paga un scan de la tabla entera.
-- ============================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS sending_since TIMESTAMPTZ;

COMMENT ON COLUMN notifications.sending_since IS
  'Instante del claim que puso la fila en ''sending''. NULL en cualquier otro estado. Lo usa el barrido de send-email para reclamar envíos que quedaron colgados por una caída del worker (AUD-15).';

CREATE INDEX IF NOT EXISTS idx_notifications_sending
  ON notifications (sending_since)
  WHERE status = 'sending';
