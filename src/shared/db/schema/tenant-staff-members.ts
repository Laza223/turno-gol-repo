import { boolean, index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { staffUsers } from './staff-users'
import { staffRoleEnum } from './enums'

// Fix #5 F2: role DEFAULT 'admin' (el ENUM solo tiene 'admin').
export const tenantStaffMembers = pgTable(
  'tenant_staff_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id),
    role: staffRoleEnum('role').notNull().default('admin'),
    addedBy: uuid('added_by').references(() => staffUsers.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    uqTenantStaff: unique('uq_tenant_staff').on(table.tenantId, table.staffUserId),
    tenantIdx: index('idx_tenant_staff_tenant').on(table.tenantId),
    userIdx: index('idx_tenant_staff_user').on(table.staffUserId),
    activeIdx: index('idx_tenant_staff_active').on(table.tenantId, table.isActive),
  }),
)
