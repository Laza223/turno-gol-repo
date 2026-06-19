import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../jsonb'
import { tenants } from './tenants'
import { courtStatusEnum, surfaceTypeEnum } from './enums'

// Fix #1 F3: status DEFAULT 'online' (NO 'active').
// Fix #3 F3: pricing JSONB con estructura nueva {rules:[...]}.
export const courts = pgTable(
  'courts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    surfaceType: surfaceTypeEnum('surface_type')
      .notNull()
      .default('synthetic_grass'),
    capacity: integer('capacity').notNull(),
    photos: text('photos').array().default(sql`'{}'::text[]`),

    status: courtStatusEnum('status').notNull().default('online'),

    pricing: jsonb('pricing').notNull().default(
      sql`'{
        "rules": [
          {"days": ["mon","tue","wed","thu"], "from": "08:00", "to": "18:00", "price": 800000},
          {"days": ["mon","tue","wed","thu"], "from": "18:00", "to": "23:00", "price": 1200000},
          {"days": ["fri","sat","sun"],       "from": "08:00", "to": "23:00", "price": 1500000}
        ]
      }'::jsonb`,
    ),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    capacityCheck: check('chk_capacity_positive', sql`${table.capacity} > 0`),
    tenantIdx: index('idx_courts_tenant').on(table.tenantId),
    tenantStatusIdx: index('idx_courts_tenant_status').on(
      table.tenantId,
      table.status,
    ),
  }),
)
