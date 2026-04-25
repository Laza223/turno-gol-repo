-- ============================================================
-- 005_triggers.sql
-- Funciones y triggers (doc13 §4 + Fixes Fase 2/3).
--
-- Fixes aplicados:
--   * #6  F2: enforce_booking_invariants_fn() unificado (5 estados terminales + price_snapshot inmutable).
--   * #9  F2: prevent_duplicate_active_ban() — reemplaza el índice parcial uq_tenant_player_active_ban.
--   * #2  F3: COMMENT ON FUNCTION prevent_duplicate_active_ban (NO ON INDEX, ese índice no existe).
--   * #19 F3: validate_notification_recipient() — recipient_id existe en la tabla correspondiente al recipient_type.
-- ============================================================

-- ─── trigger_set_updated_at (doc13 §4.1) ─────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_set_updated_at() IS
  'Setea NEW.updated_at = NOW() en BEFORE UPDATE. Usar en tablas con columna updated_at.';

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON courts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON abonados
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── enforce_booking_invariants_fn (Fix #6 Fase 2) ────────────────
-- Trigger único que cubre:
--   1. Inmutabilidad post-terminal: si OLD.status ∈ {completed, no_show, expired,
--      canceled_refunded, canceled_no_refund}, NINGÚN campo puede modificarse.
--   2. Inmutabilidad de price_snapshot en CUALQUIER estado (incluso pending_payment → confirmed).
-- Reemplaza los triggers viejos enforce_booking_immutability + enforce_price_snapshot_immutability.
CREATE OR REPLACE FUNCTION enforce_booking_invariants_fn()
RETURNS TRIGGER AS $$
BEGIN
  -- Regla 2: price_snapshot es inmutable SIEMPRE.
  IF NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    RAISE EXCEPTION 'price_snapshot es inmutable (intento de modificar de % a %)',
      OLD.price_snapshot, NEW.price_snapshot
      USING ERRCODE = 'check_violation';
  END IF;

  -- Regla 1: si el booking ya está en estado terminal, bloquear cualquier UPDATE.
  IF OLD.status IN (
       'completed',
       'no_show',
       'expired',
       'canceled_refunded',
       'canceled_no_refund'
     )
  THEN
    RAISE EXCEPTION 'Booking en estado terminal (%) no puede modificarse', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_booking_invariants_fn() IS
  'Fix #6 F2: unifica enforce_booking_immutability + enforce_price_snapshot_immutability. '
  'Bloquea cualquier UPDATE sobre bookings en estado terminal y mantiene price_snapshot inmutable.';

CREATE TRIGGER enforce_booking_invariants
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_booking_invariants_fn();

-- ─── prevent_duplicate_active_ban (Fix #9 F2 + Fix #2 F3) ────────
-- Valida unicidad de bans activos por (tenant_id, player_id).
-- Un ban es activo si banned_until IS NULL (permanente) o banned_until > NOW().
-- Reemplaza el índice parcial uq_tenant_player_active_ban (NOW() no es IMMUTABLE).
CREATE OR REPLACE FUNCTION prevent_duplicate_active_ban()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tenant_player_bans
    WHERE tenant_id = NEW.tenant_id
      AND player_id = NEW.player_id
      AND (banned_until IS NULL OR banned_until > NOW())
  ) THEN
    RAISE EXCEPTION
      'Ya existe un ban activo para player_id=% en tenant_id=%',
      NEW.player_id, NEW.tenant_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_duplicate_active_ban() IS
  'Fix #9 F2: garantiza que no exista más de un ban activo por (tenant_id, player_id). '
  'Implementación dinámica con NOW() (no se puede expresar como índice parcial IMMUTABLE).';

CREATE TRIGGER enforce_single_active_ban
  BEFORE INSERT ON tenant_player_bans
  FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_active_ban();

-- ─── validate_notification_recipient (Fix #19 F3) ─────────────────
-- Valida que notifications.recipient_id exista en la tabla correspondiente al recipient_type:
--   * 'player'        → players.id
--   * 'staff'         → staff_users.id
--   * 'tenant_owner'  → tenant_staff_members(staff_user_id, tenant_id, is_active=true)
-- doc13 NO define este trigger; se diseña desde cero.
CREATE OR REPLACE FUNCTION validate_notification_recipient()
RETURNS TRIGGER AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NEW.recipient_type = 'player' THEN
    SELECT EXISTS (SELECT 1 FROM players WHERE id = NEW.recipient_id)
    INTO v_exists;

  ELSIF NEW.recipient_type = 'staff' THEN
    SELECT EXISTS (SELECT 1 FROM staff_users WHERE id = NEW.recipient_id)
    INTO v_exists;

  ELSIF NEW.recipient_type = 'tenant_owner' THEN
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION
        'recipient_type=tenant_owner requiere tenant_id NOT NULL'
        USING ERRCODE = 'not_null_violation';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM tenant_staff_members
      WHERE staff_user_id = NEW.recipient_id
        AND tenant_id    = NEW.tenant_id
        AND is_active    = true
    )
    INTO v_exists;

  ELSE
    RAISE EXCEPTION 'recipient_type % no soportado', NEW.recipient_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_exists THEN
    RAISE EXCEPTION
      'recipient_id % no existe en la tabla correspondiente a recipient_type %',
      NEW.recipient_id, NEW.recipient_type
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_notification_recipient() IS
  'Fix #19 F3: valida que notifications.recipient_id exista en players/staff_users/tenant_staff_members '
  'según recipient_type. Reemplaza una FK que no se puede expresar (recipient_id apunta a múltiples tablas).';

CREATE TRIGGER enforce_notification_recipient
  BEFORE INSERT OR UPDATE OF recipient_id, recipient_type, tenant_id ON notifications
  FOR EACH ROW EXECUTE FUNCTION validate_notification_recipient();

-- \echo '005_triggers.sql aplicado: 4 funciones + 8 triggers'
