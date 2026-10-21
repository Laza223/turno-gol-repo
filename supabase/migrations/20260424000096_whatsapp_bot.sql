-- ============================================================
-- 096_whatsapp_bot.sql
-- Bot de WhatsApp con IA del complejo (extra pago, piloto por coexistencia).
--
-- Racional: docs/decisions/2026-10-20-bot-whatsapp.md. Lo esencial:
--
-- whatsapp_connections — el número del complejo conectado (vía Kapso, después
--   Tech Provider propio). Una por complejo. `phone_number_id` es el id que
--   Meta manda en cada webhook: el route handler resuelve el complejo con él
--   desde el pool worker (sin contexto de tenant todavía), por eso es UNIQUE
--   global. `enabled` es el corte del día a día por complejo; el flag
--   `whatsapp_bot` es el gate de la feature.
--
-- whatsapp_chats — una conversación = (complejo, teléfono del jugador).
--   `paused_until` calla al bot en ese chat: lo setea el echo del dueño
--   (contestó desde su celular) o el pase a humano. `pause_reason` es un ENUM
--   CERRADO a propósito: nada de texto libre sobre personas (Ley 25.326, veto
--   de CLAUDE.md).
--
-- whatsapp_messages — entrantes, salientes del bot y echoes del dueño. Son a
--   la vez el contexto de la conversación y la instrumentación del piloto
--   (tokens, % de audios). `wa_message_id` UNIQUE es la idempotencia del
--   webhook. `booking_id` + `notice` marcan los avisos al invitado (seña
--   acreditada, hold vencido) para que se manden UNA vez aunque el aviso salga
--   de cuatro caminos distintos.
--   Retención: 30 días (data-retention-cleanup.worker.ts).
--
-- bookings.whatsapp_chat_id — la reserva nació en el bot. Marca el origen y
--   permite avisarle al invitado. SIN foreign key, a propósito: con
--   `ON DELETE SET NULL`, purgar un chat a los 30 días hace un UPDATE sobre sus
--   reservas, y `enforce_booking_invariants_fn` (089) prohíbe todo UPDATE sobre
--   una reserva terminal: el DELETE de la purga abortaba entero y la retención
--   no corría nunca. Sin FK el id sobrevive a la purga y sigue marcando el
--   origen (sirve para medir); el aviso al invitado hace JOIN con
--   whatsapp_chats y, sin chat, no manda nada. La pertenencia del chat al
--   complejo la valida createWhatsappBooking bajo RLS al insertar.
--
-- whatsapp_messages.booking_id — ON DELETE CASCADE y no SET NULL: un aviso
--   exige booking_id (CHECK whatsapp_messages_notice_valid), así que SET NULL
--   haría fallar el borrado de cualquier reserva que tuvo un aviso.
-- ============================================================

-- ─── Tablas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL UNIQUE REFERENCES tenants(id),
  provider              text        NOT NULL DEFAULT 'kapso',
  phone_number_id       text        NOT NULL UNIQUE,
  waba_id               text,
  display_phone_number  text,
  status                text        NOT NULL DEFAULT 'connected',
  enabled               boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_connections_provider_valid CHECK (provider IN ('kapso', 'meta')),
  CONSTRAINT whatsapp_connections_status_valid CHECK (status IN ('connected', 'disconnected'))
);

