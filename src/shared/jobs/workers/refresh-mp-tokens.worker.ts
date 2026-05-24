import type PgBoss from 'pg-boss'
import { getSql } from '@/shared/db/client'
import { refreshTenantMpToken } from '@/modules/payments/mp-oauth'
import { QUEUE_REFRESH_MP_TOKENS } from '../definitions'

/**
 * Proactively refresh every connected tenant's MP access token (Hallazgo 4).
 * MP OAuth access tokens expire (~6h); refreshing every 4h keeps them valid so
 * deposit/refund calls don't 401 mid-request. Per-tenant failures are logged
 * and skipped so one bad tenant doesn't block the rest.
 */
export async function runRefreshMpTokens(): Promise<void> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM tenants
    WHERE mp_refresh_token IS NOT NULL
      AND status IN ('active', 'trialing', 'past_due', 'suspended')
  `

  let refreshed = 0
  for (const row of rows) {
    try {
      await refreshTenantMpToken(row.id)
      refreshed += 1
    } catch (err) {
      console.error(`[refresh-mp-tokens] tenant ${row.id} failed`, err)
    }
  }

  if (rows.length > 0) {
    console.log(`[refresh-mp-tokens] refreshed ${refreshed}/${rows.length} tenants`)
  }
}

export async function registerRefreshMpTokensWorker(boss: PgBoss): Promise<void> {
  // Every 4 hours.
  await boss.schedule(QUEUE_REFRESH_MP_TOKENS, '0 */4 * * *', {})
  await boss.work(QUEUE_REFRESH_MP_TOKENS, async () => {
    await runRefreshMpTokens()
  })
  console.log(`[workers] registered ${QUEUE_REFRESH_MP_TOKENS}`)
}
