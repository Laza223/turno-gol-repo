import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
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

    pendingPlanChange: uuid('pending_plan_change').references(() => plans.id),
    pendingChangeAt: timestamp('pending_change_at', {
      withTimezone: true,
      mode: 'date',
    }),

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
    tenantIdx: index('idx_tenant_subs_tenant').on(table.tenantId),
    statusIdx: index('idx_tenant_subs_status').on(table.status),
    periodEndIdx: index('idx_tenant_subs_period_end').on(table.currentPeriodEnd),
    dunningIdx: index('idx_tenant_subs_dunning').on(table.dunningStartedAt),
  }),
)
