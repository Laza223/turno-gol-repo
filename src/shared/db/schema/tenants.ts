import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../jsonb'
import { tenantStatusEnum } from './enums'

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    coverUrl: text('cover_url'),
    address: text('address').notNull(),
    city: text('city').notNull(),
    province: text('province').notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    phone: text('phone').notNull(),
    whatsapp: text('whatsapp'),
    email: text('email').notNull(),
    timezone: text('timezone')
      .notNull()
      .default('America/Argentina/Buenos_Aires'),

    openingHours: jsonb('opening_hours').notNull().default(
      sql`'{
        "mon": {"open": "08:00", "close": "00:00"},
        "tue": {"open": "08:00", "close": "00:00"},
        "wed": {"open": "08:00", "close": "00:00"},
        "thu": {"open": "08:00", "close": "00:00"},
        "fri": {"open": "08:00", "close": "01:00"},
        "sat": {"open": "09:00", "close": "01:00"},
        "sun": {"open": "09:00", "close": "23:00"}
      }'::jsonb`,
    ),

    closedDates: date('closed_dates').array().default(sql`'{}'::date[]`),

    status: tenantStatusEnum('status').notNull().default('trialing'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),

    settings: jsonb('settings').notNull().default(
      sql`'{
        "requires_deposit": true,
        "deposit_percentage": 30,
        "cancellation_policy": {"hours_before": 12, "penalty_type": "deposit", "penalty_amount": null},
        "no_show_penalty": {"type": "ban_days", "days": 7},
        "accepts_cash": true,
        "accepts_transfer": true,
        "accepts_mercadopago": true,
        "allow_online_booking": true,
        "booking_advance_days": 6,
        "auto_complete_minutes": 30
      }'::jsonb`,
    ),

    featureOverrides: jsonb('feature_overrides')
      .notNull()
      .default(sql`'{}'::jsonb`),

    // Servicios del complejo para filtros/badges de la interfaz pública.
    // { duchas, estacionamiento, bar, parrilla, vestuario, wifi, techado, iluminacion }
    amenities: jsonb('amenities').notNull().default(sql`'{}'::jsonb`),

    // Precio mínimo denormalizado (centavos ARS) para mostrar "Desde $X" en cards.
    // Mantenido por el trigger courts_recalc_from_price (recalcula el MIN de los
    // precios de canchas 'online' del complejo). NULL = sin canchas online.
    fromPriceCents: integer('from_price_cents'),

    // Facets denormalizados de las canchas 'online' para filtros públicos sin
    // tocar courts (RLS-aislada). Mantenidos por courts_recalc_from_price.
    courtSurfaces: text('court_surfaces')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    courtFormats: integer('court_formats')
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),

    mpAccessToken: text('mp_access_token'),
    mpRefreshToken: text('mp_refresh_token'),
    mpUserId: text('mp_user_id'),
    mpPublicKey: text('mp_public_key'),
    mpConnectedAt: timestamp('mp_connected_at', {
      withTimezone: true,
      mode: 'date',
    }),

    scheduledDeletionAt: timestamp('scheduled_deletion_at', {
      withTimezone: true,
      mode: 'date',
    }),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugIdx: index('idx_tenants_slug').on(table.slug),
    statusIdx: index('idx_tenants_status').on(table.status),
    cityIdx: index('idx_tenants_city').on(table.city),
  }),
)
