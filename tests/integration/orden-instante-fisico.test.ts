/**
 * Misma clase de bug que el fix de `/reservas` (reservas-queries.test.ts), en
 * las otras consultas que listan turnos o canchas:
 *
 * - En un complejo `closes_next_day`, el turno de 00:00 se guarda con `date` =
 *   día operativo y `time_start` '00:00'. Ordenar por `time_start` lo pone por
 *   debajo del de las 23:00 del mismo día operativo aunque se jugó después.
 *   El instante físico es `starts_at`.
 * - Las canchas se ordenan por `created_at`, como la Grilla (`listCourts`),
 *   no por nombre de texto ("Cancha 10" antes que "Cancha 2").
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { AuthUser } from '@/modules/auth/types'

// Auth boundary de la page del jugador — hoisted antes de importarla.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

// withPlayer del route handler del export ARCO: mismo mock que
// arco-data-export.test.ts.
vi.mock('@/server/middleware/with-player', () => ({
  withPlayer:
    (handler: (req: NextRequest, user: { playerId: string }, tx: unknown) => unknown) =>
    async (req: NextRequest) => {
      const playerId = (globalThis as Record<string, unknown>).__AS_PLAYER__ as string
      const { getDb } = await import('@/shared/db/client')
      const { sql } = await import('drizzle-orm')
      return getDb().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE authenticated`)
        await tx.execute(sql`SELECT set_config('app.current_player_id', ${playerId}, true)`)
        return handler(req, { playerId }, tx)
      })
    },
}))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { getDebts } from '@/modules/bookings/booking.debts'
import { getPlayerBookingHistory } from '@/app/(admin)/jugadores/queries'
import MisReservasPage from '@/app/(player)/mis-reservas/page'
import type { MisReservasBookingRow } from '@/app/(player)/mis-reservas/MisReservasView'
import { GET as exportData } from '@/app/api/player/data-export/route'
import { getTenantDetail } from '@/modules/super-admin/tenants.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '00:00',
      to: '23:00',
      price: 900000,
    },
  ],
}

/** `date` a N días del día ART de hoy (negativo = pasado). */
function dayOffset(n: number): string {
  const base = new Date(Date.now() - 3 * 3600_000)
  base.setUTCDate(base.getUTCDate() + n)
  return base.toISOString().slice(0, 10)
}

/** El día calendario siguiente a `date` (YYYY-MM-DD). */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Cancha con `created_at` explícito, para que el orden entre canchas sea determinístico. */
async function seedCourtAt(tenantId: string, name: string, createdAt: string) {
  const sql = getSql()
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status, created_at)
    VALUES (${tenantId}, ${name}, 10, ${sql.json(PRICING)}, 'online', ${createdAt}::timestamptz)
    RETURNING id
  `
  return court[0]!.id
}

/**
 * Complejo `closes_next_day` con dos turnos del MISMO día operativo `date`:
 * 23:00–24:00 y 00:00–01:00 (físicamente al día siguiente). Devuelve los ids.
 */
async function seedNocheYMadrugada(params: {
  date: string
  status: 'completed' | 'confirmed'
  withPlayer: boolean
}) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  await sql`UPDATE tenants SET closes_next_day = true WHERE id = ${tenant.id}`
  const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
  let playerId: string | null = null
  if (params.withPlayer) {
    const player = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    playerId = player.id
  }
  const { date, status } = params
  const manana = nextDay(date)

  const insert = async (
    timeStart: string,
    timeEnd: string,
    startsAt: string,
    endsAt: string,
    guestName: string,
  ) => {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status, guest_name
      )
      VALUES (
        ${tenant.id}, ${courtId}, ${playerId}, ${date}::date, ${timeStart}, ${timeEnd},
        ${startsAt}::timestamptz, ${endsAt}::timestamptz,
        'spontaneous', ${status}::booking_status, 900000, 0, 'not_required', ${guestName}
      )
      RETURNING id
    `
    return rows[0]!.id
  }

  const idNoche = await insert(
    '23:00',
    '24:00',
    `${date}T23:00:00-03:00`,
    `${manana}T00:00:00-03:00`,
    'Noche',
  )
  const idMadrugada = await insert(
    '00:00',
    '01:00',
    `${manana}T00:00:00-03:00`,
    `${manana}T01:00:00-03:00`,
    'Madrugada',
  )
  return { tenantId: tenant.id, playerId, idNoche, idMadrugada }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

// Todas estas listas van de lo más reciente a lo más viejo: dentro del mismo
// día operativo, el turno de 00:00 (jugado después) va ARRIBA del de 23:00.
describe('orden por instante físico (starts_at) en complejos closes_next_day', () => {
  it('getDebts (Caja › Cuentas): el turno de 00:00 va antes que el de 23:00', async () => {
    const s = await seedNocheYMadrugada({
      date: dayOffset(-2),
      status: 'completed',
      withPlayer: false,
    })
    const rows = await withTenantContext(s.tenantId, (tx) => getDebts(s.tenantId, tx))
    expect(rows.map((r) => r.id)).toEqual([s.idMadrugada, s.idNoche])
  })

  it('getPlayerBookingHistory (ficha del jugador): el turno de 00:00 va antes que el de 23:00', async () => {
    const s = await seedNocheYMadrugada({
      date: dayOffset(-2),
      status: 'completed',
      withPlayer: true,
    })
    const rows = await withTenantContext(s.tenantId, (tx) =>
      getPlayerBookingHistory(s.tenantId, s.playerId!, tx),
    )
    expect(rows.map((r) => r.id)).toEqual([s.idMadrugada, s.idNoche])
  })

  it('/mis-reservas historial: el turno de 00:00 va antes que el de 23:00', async () => {
    const s = await seedNocheYMadrugada({
      date: dayOffset(-3),
      status: 'completed',
      withPlayer: true,
    })
    vi.mocked(extractAuthUser).mockResolvedValue({
      type: 'player',
      id: 'auth-uuid',
      email: 'p@test.local',
      playerId: s.playerId!,
    } as AuthUser)
    // La page devuelve `<RefundDialogProvider><MisReservasView …/></RefundDialogProvider>`.
    const el = (await MisReservasPage({
      searchParams: Promise.resolve({ tab: 'historial' }),
    })) as { props: { children: { props: { bookings: MisReservasBookingRow[] } } } }
    const rows = el.props.children.props.bookings
    expect(rows.map((r) => r.id)).toEqual([s.idMadrugada, s.idNoche])
  })

  it('export ARCO del jugador: el turno de 00:00 va antes que el de 23:00', async () => {
    const s = await seedNocheYMadrugada({
      date: dayOffset(-2),
      status: 'completed',
      withPlayer: true,
    })
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = s.playerId
    const res = await exportData(new NextRequest('http://localhost/api/player/data-export'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { bookings: Array<{ id: string }> } }
    expect(json.data.bookings.map((b) => b.id)).toEqual([s.idMadrugada, s.idNoche])
  })
})

describe('orden de canchas como la Grilla (created_at, no nombre)', () => {
  it('getTenantDetail (SuperAdmin): "Cancha 10" va al final, no entre la 1 y la 2', async () => {
    const tenant = await createTestTenant(getSql())
    for (let n = 1; n <= 10; n++) {
      await seedCourtAt(tenant.id, `Cancha ${n}`, `2099-01-01T00:${String(n).padStart(2, '0')}:00Z`)
    }
    const detail = await getTenantDetail(tenant.id)
    expect(detail?.courts.map((c) => c.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Cancha ${i + 1}`),
    )
  })
})
