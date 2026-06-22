-- ============================================================
-- 034_drop_no_show_penalty.sql
-- Tarea #5: No-show → deuda (modelo ATC), se elimina el ban temporal por días.
--
-- El no-show ya no se configura por complejo (`no_show_penalty` con type
-- 'ban_days'/'none', días y umbral). Ahora SIEMPRE genera deuda en
-- player_tenant_relationships.balance y el jugador queda bloqueado para reservar
-- online hasta saldarla. La lógica vive en handleNoShow (booking.cancellation.ts);
-- esta migración limpia la columna settings y su default.
--
-- Idempotente: el UPDATE filtra por presencia de la clave; el SET DEFAULT es
-- idempotente. Los bans manuales (tenant_player_bans) no se tocan.
-- ============================================================

-- Nuevo default sin no_show_penalty (refleja src/shared/db/schema/tenants.ts).
ALTER TABLE tenants
  ALTER COLUMN settings SET DEFAULT '{
    "requires_deposit": true,
    "deposit_percentage": 30,
    "cancellation_policy": {"hours_before": 12, "penalty_type": "deposit", "penalty_amount": null},
    "accepts_cash": true,
    "accepts_transfer": true,
    "accepts_mercadopago": true,
    "allow_online_booking": true,
    "booking_advance_days": 6,
    "auto_complete_minutes": 30
  }'::jsonb;

-- Elimina la clave de los tenants existentes.
UPDATE tenants
SET settings = settings - 'no_show_penalty'
WHERE settings ? 'no_show_penalty';
