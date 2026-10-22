/**
 * Clientes que dejaron de venir — `/jugadores?filtro=dejaron-de-venir`.
 * Decisión: docs/decisions/2026-10-22-clientes-que-dejaron-de-venir.md.
 *
 * La regla vive en SQL (`listTenantClients`): 3 reservas o más que no se
 * cayeron, la última hace más de 4 semanas, sin turno fijo vigente y sin
 * bloqueo. Los números van literales a propósito: son la decisión del dueño,
 * no un detalle de implementación que el test tenga que seguir.
 *
 * Todo se siembra por `adminSql()` y la lectura pasa por `withTenantContext`
 * (`getDb()`): así el archivo también corre con `DATABASE_URL` apuntando al
 * rol real de la app (`turnogol_app`, RLS enforced) y
 * `TEST_ADMIN_DATABASE_URL` al superusuario.
 *
 * Requiere Postgres con las migraciones aplicadas y DATABASE_URL.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, withTenantContext } from '@/shared/db/client'
import {
  CLIENTES_PAGE_SIZE,
  listTenantClients,
  type ClientListPage,
} from '@/app/(admin)/jugadores/queries'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { artDateOf } from '@/shared/time/art-date'
import { adminSql } from '../helpers/admin-db'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { insertBooking } from '../helpers/factories'

const MONDAY = 1

/** Día operativo ART de hace `n` días (negativo = futuro). */
const daysAgo = (n: number) => addDays(artTodayStr(), -n)

async function insertCourt(tenantId: string): Promise<string> {
  const su = adminSql()
  const rows = await su<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha dormidos'}, ${10}, ${su.json({ rules: [] })}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function seedPlayer(tenantId: string, firstName?: string): Promise<string> {
  const su = adminSql()
  const p = await createTestPlayer(su)
  await linkPlayerToTenant(su, tenantId, p.id)
  if (firstName) await su`UPDATE players SET first_name = ${firstName} WHERE id = ${p.id}`
  return p.id
}

/**
 * Una reserva de `playerId` hace `ago` días. Cada persona usa su propia hora
 * para no chocar con el exclusion constraint de la cancha.
 */
async function book(
  tenantId: string,
  courtId: string,
  playerId: string,
  ago: number,
  hour: number,
  status = 'completed',
): Promise<void> {
  const h = String(hour).padStart(2, '0')
  const h1 = String(hour + 1).padStart(2, '0')
  await insertBooking(adminSql(), {
    tenantId,
    courtId,
    playerId,
    date: daysAgo(ago),
    timeStart: `${h}:00`,
    timeEnd: `${h1}:00`,
    status,
  })
}

async function insertAbonado(
  tenantId: string,
  courtId: string,
  contactName: string,
  contactPhone: string,
  hour: number,
  opts: { playerId?: string; status?: 'active' | 'paused' | 'canceled'; endsOn?: string } = {},
): Promise<string> {
  const su = adminSql()
  const h = String(hour).padStart(2, '0')
  const h1 = String(hour + 1).padStart(2, '0')
  const rows = await su<{ id: string }[]>`
    INSERT INTO abonados (
      tenant_id, court_id, player_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on, ends_on, status
    )
    VALUES (
      ${tenantId}, ${courtId}, ${opts.playerId ?? null}, ${contactName}, ${contactPhone},
      ${MONDAY}, ${`${h}:00`}::time, ${`${h1}:00`}::time, ${800000}, ${daysAgo(120)}::date,
      ${opts.endsOn ?? null}::date, ${opts.status ?? 'active'}::abonado_status
    )
    RETURNING id
  `
  return rows[0]!.id
}

/**
 * Una reserva generada por un fijo, con `player_id` NULL: así quedan las
 * pasadas de un contacto aunque después se vincule a una cuenta (la
 * vinculación solo mueve las pendientes y confirmadas).
 */
