-- ============================================================
-- 122_whatsapp_owner_alert_phone.sql
-- Teléfono de aviso de derivaciones del bot, uno por complejo.
--
-- La alerta de "pasar a una persona" lleva nombre y teléfono del jugador y el
-- motivo. Hasta acá salía a un único número global (variable de entorno): con
-- dos complejos con bot, los datos de los jugadores de uno le llegaban a otro
-- (Ley 25.326). El número pasa a vivir en la conexión de cada complejo, lo
-- carga el dueño en Ajustes y la fila ya está bajo RLS (096).
--
-- NULL = sin alerta por WhatsApp; queda el push al panel. Se guarda con `+`
-- adelante para que un número de otro país no se relea como argentino.
--
-- Aditiva y nullable: el código anterior la ignora.
-- ============================================================

ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS owner_alert_phone text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_connections_owner_alert_phone_valid'
  ) THEN
    ALTER TABLE whatsapp_connections
      ADD CONSTRAINT whatsapp_connections_owner_alert_phone_valid
      CHECK (owner_alert_phone IS NULL OR owner_alert_phone ~ '^\+[0-9]{8,15}$');
  END IF;
END $$;

COMMENT ON COLUMN whatsapp_connections.owner_alert_phone IS
  'WhatsApp personal que carga el dueño del complejo para recibir las derivaciones del bot. Formato +<dígitos>. NULL = solo push.';
