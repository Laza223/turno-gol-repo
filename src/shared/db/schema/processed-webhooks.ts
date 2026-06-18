import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../jsonb'

export const processedWebhooks = pgTable(
  'processed_webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mpEventId: text('mp_event_id').notNull().unique(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload'),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    mpIdIdx: uniqueIndex('idx_processed_webhooks_mp_id').on(table.mpEventId),
  }),
)