async function bookFixed(
  tenantId: string,
  courtId: string,
  abonadoId: string,
  ago: number,
  hour: number,
  playerId: string | null = null,
): Promise<void> {
  const su = adminSql()
  const date = daysAgo(ago)
  const h = String(hour).padStart(2, '0')
  const h1 = String(hour + 1).padStart(2, '0')
  await su`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, abonado_id, date, time_start, time_end,
      starts_at, ends_at, type, status, price_snapshot, deposit_amount, deposit_status
    )
    VALUES (
      ${tenantId}, ${courtId}, ${playerId}, ${abonadoId}, ${date}::date,
      ${`${h}:00`}::time, ${`${h1}:00`}::time,
      ${`${date}T${h}:00:00-03:00`}::timestamptz,
      ${`${date}T${h1}:00:00-03:00`}::timestamptz,
      'fixed', 'completed', ${800000}, 0, 'not_required'
    )
  `
}

const list = (tenantId: string, filters: { q?: string; dormant?: boolean } = {}, page = 0) =>
  withTenantContext(tenantId, (tx) => listTenantClients(tenantId, filters, tx, page))

/**
 * Una reserva que empezó en `NOW() - 28 días` corrido `offsetHours` horas, a
 * hora en punto, con `date` y `time_start` derivados de ese instante en ART.
 * Sirve para pararse a horas del corte, que se mide en instantes y no en días.
 */
async function bookAroundCutoff(
  tenantId: string,
  courtId: string,
  playerId: string,
  offsetHours: number,
): Promise<void> {
  await adminSql()`
    WITH i AS (
      SELECT date_trunc('hour', NOW() - interval '28 days') + make_interval(hours => ${offsetHours}::int) AS s
    ), l AS (
      SELECT s, (s AT TIME ZONE 'America/Argentina/Buenos_Aires') AS art FROM i
    )
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      status, price_snapshot, deposit_amount, deposit_status
    )
    SELECT ${tenantId}, ${courtId}, ${playerId}, art::date, art::time,
      CASE WHEN art::time = '23:00' THEN '24:00'::time ELSE art::time + interval '1 hour' END,
      s, s + interval '1 hour', 'completed', ${800000}, 0, 'not_required'
    FROM l
  `
}

const keysOf = (page: ClientListPage) => page.rows.map((r) => r.key)

