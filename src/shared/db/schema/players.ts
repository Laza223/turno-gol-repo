import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { playerStatusEnum } from './enums'

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    phone: text('phone'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    avatarUrl: text('avatar_url'),
    preferredArea: text('preferred_area'),

    // Preferencias de notificación (toggles en /perfil). notify_email solo
    // gobierna emails opcionales (recordatorios); los transaccionales se
    // envían siempre. notify_push: pipeline de push al jugador pendiente.
    notifyEmail: boolean('notify_email').notNull().default(true),
    notifyPush: boolean('notify_push').notNull().default(true),

    status: playerStatusEnum('status').notNull().default('active'),
    banReason: text('ban_reason'),
    banUntil: timestamp('ban_until', { withTimezone: true, mode: 'date' }),

    agreedToTermsAt: timestamp('agreed_to_terms_at', {
      withTimezone: true,
      mode: 'date',
    }),
    termsVersion: text('terms_version'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => ({
    emailIdx: uniqueIndex('idx_players_email').on(table.email),
    phoneIdx: index('idx_players_phone')
      .on(table.phone)
      .where(sql`phone IS NOT NULL`),
    statusIdx: index('idx_players_status').on(table.status),
  }),
)
