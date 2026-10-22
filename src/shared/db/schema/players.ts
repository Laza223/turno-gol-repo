import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { playerStatusEnum } from './enums'

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    phone: text('phone'),
    /**
     * Últimos 8 dígitos del teléfono, GENERATED ALWAYS … STORED (migr. 075).
     * Solo lectura: la escribe Postgres. Existe para que el JOIN de sugerencia
     * de /jugadores pueda usar índice — bajo RLS, un índice sobre la expresión
     * equivalente no se usa (`regexp_replace` no es LEAKPROOF; ver la migración
     * para la medición y el control negativo).
     */
    phoneHint8: text('phone_hint8'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    avatarUrl: text('avatar_url'),
    preferredArea: text('preferred_area'),

    // Preferencias de notificación (sin toggles desde el PR 2.4b; columnas sin uso en la UI). notify_email solo
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

    // Perfil RIVAL (migr. 099), todo nullable. La foto reusa `avatarUrl`.
    rivalAcceptedAt: timestamp('rival_accepted_at', { withTimezone: true, mode: 'date' }),
    rivalTermsVersion: text('rival_terms_version'),
    /** Cerrada en la DB: goalkeeper | defender | midfielder | forward | any. */
    position: text('position', {
      enum: ['goalkeeper', 'defender', 'midfielder', 'forward', 'any'],
    }),
    /** Zona de la lista cerrada de `rival-zones.ts` (CHECK en la base, mismo contenido). */
    zone: text('zone'),
    /** Origen de la cuenta (ej. 'rival'), para las métricas. */
    signupSource: text('signup_source'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => ({
    phoneIdx: index('idx_players_phone')
      .on(table.phone)
      .where(sql`phone IS NOT NULL`),
    phoneHint8Idx: index('idx_players_phone_hint8')
      .on(table.phoneHint8)
      .where(sql`phone_hint8 IS NOT NULL`),
    statusIdx: index('idx_players_status').on(table.status),
  }),
)
