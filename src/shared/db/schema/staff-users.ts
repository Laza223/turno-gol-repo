import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { staffStatusEnum } from './enums'

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  status: staffStatusEnum('status').notNull().default('active'),
  // Programa de referidos, fase B1 (migr. 094). Código CRUDO del `?ref=<CODE>`
  // con el que se registró este staff, sin resolver todavía a un tenant (esa
  // resolución hacia tenants.referred_by_tenant_id es de B2/B3).
  signupReferralCode: text('signup_referral_code'),
  // Verificación de mail propia (migr. 112). NULL = "No verificado". En la base
  // va solo el sha256 del token; el token crudo viaja únicamente en el mail.
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
  emailVerifyTokenHash: text('email_verify_token_hash'),
  emailVerifySentAt: timestamp('email_verify_sent_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', {
    withTimezone: true,
    mode: 'date',
  }),
})
