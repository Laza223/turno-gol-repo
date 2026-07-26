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

// Cambio #16: el enum describe SOLO el piso. La cobertura (techada) y la
// iluminación pasaron a columnas booleanas por cancha (is_covered/has_lighting).
// El valor de cobertura se reemplazó por baldosa (tile).
export const surfaceTypeEnum = pgEnum('surface_type', [
  'synthetic_grass',
  'natural_grass',
  'cement',
  'tile',
])

// ─── Booking ────────────────────────────────────────────────────
// 'tournament' (migr. 062): horas que posee un torneo. Como 'block' se saltea
// assertSlotDuration y va con price_snapshot 0, pero a diferencia de un bloqueo
// tiene dueño (bookings.tournament_id) y se libera por fecha, no una por una.
export const bookingTypeEnum = pgEnum('booking_type', [
  'spontaneous',
  'fixed',
  'block',
  'tournament',
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

// 2 roles (migración 029 quitó 'read_only'). 'admin' (Administrador, acceso
// total) y 'manager' (Encargado: grilla + reservas + caja, sin configuración).
export const staffRoleEnum = pgEnum('staff_role', ['admin', 'manager'])

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
  // Gastos categorizados (migr. 050); operating_expense queda como legacy.
  'merchandise',
  'salaries',
  'utilities',
  'maintenance',
  'other_expense',
])

// ─── Canteen (migración 048, rediseño Caja y Cantina) ───────────
// Ledger de stock: entradas +, salidas −; 'adjustment' es la única
// corrección permitida (la tabla es append-only para turnogol_app).
export const stockMovementKindEnum = pgEnum('stock_movement_kind', [
  'purchase',
  'sale',
  'waste',
  'courtesy',
  'internal_use',
  'adjustment',
])

// 'canceled' con una L (convención del repo).
export const canteenTabStatusEnum = pgEnum('canteen_tab_status', [
  'open',
  'paid',
  'canceled',
])

// ─── Tournament (migración 062, módulo Torneos) ─────────────────
// 'relámpago' NO está acá: es un preset de la UI sobre estos tres formatos
// (partido corto + varias canchas en paralelo en un solo día), no un formato.
export const tournamentFormatEnum = pgEnum('tournament_format', [
  'league',
  'knockout',
  'groups_playoff',
])

// 'canceled' con una L (convención del repo).
export const tournamentStatusEnum = pgEnum('tournament_status', [
  'draft',
  'registration',
  'in_progress',
  'finished',
  'canceled',
])

export const tournamentTeamStatusEnum = pgEnum('tournament_team_status', [
  'registered',
  'confirmed',
  'withdrawn',
  'disqualified',
])

// ─── Tournament fixture (migración 064, fase 2) ─────────────────
export const tournamentStageKindEnum = pgEnum('tournament_stage_kind', [
  'league',
  'group_stage',
  'knockout',
])

// 'canceled' con una L (convención del repo).
export const tournamentMatchStatusEnum = pgEnum('tournament_match_status', [
  'scheduled',
  'played',
  'walkover',
  'postponed',
  'canceled',
])

// ─── Tournament results (migración 065, fase 3) ─────────────────
// El MISMO orden que el CREATE TYPE: schema-drift.test.ts §3 compara los labels
// por enumsortorder.
export const tournamentEventTypeEnum = pgEnum('tournament_event_type', [
  'goal',
  'own_goal',
  'yellow_card',
  'red_card',
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