CREATE TABLE IF NOT EXISTS whatsapp_chats (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id),
  -- Solo dígitos, como lo manda Meta en `from` (ej. 5491155554444).
  wa_phone         text        NOT NULL,
  -- Nombre de perfil que el propio jugador puso en WhatsApp (contacts[].profile.name).
  display_name     text,
  paused_until     timestamptz,
  pause_reason     text,
  last_inbound_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_chats_wa_phone_digits CHECK (wa_phone ~ '^[0-9]{8,15}$'),
  CONSTRAINT whatsapp_chats_pause_reason_valid CHECK (
    pause_reason IS NULL OR pause_reason IN
      ('owner_replied', 'handoff_weather', 'handoff_complaint', 'handoff_event',
       'handoff_other', 'bot_error', 'manual')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_chats_tenant_phone
  ON whatsapp_chats (tenant_id, wa_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_tenant_last_inbound
  ON whatsapp_chats (tenant_id, last_inbound_at DESC);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS whatsapp_chat_id uuid;

-- Parcial: la inmensa mayoría de las reservas no nace en el bot.
CREATE INDEX IF NOT EXISTS idx_bookings_whatsapp_chat
  ON bookings (whatsapp_chat_id)
  WHERE whatsapp_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id),
  chat_id            uuid        NOT NULL REFERENCES whatsapp_chats(id) ON DELETE CASCADE,
  direction          text        NOT NULL,
  -- NULL solo para un saliente que Meta rechazó (no hay id que guardar).
  wa_message_id      text        UNIQUE,
  kind               text        NOT NULL DEFAULT 'text',
  -- Texto del mensaje, o la transcripción de un audio. NULL si no hubo texto.
  body               text,
  -- Entrantes: cuándo los consumió un turno del bot. NULL = pendiente.
  processed_at       timestamptz,
  -- Salientes del bot: consumo de la llamada al modelo (instrumentación).
  input_tokens       integer,
  cached_tokens      integer,
  output_tokens      integer,
  -- Salientes del bot: las llamadas a herramientas y sus resultados de ese
  -- turno (bloques de la API, sin el razonamiento interno). El modelo los
  -- vuelve a ver en los turnos siguientes: sin ellos no sabe qué consultó.
  tool_trace         jsonb,
  booking_id         uuid        REFERENCES bookings(id) ON DELETE CASCADE,
  notice             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_messages_direction_valid CHECK (direction IN ('inbound', 'outbound', 'owner')),
  CONSTRAINT whatsapp_messages_kind_valid CHECK (kind IN ('text', 'audio', 'image', 'interactive', 'other')),
  CONSTRAINT whatsapp_messages_notice_valid CHECK (
    notice IS NULL OR (
      notice IN ('deposit_confirmed', 'hold_expired', 'late_payment_refunded')
      AND booking_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat_created
  ON whatsapp_messages (chat_id, created_at);
-- El rescate de turnos perdidos barre entrantes sin procesar.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_pending
  ON whatsapp_messages (created_at)
  WHERE direction = 'inbound' AND processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_created
  ON whatsapp_messages (tenant_id, created_at);
-- Un aviso por reserva y por tipo: los cuatro caminos que confirman una seña
-- compiten por esta fila, y el que pierde no manda nada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_booking_notice
  ON whatsapp_messages (booking_id, notice)
  WHERE notice IS NOT NULL;
-- El ON DELETE CASCADE busca por booking_id solo, y el índice de arriba es
-- parcial: sin este, cada reserva borrada recorre la tabla entera.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_booking
  ON whatsapp_messages (booking_id);

-- ─── RLS (patrón 062: FORCE + current_setting en scalar subquery) ──

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  op text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_connections', 'whatsapp_chats', 'whatsapp_messages'] LOOP
    FOREACH op IN ARRAY ARRAY['select', 'insert', 'update', 'delete'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_' || op
      ) THEN
        IF op = 'select' THEN
          EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = (SELECT (NULLIF(current_setting(''app.current_tenant_id''::text, true), ''''::text))::uuid))',
            t || '_' || op, t);
        ELSIF op = 'insert' THEN
          EXECUTE format(
            'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting(''app.current_tenant_id''::text, true), ''''::text))::uuid))',
            t || '_' || op, t);
        ELSIF op = 'update' THEN
          EXECUTE format(
            'CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = (SELECT (NULLIF(current_setting(''app.current_tenant_id''::text, true), ''''::text))::uuid)) WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting(''app.current_tenant_id''::text, true), ''''::text))::uuid))',
            t || '_' || op, t);
        ELSE
          EXECUTE format(
            'CREATE POLICY %I ON %I FOR DELETE USING (tenant_id = (SELECT (NULLIF(current_setting(''app.current_tenant_id''::text, true), ''''::text))::uuid))',
            t || '_' || op, t);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ─── Grants ──────────────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 ya otorgan CRUD a turnogol_app y
-- turnogol_worker sobre tablas nuevas. Las tres conservan el CRUD completo.

-- ─── Feature flag ────────────────────────────────────────────
-- Global en false. El override del complejo piloto se carga por SQL como paso
-- operativo (el UUID cambia por entorno), igual que `suspended`.

INSERT INTO feature_flags (key, value, tenant_id)
SELECT 'whatsapp_bot', false, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags WHERE key = 'whatsapp_bot' AND tenant_id IS NULL
);

COMMENT ON TABLE whatsapp_connections IS
  'Número de WhatsApp del complejo conectado al bot (coexistencia). Uno por complejo. phone_number_id es UNIQUE global: el webhook resuelve el complejo con él. enabled = corte por complejo; el flag whatsapp_bot es el gate de la feature. Decisión: docs/decisions/2026-10-20-bot-whatsapp.md.';
COMMENT ON TABLE whatsapp_chats IS
  'Conversación del bot = (complejo, teléfono). paused_until calla al bot (echo del dueño o pase a humano); pause_reason es ENUM cerrado, nunca texto libre. Se purga a los 30 días sin actividad.';
COMMENT ON TABLE whatsapp_messages IS
  'Mensajes del bot: entrantes, salientes y echoes del dueño. wa_message_id UNIQUE = idempotencia del webhook; (booking_id, notice) UNIQUE = un aviso por reserva. Se purgan a los 30 días.';
COMMENT ON COLUMN bookings.whatsapp_chat_id IS
  'Chat del bot de WhatsApp donde nació la reserva (reserva sin cuenta: guest_name/guest_phone). NULL = no vino del bot. Sin FK: sobrevive a la purga del chat (ver cabecera de la 096).';
