import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { staffStatusEnum } from './enums'

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  status: staffStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', {
    withTimezone: true,
    mode: 'date',
  }),
})
