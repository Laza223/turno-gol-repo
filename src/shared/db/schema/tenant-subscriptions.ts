import {
  boolean,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { plans } from './plans'
import { billingCycleEnum, subscriptionStatusEnum } from './enums'

export const tenantSubscriptions = pgTable(
  'tenant_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id)
      .unique(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),

    // Migr. 090 — precio por cancha. Canchas sobre las que esta calculado el
    // cobro VIGENTE, o sea lo que esta cargado en el preapproval de MP. NO es
    // "cuantas canchas tiene hoy" (eso es `courts WHERE status='online'`):
    // solo se mueve cuando un cambio confirmado se aplica al cierre del periodo.
    billedCourts: integer('billed_courts').notNull().default(1),
    status: subscriptionStatusEnum('status').notNull().default('trialing'),

    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    priceLockedUntil: timestamp('price_locked_until', {
      withTimezone: true,
      mode: 'date',
    }),

    mpSubscriptionId: text('mp_subscription_id'),

    // Migr. 078: con qué cuenta de MercadoPago paga el complejo, desacoplado
    // del email de login. NULL = el del dueño (staff_users).
    mpPayerEmail: text('mp_payer_email'),

    /** @deprecated migr. 090/091 — la reemplaza `pendingBilledCourts`. Sin escritores. */
    pendingPlanChange: uuid('pending_plan_change').references(() => plans.id),
    // A cuantas canchas pasa el cobro en `pendingChangeAt`. Sumar o sacar una
    // cancha nunca se cobra prorrateado: se aplica en el proximo ciclo.
    pendingBilledCourts: integer('pending_billed_courts'),
    pendingChangeAt: timestamp('pending_change_at', {
      withTimezone: true,
      mode: 'date',
    }),

    // Migr. 101 — cobro de TurnoGol Plus. `plusEnabled` es lo unico que mete Plus
    // en el monto del debito; el override del flag `whatsapp_bot` NO lo decide.
    plusEnabled: boolean('plus_enabled').notNull().default(false),
    // Precio especial por cancha y mes. NULL = lista. CHECK > 0 (P10).
    plusPricePerCourtCents: integer('plus_price_per_court_cents'),
    // Baja agendada: el debito ya no lleva Plus, el bot sigue hasta aca.
    plusAccessUntil: timestamp('plus_access_until', { withTimezone: true, mode: 'date' }),
    // Cotizacion anual congelada, pendiente de pago (P7). Van las cuatro o ninguna.
    plusProrateCents: integer('plus_prorate_cents'),
    plusProrateMonths: smallint('plus_prorate_months'),
    // current_period_end contra el que se cotizo (si renovo, la cotizacion vencio)
    // y cuando se cotizo (un pago anterior no la acredita).
    plusProratePeriodEnd: timestamp('plus_prorate_period_end', {
      withTimezone: true,
      mode: 'date',
    }),
    plusProrateQuotedAt: timestamp('plus_prorate_quoted_at', { withTimezone: true, mode: 'date' }),

    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    cancellationReason: text('cancellation_reason'),

    scheduledDeletionAt: timestamp('scheduled_deletion_at', {
      withTimezone: true,
      mode: 'date',
    }),

    dunningStartedAt: timestamp('dunning_started_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastPaymentFailedAt: timestamp('last_payment_failed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastPaymentAt: timestamp('last_payment_at', {
      withTimezone: true,
      mode: 'date',
    }),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_tenant_subs_status').on(table.status),
    periodEndIdx: index('idx_tenant_subs_period_end').on(table.currentPeriodEnd),
    dunningIdx: index('idx_tenant_subs_dunning').on(table.dunningStartedAt),
    plusAccessUntilIdx: index('idx_tenant_subs_plus_access_until')
      .on(table.plusAccessUntil)
      .where(sql`${table.plusAccessUntil} IS NOT NULL`),
  }),
)
