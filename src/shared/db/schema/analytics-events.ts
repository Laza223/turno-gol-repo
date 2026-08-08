import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { jsonb } from '../jsonb'
import { tenants } from './tenants'

/**
 * Eventos de producto (migr. 072). Append-only: sin policy de UPDATE y con
 * REVOKE UPDATE sobre `turnogol_app`.
 *
 * NO guarda identificadores de persona — ver el encabezado de la migración y
 * `PII_KEYS` en `@/shared/observability/analytics`. Eso la mantiene fuera del
 * régimen de datos personales de la Ley 25.326.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Categoría de `track.*`: booking, payment, funnel, … */
    category: text('category').notNull(),
    /** Nombre del evento, ej. 'booking.online.create.success'. */
    event: text('event').notNull(),

    /** Nullable: el tráfico público (búsqueda cross-tenant, portal) no tiene complejo. */
    tenantId: uuid('tenant_id').references(() => tenants.id),

    /** Contexto del evento, ya filtrado de PII. */
    data: jsonb('data').notNull().default({}),

    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_analytics_events_occurred').on(t.occurredAt.desc()),
    index('idx_analytics_events_funnel').on(t.category, t.event, t.occurredAt.desc()),
    index('idx_analytics_events_tenant').on(t.tenantId, t.occurredAt.desc()),
  ],
)
