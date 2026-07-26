-- ============================================================
-- 061_reconciliation_indexes.sql
-- Auditoría de datos, fase D4 §7 (reconciliación contable
-- payments↔cash_flows↔bookings, implementación de RI #3 — ver
-- docs/audit/reports/fase-d4-flujos-integridad-report.md §7).
--
-- Mismo patrón que idx_bookings_pending_created/idx_bookings_confirmed_ends
-- de la 053: el sweep nuevo (reconcile-accounting-drift.worker.ts,
-- runAccountingReconciliation en src/modules/payments/reconciliation.service.ts)
-- corre bajo turnogol_worker (BYPASSRLS, sin tenant_id en el WHERE) — sweep
-- cross-tenant cada hora. Sin estos índices, cada corrida hace Seq Scan
-- cross-tenant sobre payments/bookings.
--
-- idx_payments_approved_created: usado por INV1/INV2/INV3 — filtran
-- payments WHERE status='approved' AND type='deposit' AND
-- method='mercadopago' AND created_at < NOW() - INTERVAL '15 minutes'.
-- Parcial sobre el subset 'approved' = tamaño acotado (payments
-- 'pending'/'rejected'/'in_process'/etc. quedan afuera del índice).
--
-- idx_bookings_deposit_mp: usado por INV4 — filtra bookings WHERE
-- payment_method='mercadopago' AND deposit_status IN ('paid','captured').
-- Parcial: solo bookings con seña MP ya cobrada/capturada.
--
-- Cero riesgo de plan: son índices nuevos, no reemplazan ni compiten con
-- ninguno existente (los compuestos por tenant_id no sirven a un scan
-- cross-tenant sin ese filtro).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_payments_approved_created
  ON payments(created_at) WHERE status = 'approved';

-- Fix del verificador adversarial: la query de INV4 filtra/ordena por
-- updated_at, no created_at (copy-paste del índice de arriba). DROP previo
-- necesario porque `CREATE INDEX IF NOT EXISTS` con el mismo nombre no
-- recrea un índice ya existente sobre la columna vieja (esta migración ya se
-- corrió contra la DB local antes de este fix).
DROP INDEX IF EXISTS idx_bookings_deposit_mp;

CREATE INDEX IF NOT EXISTS idx_bookings_deposit_mp
  ON bookings(updated_at) WHERE payment_method = 'mercadopago' AND deposit_status IN ('paid', 'captured');
