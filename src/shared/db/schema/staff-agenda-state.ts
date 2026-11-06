import { boolean, date, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const staffAgendaState = pgTable('staff_agenda_state', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  operatingDate: date('operating_date').notNull(),
  firstBookingId: uuid('first_booking_id'),
  firstStartsAt: timestamp('first_starts_at', { withTimezone: true, mode: 'date' }),
  revision: integer('revision').notNull().default(0),
  started: boolean('started').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
