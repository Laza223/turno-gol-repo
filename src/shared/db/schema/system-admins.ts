import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { staffStatusEnum } from './enums'

// Fix #10 F2: equipo interno TurnoGol con MFA + IP whitelist.
export const systemAdmins = pgTable('system_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),

  status: staffStatusEnum('status').notNull().default('active'),

  mfaSecret: text('mfa_secret'),
  mfaVerifiedAt: timestamp('mfa_verified_at', {
    withTimezone: true,
    mode: 'date',
  }),

  lastLoginAt: timestamp('last_login_at', {
    withTimezone: true,
    mode: 'date',
  }),
  lastLoginIp: text('last_login_ip'),

  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
