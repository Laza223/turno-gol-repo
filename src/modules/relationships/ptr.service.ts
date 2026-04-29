import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

export async function ensurePTR(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count, last_booking_at)
    VALUES (${tenantId}, ${playerId}, 1, NOW())
    ON CONFLICT (player_id, tenant_id)
    DO UPDATE SET
      bookings_count = player_tenant_relationships.bookings_count + 1,
      last_booking_at = NOW()
  `)
}
