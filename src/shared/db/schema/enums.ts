import { pgEnum } from 'drizzle-orm/pg-core'

// ─── Tenant lifecycle ───────────────────────────────────────────
export const tenantStatusEnum = pgEnum('tenant_status', [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'blocked',
  'canceled',
  'churned',
  'deleted',
])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'blocked',
  'canceled',
  'churned',
])

export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'annual'])

// ─── Court ──────────────────────────────────────────────────────
export const courtStatusEnum = pgEnum('court_status', ['online', 'offline'])

export const surfaceTypeEnum = pgEnum('surface_type', [
  'synthetic_grass',
  'natural_grass',
  'cement',
  'indoor',
])

// ─── Booking ────────────────────────────────────────────────────
export const bookingTypeEnum = pgEnum('booking_type', [
  'spontaneous',
  'fixed',
  'block',
])

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending_payment',
  'confirmed',
  'expired',
  'canceled_refunded',
  'canceled_no_refund',
  'completed',
  'no_show',
])

export const depositStatusEnum = pgEnum('deposit_status', [
  'not_required',
  'pending',
  'paid',
  'refunded',
  'captured',
])

export const cancellationActorEnum = pgEnum('cancellation_actor', [
  'player',
  'admin',
  'system',
])

// ─── Abonado ────────────────────────────────────────────────────
export const abonadoStatusEnum = pgEnum('abonado_status', [
  'active',
  'paused',
  'canceled',
])

export const abonadoPaymentMethodEnum = pgEnum('abonado_payment_method', [
  'cash',
  'transfer',
])

// ─── Player & Staff ─────────────────────────────────────────────
export const playerStatusEnum = pgEnum('player_status', [
  'active',
  'banned',
  'anonymized',
])

export const staffStatusEnum = pgEnum('staff_status', ['active', 'inactive'])

export const staffRoleEnum = pgEnum('staff_role', ['admin'])

// ─── Payment ────────────────────────────────────────────────────
export const paymentTypeEnum = pgEnum('payment_type', [
  'deposit',
  'full_payment',
  'refund',
  'penalty',
])

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'transfer',
  'mercadopago',
  'other',
])

// Fix #12 F1: incluye 'in_process' (transferencias 24-48hs).
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'in_process',
  'approved',
  'rejected',
  'refunded',
  'canceled',
])

// ─── Cash flow ──────────────────────────────────────────────────
// 'expense' agregado en migración 025 (rediseño de Caja); supersede Fix #7.
export const cashflowTypeEnum = pgEnum('cashflow_type', ['income', 'adjustment', 'expense'])

export const cashflowCategoryEnum = pgEnum('cashflow_category', [
  'booking',
  'product_sale',
  'other',
  'no_show_correction',
  'operating_expense',
])

// ─── Notification ───────────────────────────────────────────────
export const recipientTypeEnum = pgEnum('recipient_type', [
  'player',
  'staff',
  'tenant_owner',
])

export const notificationChannelEnum = pgEnum('notification_channel', ['email'])

export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
])

// ─── Audit ──────────────────────────────────────────────────────
export const auditActorTypeEnum = pgEnum('audit_actor_type', [
  'staff',
  'player',
  'system',
])

// ─── Open match ("Falta Uno") ───────────────────────────────────
// 'canceled' (una L) por convención de schema. open → full cuando se
// completan los cupos; canceled = cancelado por el creador; completed =
// el partido ya se jugó.
export const openMatchStatusEnum = pgEnum('open_match_status', [
  'open',
  'full',
  'canceled',
  'completed',
])