beforeAll(async () => {
  const su = adminSql()
  await su`SELECT 1`
  await ensureRoles(su)
  await cleanupAll(su)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('clientes que dejaron de venir', () => {
  it('3 reservas y la última hace más de 4 semanas: aparece, con el día de esa última', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)
    const p = await seedPlayer(tenant.id)
    await book(tenant.id, court, p, 60, 14)
    await book(tenant.id, court, p, 45, 14)
    await book(tenant.id, court, p, 30, 14)

    const dormant = await list(tenant.id, { dormant: true })
    expect(keysOf(dormant)).toEqual([p])
    expect(dormant.total).toBe(1)
    expect(dormant.dormantTotal).toBe(1)
    const row = dormant.rows[0]!
    expect(row.lastActiveAt).not.toBeNull()
    expect(artDateOf(new Date(row.lastActiveAt!))).toBe(daysAgo(30))

    // Sin el filtro sigue en la lista de siempre, y el contador ya lo cuenta.
    const all = await list(tenant.id)
    expect(keysOf(all)).toEqual([p])
    expect(all.dormantTotal).toBe(1)
  })

  it('con 2 reservas no alcanza: las canceladas y las vencidas no suman', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)
    const p = await seedPlayer(tenant.id)
    await book(tenant.id, court, p, 60, 14)
    await book(tenant.id, court, p, 45, 14)
    await book(tenant.id, court, p, 40, 14, 'canceled_no_refund')
    await book(tenant.id, court, p, 35, 14, 'canceled_refunded')
    await book(tenant.id, court, p, 33, 14, 'expired')

    const dormant = await list(tenant.id, { dormant: true })
    expect(dormant.rows).toEqual([])
    expect(dormant.dormantTotal).toBe(0)
  })

  it('una reserva en las últimas 4 semanas, o una futura, lo saca; una cancelada reciente no', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)

    const reciente = await seedPlayer(tenant.id)
    await book(tenant.id, court, reciente, 60, 10)
    await book(tenant.id, court, reciente, 45, 10)
    await book(tenant.id, court, reciente, 20, 10)

    const conFutura = await seedPlayer(tenant.id)
    await book(tenant.id, court, conFutura, 60, 12)
    await book(tenant.id, court, conFutura, 45, 12)
    await book(tenant.id, court, conFutura, 30, 12)
    await book(tenant.id, court, conFutura, -3, 12, 'confirmed')

    const canceloHace5 = await seedPlayer(tenant.id)
    await book(tenant.id, court, canceloHace5, 60, 14)
    await book(tenant.id, court, canceloHace5, 45, 14)
    await book(tenant.id, court, canceloHace5, 30, 14)
    await book(tenant.id, court, canceloHace5, 5, 14, 'canceled_no_refund')

    // Una ausencia cuenta: reservó, aunque no haya venido.
    const faltoAlaUltima = await seedPlayer(tenant.id)
    await book(tenant.id, court, faltoAlaUltima, 60, 16)
    await book(tenant.id, court, faltoAlaUltima, 45, 16)
    await book(tenant.id, court, faltoAlaUltima, 40, 16, 'no_show')

    const dormant = await list(tenant.id, { dormant: true })
    expect(keysOf(dormant).sort()).toEqual([canceloHace5, faltoAlaUltima].sort())
    expect(dormant.dormantTotal).toBe(2)
  })

  it('un turno fijo activo nunca está dormido; uno cancelado sí, con cuenta o sin cuenta', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)

    // Sin cuenta, fijo activo: sigue viniendo aunque las pasadas sean viejas.
    const activo = await insertAbonado(tenant.id, court, 'Fijo Activo', '11 4000-1111', 10)
    await bookFixed(tenant.id, court, activo, 60, 10)
    await bookFixed(tenant.id, court, activo, 45, 10)
    await bookFixed(tenant.id, court, activo, 30, 10)

    // Sin cuenta, fijo dado de baja: es el cliente a recuperar.
    const baja = await insertAbonado(tenant.id, court, 'Fijo De Baja', '11 4000-2222', 12, {
      status: 'canceled',
    })
    await bookFixed(tenant.id, court, baja, 60, 12)
    await bookFixed(tenant.id, court, baja, 45, 12)
    await bookFixed(tenant.id, court, baja, 30, 12)

    // Con cuenta y fijo vinculado ya cancelado: sus reservas pasadas quedaron
    // con player_id NULL, y tienen que contar igual.
    const vinculado = await seedPlayer(tenant.id)
    const suyo = await insertAbonado(tenant.id, court, 'Vinculado', '11 4000-3333', 14, {
      playerId: vinculado,
      status: 'canceled',
    })
    await bookFixed(tenant.id, court, suyo, 60, 14)
    await bookFixed(tenant.id, court, suyo, 45, 14)
    await bookFixed(tenant.id, court, suyo, 30, 14)

    // Con cuenta y fijo activo a su nombre.
    const conFijo = await seedPlayer(tenant.id)
    await insertAbonado(tenant.id, court, 'Con Fijo', '11 4000-4444', 16, { playerId: conFijo })
    await book(tenant.id, court, conFijo, 60, 16)
    await book(tenant.id, court, conFijo, 45, 16)
    await book(tenant.id, court, conFijo, 30, 16)

    const dormant = await list(tenant.id, { dormant: true })
    const names = dormant.rows.map((r) => `${r.kind}:${r.kind === 'contact' ? r.name : r.key}`)
    expect(names.sort()).toEqual(['contact:Fijo De Baja', `player:${vinculado}`].sort())
    expect(dormant.dormantTotal).toBe(2)
  })

  it('bloqueado en el complejo, con ban global vigente o anonimizado: no aparece', async () => {
    const su = adminSql()
    const tenant = await createTestTenant(su)
    const court = await insertCourt(tenant.id)

    const players: Record<string, string> = {}
    const hours: Record<string, number> = {
      bloqueado: 8,
      bloqueoVencido: 10,
      banGlobal: 12,
      banGlobalVencido: 14,
      anonimizado: 16,
    }
    for (const [name, hour] of Object.entries(hours)) {
      const p = await seedPlayer(tenant.id)
      players[name] = p
      await book(tenant.id, court, p, 60, hour)
      await book(tenant.id, court, p, 45, hour)
      await book(tenant.id, court, p, 30, hour)
    }
    await su`
      INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_until)
      VALUES (${tenant.id}, ${players.bloqueado!}, 'test', NOW() + interval '5 days')
    `
    await su`
      INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_at, banned_until)
      VALUES (${tenant.id}, ${players.bloqueoVencido!}, 'test',
              NOW() - interval '20 days', NOW() - interval '10 days')
    `
    await su`UPDATE players SET status = 'banned', ban_until = NULL WHERE id = ${players.banGlobal!}`
    await su`
      UPDATE players SET status = 'banned', ban_until = NOW() - interval '1 day'
      WHERE id = ${players.banGlobalVencido!}
    `
    await su`UPDATE players SET status = 'anonymized' WHERE id = ${players.anonimizado!}`

    const dormant = await list(tenant.id, { dormant: true })
    expect(keysOf(dormant).sort()).toEqual(
      [players.bloqueoVencido!, players.banGlobalVencido!].sort(),
    )
  })

  it('lo que reservó en otro complejo no cuenta', async () => {
    const su = adminSql()
    const tenantA = await createTestTenant(su)
    const tenantB = await createTestTenant(su)
    const courtA = await insertCourt(tenantA.id)
    const courtB = await insertCourt(tenantB.id)
    const p = await seedPlayer(tenantA.id)
    await linkPlayerToTenant(su, tenantB.id, p)
    await book(tenantA.id, courtA, p, 60, 14)
    await book(tenantA.id, courtA, p, 45, 14)
    await book(tenantA.id, courtA, p, 30, 14)
    await book(tenantB.id, courtB, p, 2, 14)
    await book(tenantB.id, courtB, p, -2, 14, 'confirmed')

    expect(keysOf(await list(tenantA.id, { dormant: true }))).toEqual([p])
    expect(keysOf(await list(tenantB.id, { dormant: true }))).toEqual([])
  })

  it('va de la que se fue hace menos a la que se fue hace más, y el contador respeta la búsqueda', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)

    const viejo = await seedPlayer(tenant.id, 'Bartolo')
    await book(tenant.id, court, viejo, 90, 10)
    await book(tenant.id, court, viejo, 80, 10)
    await book(tenant.id, court, viejo, 70, 10)

    const reciente = await seedPlayer(tenant.id, 'Anacleto')
    await book(tenant.id, court, reciente, 60, 12)
    await book(tenant.id, court, reciente, 45, 12)
    await book(tenant.id, court, reciente, 31, 12)

    const activo = await seedPlayer(tenant.id, 'Casimiro')
    await book(tenant.id, court, activo, 10, 14)

    const dormant = await list(tenant.id, { dormant: true })
    expect(keysOf(dormant)).toEqual([reciente, viejo])
    expect(dormant.dormantTotal).toBe(2)

    const all = await list(tenant.id)
    expect(all.total).toBe(3)
    expect(all.dormantTotal).toBe(2)

    const buscado = await list(tenant.id, { q: 'Bartolo' })
    expect(keysOf(buscado)).toEqual([viejo])
    expect(buscado.dormantTotal).toBe(1)

    const buscadoDormido = await list(tenant.id, { q: 'Bartolo', dormant: true })
    expect(keysOf(buscadoDormido)).toEqual([viejo])
  })

  it('un fijo pausado (estado legacy) no protege, con cuenta o sin cuenta', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)

    const pausado = await insertAbonado(tenant.id, court, 'Fijo Pausado', '11 4100-1111', 10, {
      status: 'paused',
    })
    await bookFixed(tenant.id, court, pausado, 60, 10)
    await bookFixed(tenant.id, court, pausado, 45, 10)
    await bookFixed(tenant.id, court, pausado, 30, 10)

    const conPausado = await seedPlayer(tenant.id)
    await insertAbonado(tenant.id, court, 'Con Pausado', '11 4100-2222', 12, {
      playerId: conPausado,
      status: 'paused',
    })
    await book(tenant.id, court, conPausado, 60, 12)
    await book(tenant.id, court, conPausado, 45, 12)
    await book(tenant.id, court, conPausado, 30, 12)

    const dormant = await list(tenant.id, { dormant: true })
    const names = dormant.rows.map((r) => `${r.kind}:${r.kind === 'contact' ? r.name : r.key}`)
    expect(names.sort()).toEqual(['contact:Fijo Pausado', `player:${conPausado}`].sort())
  })

  it('un fijo activo con la fecha de fin vencida no protege; hasta el último día, sí', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)

    // Terminó ayer y nadie lo dio de baja: ya no genera turnos.
    const vencido = await insertAbonado(tenant.id, court, 'Fijo Vencido', '11 4150-1111', 10, {
      endsOn: daysAgo(1),
    })
    await bookFixed(tenant.id, court, vencido, 60, 10)
    await bookFixed(tenant.id, court, vencido, 45, 10)
    await bookFixed(tenant.id, court, vencido, 30, 10)

    // `ends_on` es inclusivo: el que termina hoy todavía está vigente.
    const terminaHoy = await insertAbonado(tenant.id, court, 'Termina Hoy', '11 4150-2222', 12, {
      endsOn: daysAgo(0),
    })
    await bookFixed(tenant.id, court, terminaHoy, 60, 12)
    await bookFixed(tenant.id, court, terminaHoy, 45, 12)
    await bookFixed(tenant.id, court, terminaHoy, 30, 12)

    const conVencido = await seedPlayer(tenant.id)
    await insertAbonado(tenant.id, court, 'Con Vencido', '11 4150-3333', 14, {
      playerId: conVencido,
      endsOn: daysAgo(1),
    })
    await book(tenant.id, court, conVencido, 60, 14)
    await book(tenant.id, court, conVencido, 45, 14)
    await book(tenant.id, court, conVencido, 30, 14)

    const conFuturo = await seedPlayer(tenant.id)
    await insertAbonado(tenant.id, court, 'Con Futuro', '11 4150-4444', 16, {
      playerId: conFuturo,
      endsOn: daysAgo(-30),
    })
    await book(tenant.id, court, conFuturo, 60, 16)
    await book(tenant.id, court, conFuturo, 45, 16)
    await book(tenant.id, court, conFuturo, 30, 16)

    const dormant = await list(tenant.id, { dormant: true })
    const names = dormant.rows.map((r) => `${r.kind}:${r.kind === 'contact' ? r.name : r.key}`)
    expect(names.sort()).toEqual(['contact:Fijo Vencido', `player:${conVencido}`].sort())
    expect(dormant.dormantTotal).toBe(2)
  })

  it('un contacto con dos fijos, uno activo y otro de baja, sigue viniendo', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)

    // Mismo nombre y teléfono: es la misma persona, agrupada en una fila.
    const baja = await insertAbonado(tenant.id, court, 'Dos Fijos', '11 4200-1111', 10, {
      status: 'canceled',
    })
    await insertAbonado(tenant.id, court, 'Dos Fijos', '11 4200-1111', 12)
    await bookFixed(tenant.id, court, baja, 60, 10)
    await bookFixed(tenant.id, court, baja, 45, 10)
    await bookFixed(tenant.id, court, baja, 30, 10)

    const all = await list(tenant.id)
    expect(all.rows.filter((r) => r.name === 'Dos Fijos')).toHaveLength(1)
    const dormant = await list(tenant.id, { dormant: true })
    expect(dormant.rows).toEqual([])
    expect(dormant.dormantTotal).toBe(0)
  })

  it('una reserva con cuenta Y fijo a la vez cuenta una sola vez', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)
    const p = await seedPlayer(tenant.id)
    const suyo = await insertAbonado(tenant.id, court, 'Doble Camino', '11 4300-1111', 10, {
      playerId: p,
      status: 'canceled',
    })
    // Dos reservas: si se sumaran por los dos caminos serían cuatro y pasaría el mínimo.
    await bookFixed(tenant.id, court, suyo, 60, 10, p)
    await bookFixed(tenant.id, court, suyo, 45, 10, p)

    expect((await list(tenant.id, { dormant: true })).rows).toEqual([])

    await bookFixed(tenant.id, court, suyo, 30, 10, p)
    expect(keysOf(await list(tenant.id, { dormant: true }))).toEqual([p])
  })

  it('el corte es el instante de inicio: a horas de las 4 semanas, antes entra y después no', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)

    const antes = await seedPlayer(tenant.id)
    await book(tenant.id, court, antes, 60, 8)
    await book(tenant.id, court, antes, 45, 8)
    await bookAroundCutoff(tenant.id, court, antes, -1)

    const despues = await seedPlayer(tenant.id)
    await book(tenant.id, court, despues, 60, 10)
    await book(tenant.id, court, despues, 45, 10)
    await bookAroundCutoff(tenant.id, court, despues, 2)

    expect(keysOf(await list(tenant.id, { dormant: true }))).toEqual([antes])
  })

  it('un bloqueo en OTRO complejo no lo saca de la lista de este', async () => {
    const su = adminSql()
    const tenantA = await createTestTenant(su)
    const tenantB = await createTestTenant(su)
    const court = await insertCourt(tenantA.id)
    const p = await seedPlayer(tenantA.id)
    await linkPlayerToTenant(su, tenantB.id, p)
    await book(tenantA.id, court, p, 60, 14)
    await book(tenantA.id, court, p, 45, 14)
    await book(tenantA.id, court, p, 30, 14)
    await su`
      INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_until)
      VALUES (${tenantB.id}, ${p}, 'test', NULL)
    `

    expect(keysOf(await list(tenantA.id, { dormant: true }))).toEqual([p])
  })

  it('con más de una página: el contador es el total y no se repite ni se pierde nadie', async () => {
    const tenant = await createTestTenant(adminSql())
    const court = await insertCourt(tenant.id)
    const count = CLIENTES_PAGE_SIZE + 1
    // Cada persona usa una hora y una tanda de días propias: nada se pisa en la cancha.
    for (let i = 0; i < count; i++) {
      const p = await seedPlayer(tenant.id)
      const hour = 8 + (i % 14)
      const base = 30 + Math.floor(i / 14) * 3
      for (let k = 0; k < 3; k++) await book(tenant.id, court, p, base + k, hour)
    }

    const first = await list(tenant.id, { dormant: true }, 0)
    const second = await list(tenant.id, { dormant: true }, 1)
    expect(first.rows).toHaveLength(CLIENTES_PAGE_SIZE)
    expect(second.rows).toHaveLength(1)
    for (const page of [first, second]) {
      expect(page.total).toBe(count)
      expect(page.dormantTotal).toBe(count)
    }
    expect(new Set([...keysOf(first), ...keysOf(second)]).size).toBe(count)
    // En "Todas", la segunda página también trae el contador entero.
    expect((await list(tenant.id, {}, 1)).dormantTotal).toBe(count)
  }, 60_000)
})
