import { config } from 'dotenv'
config({ path: '.env.local' })

import { closeSql, getSql } from '@/shared/db/client'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const SLOT_COUNT = 50

const E2E_TENANT_ID = '00000000-0000-4000-8000-000000000001'
const E2E_COURT_ID = '00000000-0000-4000-8000-000000000010'

type Result = {
  ok: boolean
  status: number
  bookingId?: string
  error?: string
}

async function attemptBooking(
  playerId: string,
  slot: { tenantId: string; courtId: string; date: string; timeStart: string; timeEnd: string },
): Promise<Result> {
  try {
    const res = await fetch(`${BASE}/api/e2e/create-booking`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-e2e-player-id': playerId,
      },
      body: JSON.stringify(slot),
    })
    const body = (await res.json().catch(() => ({}))) as { bookingId?: string; error?: string }
    return { ok: res.ok, status: res.status, bookingId: body.bookingId, error: body.error }
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message }
  }
}

async function createStressPlayers(n: number): Promise<string[]> {
  const sql = getSql()
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const email = `e2e_stress_${Date.now()}_${i}@turnogol.test`
    const rows = await sql<{ id: string }[]>`
      INSERT INTO players (email, first_name, last_name, status, agreed_to_terms_at, terms_version)
      VALUES (${email}, ${'Stress'}, ${'P' + i}, 'active', NOW(), 'v1')
      RETURNING id
    `
    ids.push(rows[0]!.id)
  }
  // Link each player to the E2E tenant so the PTR upsert isn't the bottleneck.
  for (const pid of ids) {
    await sql`
      INSERT INTO player_tenant_relationships (tenant_id, player_id)
      VALUES (${E2E_TENANT_ID}, ${pid})
      ON CONFLICT DO NOTHING
    `
  }
  return ids
}

async function cleanupStress(playerIds: string[], winningBookingId?: string): Promise<void> {
  const sql = getSql()
  if (winningBookingId) {
    await sql`DELETE FROM cash_flows WHERE booking_id = ${winningBookingId}`
    await sql`DELETE FROM payments WHERE booking_id = ${winningBookingId}`
    await sql`DELETE FROM bookings WHERE id = ${winningBookingId}`
  }
  if (playerIds.length > 0) {
    await sql`DELETE FROM player_tenant_relationships WHERE player_id = ANY(${playerIds})`
    await sql`DELETE FROM players WHERE id = ANY(${playerIds})`
  }
}

function tomorrowIso(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const slot = {
    tenantId: E2E_TENANT_ID,
    courtId: E2E_COURT_ID,
    date: tomorrowIso(),
    timeStart: '10:00',
    timeEnd: '11:00',
  }

  console.log(`Creating ${SLOT_COUNT} stress players...`)
  const playerIds = await createStressPlayers(SLOT_COUNT)

  let winningBookingId: string | undefined
  let invariantHeld = false

  try {
    console.log(
      `Firing ${SLOT_COUNT} parallel bookings on ${slot.date} ${slot.timeStart}-${slot.timeEnd}...`,
    )
    const barrier = new Promise<void>((resolve) => setTimeout(resolve, 100))
    const promises = playerIds.map(async (pid) => {
      await barrier
      return attemptBooking(pid, slot)
    })
    const results = await Promise.all(promises)

    const accepted = results.filter((r) => r.ok && r.bookingId)
    const rejected = results.filter((r) => !r.ok || !r.bookingId)
    winningBookingId = accepted[0]?.bookingId

    console.log(`Accepted: ${accepted.length}`)
    console.log(`Rejected: ${rejected.length}`)
    const reasons = new Map<string, number>()
    for (const r of rejected) {
      const k = `${r.status}:${r.error ?? 'unknown'}`
      reasons.set(k, (reasons.get(k) ?? 0) + 1)
    }
    reasons.forEach((v, k) => console.log(`  ${k}: ${v}`))

    if (accepted.length !== 1) {
      console.error(`FAIL: expected exactly 1 accepted, got ${accepted.length}`)
      process.exitCode = 1
    } else {
      console.log('OK: invariant held (exactly 1 accepted)')
      invariantHeld = true
    }
  } finally {
    console.log('Cleaning up stress data...')
    await cleanupStress(playerIds, winningBookingId)
    await closeSql()
  }

  if (!invariantHeld) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
