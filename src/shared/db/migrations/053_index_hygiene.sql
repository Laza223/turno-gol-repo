-- ============================================================
-- 053_index_hygiene.sql
-- Auditoría de datos wave 2, fase D1 (schema físico e índices).
--
-- Parte 1 — duplicados exactos (8): pares donde un CREATE INDEX manual
-- duplica el índice que ya crea un UNIQUE constraint (o entre sí). Se
-- borra siempre el `idx_*` suelto y se conserva el respaldado por
-- constraint. Confirmado por el advisor de Supabase (duplicate_index).
--
-- Parte 2 — prefijos estrictos (13): índice btree no-parcial cuyas
-- columnas son prefijo exacto de otro índice de la misma tabla. El índice
-- largo sirve toda query del corto (igualdad/rango sobre el prefijo);
-- el corto solo paga costo de escritura. Detectados desde pg_index.
--
-- Cero riesgo de plan: toda query que usaba un índice borrado tiene el
-- reemplazo idéntico o superset. Gate: isolation + integration + EXPLAIN.
-- Report: docs/audit/reports/fase-d1-schema-indices-report.md
-- ============================================================

-- ─── Parte 1: duplicados exactos ─────────────────────────────

DROP INDEX IF EXISTS idx_tenants_slug;              -- = tenants_slug_key (UNIQUE)
DROP INDEX IF EXISTS idx_players_email;             -- = players_email_key (UNIQUE)
DROP INDEX IF EXISTS idx_staff_users_email;         -- = staff_users_email_key (UNIQUE)
DROP INDEX IF EXISTS idx_system_admins_email;       -- = system_admins_email_key (UNIQUE)
DROP INDEX IF EXISTS idx_processed_webhooks_mp_id;  -- = processed_webhooks_mp_event_id_key (UNIQUE)
DROP INDEX IF EXISTS idx_tenant_subs_tenant;        -- ⊂ tenant_subscriptions_tenant_id_key (UNIQUE)
DROP INDEX IF EXISTS idx_daily_opens_tenant;        -- = uq_daily_open_per_tenant (UNIQUE)
-- (tenant_id, date DESC) vs uq (tenant_id, date): con igualdad en tenant_id
-- el UNIQUE se lee backward y sirve el ORDER BY date DESC igual.
DROP INDEX IF EXISTS idx_daily_closes_tenant_date;  -- ≈ uq_daily_close_per_tenant (UNIQUE)

-- ─── Parte 2: prefijos estrictos ─────────────────────────────

DROP INDEX IF EXISTS idx_bookings_tenant;           -- ⊂ idx_bookings_tenant_date / _tenant_court_date / _date_status
DROP INDEX IF EXISTS idx_bookings_tenant_date;      -- ⊂ idx_bookings_date_status (tenant_id, date, status)
DROP INDEX IF EXISTS idx_cash_flows_tenant;         -- ⊂ idx_cash_flows_tenant_date / _tenant_type / _tenant_category
DROP INDEX IF EXISTS idx_payments_tenant;           -- ⊂ idx_payments_tenant_status / _tenant_created
DROP INDEX IF EXISTS idx_courts_tenant;             -- ⊂ idx_courts_tenant_status
DROP INDEX IF EXISTS idx_abonados_tenant;           -- ⊂ idx_abonados_tenant_status / _court
DROP INDEX IF EXISTS idx_ptr_tenant;                -- ⊂ idx_ptr_tenant_status
DROP INDEX IF EXISTS idx_ptr_player;                -- ⊂ uq_player_tenant (player_id, tenant_id)
DROP INDEX IF EXISTS idx_tenant_staff_tenant;       -- ⊂ uq_tenant_staff / idx_tenant_staff_active
DROP INDEX IF EXISTS idx_tenant_player_bans_tenant; -- ⊂ idx_tenant_player_bans_active
DROP INDEX IF EXISTS idx_daily_closes_tenant;       -- ⊂ uq_daily_close_per_tenant
DROP INDEX IF EXISTS idx_audit_logs_tenant;         -- ⊂ idx_audit_logs_tenant_created / _resource / _actor / _action
DROP INDEX IF EXISTS idx_player_favorites_player;   -- ⊂ uq_player_favorites_player_tenant

-- ─── Parte 3: índices nuevos con lector real (matriz en el report) ──
-- Prod hoy tiene tablas chicas: CREATE INDEX directo alcanza. Cuando haya
-- volumen real, índices nuevos van con CONCURRENTLY (convención D7).

-- Deudas (getDebts) y cobros de mostrador (getBookingCharges) buscan
-- cash_flows por booking_id; FK sin índice. Parcial: solo filas ligadas
-- a una reserva.
CREATE INDEX IF NOT EXISTS idx_cash_flows_booking
  ON cash_flows(booking_id) WHERE booking_id IS NOT NULL;

-- Sweeps cron CROSS-TENANT (rol worker BYPASSRLS, sin tenant_id en el
-- WHERE): los compuestos existentes arrancan en tenant_id y no sirven.
-- Parciales sobre el subset activo = tamaño acotado.
-- expire-pending-booking-sweep: WHERE status='pending_payment' AND created_at < corte
CREATE INDEX IF NOT EXISTS idx_bookings_pending_created
  ON bookings(created_at) WHERE status = 'pending_payment';
-- auto-complete-bookings: WHERE status='confirmed' AND ends_at < NOW()-gracia
CREATE INDEX IF NOT EXISTS idx_bookings_confirmed_ends
  ON bookings(ends_at) WHERE status = 'confirmed';

-- Ranking de /explorar: derived table AVG(rating)/COUNT GROUP BY tenant_id
-- escanea TODA la tabla reviews en cada búsqueda pública
-- (search.service.ts:140). Con (tenant_id, rating) sale por index-only scan.
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_rating
  ON reviews(tenant_id, rating);

-- Clase "día operativo ART": /caja (resumen+movimientos+cierre) y el
-- reporte de cantina filtran por (occurred_at AT TIME ZONE ...)::date —
-- expresión no sargable para los índices crudos (tenant_id, occurred_at).
-- Expression index con la MISMA expresión que usan las queries
-- (cashflow.service.ts:245, canteen-report.service.ts:48). timezone() es
-- IMMUTABLE, apto para índice.
CREATE INDEX IF NOT EXISTS idx_cash_flows_tenant_day_art
  ON cash_flows(tenant_id, ((occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date));
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_day_art
  ON stock_movements(tenant_id, ((occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date));
