-- ============================================================
-- 002_enums.sql
-- Tipos enumerados (doc13 §1).
-- Convenciones críticas:
--   * 'canceled' (americano, una L). NUNCA 'cancelled'.
--   * payment_status INCLUYE 'in_process' (Fix #12 — pagos CBU/transferencia 48hs).
--   * cashflow_type SIN 'expense' (Fix #7 — TurnoGol no registra gastos).
--   * staff_role solo 'admin' en v1.
-- ============================================================

-- ─── Tenant lifecycle ───────────────────────────────────────────
CREATE TYPE tenant_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'suspended',
  'blocked',
  'canceled',
  'churned',
  'deleted'
);

CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'suspended',
  'blocked',
  'canceled',
  'churned'
);
COMMENT ON TYPE subscription_status IS
  'No incluye deleted porque al eliminarse el tenant, la fila de tenant_subscriptions se borra '
  'en cascada. El estado final de una suscripción antes de su eliminación física es churned.';

CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual');

-- ─── Court ──────────────────────────────────────────────────────
CREATE TYPE court_status AS ENUM ('online', 'offline');

CREATE TYPE surface_type AS ENUM (
  'synthetic_grass',
  'natural_grass',
  'cement',
  'indoor'
);

-- ─── Booking ────────────────────────────────────────────────────
CREATE TYPE booking_type AS ENUM (
  'spontaneous',
  'fixed',
  'block'
);

CREATE TYPE booking_status AS ENUM (
  'pending_payment',
  'confirmed',
  'expired',
  'canceled_refunded',
  'canceled_no_refund',
  'completed',
  'no_show'
);

CREATE TYPE deposit_status AS ENUM (
  'not_required',
  'pending',
  'paid',
  'refunded',
  'captured'
);

CREATE TYPE cancellation_actor AS ENUM ('player', 'admin', 'system');

-- ─── Abonado ────────────────────────────────────────────────────
CREATE TYPE abonado_status AS ENUM ('active', 'paused', 'canceled');
CREATE TYPE abonado_payment_method AS ENUM ('cash', 'transfer');

-- ─── Player & Staff ─────────────────────────────────────────────
CREATE TYPE player_status AS ENUM ('active', 'banned', 'anonymized');
CREATE TYPE staff_status AS ENUM ('active', 'inactive');
CREATE TYPE staff_role  AS ENUM ('admin');

-- ─── Payment ────────────────────────────────────────────────────
CREATE TYPE payment_type AS ENUM (
  'deposit',
  'full_payment',
  'refund',
  'penalty'
);

CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'mercadopago', 'other');

CREATE TYPE payment_status AS ENUM (
  'pending',
  'in_process',
  'approved',
  'rejected',
  'refunded',
  'canceled'
);
COMMENT ON TYPE payment_status IS
  'in_process: exclusivo para pagos por transferencia bancaria/CBU que tardan 24-48hs. '
  'Cuando un booking tiene un payment en in_process, el timer de expiración se extiende a 48hs '
  '(vs. 15min para pending sin in_process). Nunca absorber in_process dentro de pending: '
  'los reports financieros necesitan discriminar ambos estados.';

-- ─── Cash flow ──────────────────────────────────────────────────
-- Sin 'expense' (Fix #7 Fase 2): TurnoGol solo registra ingresos y ajustes compensatorios.
CREATE TYPE cashflow_type AS ENUM ('income', 'adjustment');

CREATE TYPE cashflow_category AS ENUM (
  'booking',
  'product_sale',
  'other',
  'no_show_correction'
);

-- ─── Notification ───────────────────────────────────────────────
CREATE TYPE recipient_type AS ENUM ('player', 'staff', 'tenant_owner');

-- v1 email-only (ADR-003). Push se evalúa en v1.5.
CREATE TYPE notification_channel AS ENUM ('email');

CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'delivered', 'failed');

-- ─── Audit ──────────────────────────────────────────────────────
CREATE TYPE audit_actor_type AS ENUM ('staff', 'player', 'system');
