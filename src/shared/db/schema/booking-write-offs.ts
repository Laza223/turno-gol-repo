import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { bookings } from './bookings'
import { staffUsers } from './staff-users'
import { tenants } from './tenants'

/** Lo que el staff resignó de un turno jugado ("Dar por perdido"). Una fila por turno. */
export const bookingWriteOffs = pgTable(
  'booking_write_offs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id),
    amount: integer('amount').notNull(),
    writtenOffBy: uuid('written_off_by')
      .notNull()
      .references(() => staffUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('idx_booking_write_offs_tenant_created').on(t.tenantId, t.createdAt)],
)
