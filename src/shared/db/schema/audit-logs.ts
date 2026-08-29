import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { jsonb } from '../jsonb'
import { tenants } from './tenants'
import { auditActorTypeEnum } from './enums'

// INSERT ONLY (REVOKE UPDATE, DELETE en 008).
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),

    actorId: uuid('actor_id').notNull(),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    action: text('action').notNull(),

    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),

    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index('idx_audit_logs_tenant_created').on(table.tenantId, table.createdAt),
    resourceIdx: index('idx_audit_logs_resource').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
    ),
    actorIdx: index('idx_audit_logs_actor').on(table.tenantId, table.actorId),
    actionIdx: index('idx_audit_logs_action').on(table.tenantId, table.action),
  }),
)
