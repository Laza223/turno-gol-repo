import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { players } from './players'
import { playerTagEnum } from './enums'

export const playerTenantRelationships = pgTable(
  'player_tenant_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),

    bookingsCount: integer('bookings_count').notNull().default(0),
    // Ausencias dentro de la ventana de reincidencia vigente (se resetea a 1 si
    // la ausencia actual ocurre 90+ días después de la anterior). Llegar a 2
    // dispara un softban de 14 días (ver applyNoShowStrike en ptr.service.ts).
    noshowCount: integer('noshow_count').notNull().default(0),
    lastNoShowAt: timestamp('last_no_show_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastBookingAt: timestamp('last_booking_at', {
      withTimezone: true,
      mode: 'date',
    }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),

    status: text('status').notNull().default('active'),

    // Etiquetas del complejo sobre esta persona (B12 / D3, migr. 074). Set
    // CERRADO: sin texto libre sobre personas, por Ley 25.326. "Sin etiquetas"
    // es `[]`, nunca NULL. `chk_ptr_tags_unique` prohíbe repetidos en la base.
    tags: playerTagEnum('tags')
      .array()
      .notNull()
      .default(sql`'{}'`),

    dataConsentAt: timestamp('data_consent_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'chk_ptr_status_valid',
      sql`${table.status} IN ('active', 'blocked')`,
    ),
    uqPlayerTenant: unique('uq_player_tenant').on(table.playerId, table.tenantId),
    tenantIdx: index('idx_ptr_tenant').on(table.tenantId),
    playerIdx: index('idx_ptr_player').on(table.playerId),
    tenantStatusIdx: index('idx_ptr_tenant_status').on(
      table.tenantId,
      table.status,
    ),
  }),
)
