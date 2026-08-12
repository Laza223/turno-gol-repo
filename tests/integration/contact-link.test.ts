/**
 * B13 — la lista única de personas y la vinculación manual.
 *
 * Lo que se prueba acá no se puede probar sin DB: la agrupación por teléfono
 * vive en SQL, el `UNION ALL` de dos orígenes distintos también, y la
 * vinculación toca tres tablas dentro de una transacción.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { CLIENTES_PAGE_SIZE, listTenantClients } from '@/app/(admin)/jugadores/queries'
import {
  linkContactToPlayer,
  unlinkContactFromPlayer,
} from '@/modules/relationships/contact-link.service'
import { normalizeContactPhone } from '@/modules/relationships/contact-identity'

const MONDAY = 1

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha B13'}, ${10},
      ${sql.json({
        rules: [
          {
            days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            from: '08:00',
            to: '23:00',
            price: 800000,
          },
        ],
      })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Un turno fijo cargado de mostrador: nombre + teléfono, sin cuenta. */
async function insertAbonado(
  tenantId: string,
  courtId: string,
  contactName: string,
  contactPhone: string,
  opts: { playerId?: string; timeStart?: string; status?: string } = {},
): Promise<string> {
  const sql = getSql()
  const timeStart = opts.timeStart ?? '20:00'
  const timeEnd = `${String(Number(timeStart.slice(0, 2)) + 1).padStart(2, '0')}:00`
  const rows = await sql<{ id: string }[]>`
    INSERT INTO abonados (
      tenant_id, court_id, player_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on, status
    )
    VALUES (
      ${tenantId}, ${courtId}, ${opts.playerId ?? null}, ${contactName}, ${contactPhone},
      ${MONDAY}, ${timeStart}::time, ${timeEnd}::time, ${800000}, ${'2030-01-07'}::date,
      ${opts.status ?? 'active'}::abonado_status
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Una reserva generada por ese fijo, sin dueño (como las crea el servicio). */
async function insertAbonadoBooking(
  tenantId: string,
  courtId: string,
  abonadoId: string,
  date: string,
  timeStart = '20:00',
): Promise<string> {
  const sql = getSql()
  const timeEnd = `${String(Number(timeStart.slice(0, 2)) + 1).padStart(2, '0')}:00`
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, abonado_id, date, time_start, time_end,
      starts_at, ends_at, type, status, price_snapshot, deposit_amount, deposit_status
    )
    VALUES (
      ${tenantId}, ${courtId}, NULL, ${abonadoId}, ${date}::date,
      ${timeStart}::time, ${timeEnd}::time,
      ${`${date}T${timeStart}:00-03:00`}::timestamptz,
      ${`${date}T${timeEnd}:00-03:00`}::timestamptz,
      'fixed', 'confirmed', ${800000}, 0, 'not_required'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function ptrCounters(tenantId: string, playerId: string) {
  const sql = getSql()
  const rows = await sql<{ bookings_count: number; last_booking_at: Date | null }[]>`
    SELECT bookings_count, last_booking_at FROM player_tenant_relationships
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `
  return rows[0]!
}

/** Solo las filas de la primera página — lo que asertan los casos de acá. */
const list = async (tenantId: string, q?: string) =>
  (await withTenantContext(tenantId, (tx) => listTenantClients(tenantId, { q }, tx))).rows

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

/**
 * B10 — la lista se cortaba en 200 SIN decirlo: la persona 201 no existía para
 * `/jugadores` y el único modo de alcanzarla era adivinar su nombre.
 */
describe('listTenantClients — paginación (B10)', () => {
  /** N personas registradas con relación en el tenant. */
  async function seedPersonas(tenantId: string, n: number): Promise<void> {
    const sql = getSql()
    await sql`
      WITH nuevos AS (
        INSERT INTO players (email, first_name, last_name, status, agreed_to_terms_at, terms_version)
        SELECT
          'b10_page_' || i || '_' || ${tenantId} || '@test.local',
          'Persona', LPAD(i::text, 4, '0'), 'active', NOW(), 'v1'
        FROM generate_series(1, ${n}) i
        RETURNING id
      )
      INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count)
      SELECT ${tenantId}, id, 0 FROM nuevos
    `
  }

  it('devuelve una página completa y avisa que hay más', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await seedPersonas(tenant.id, CLIENTES_PAGE_SIZE + 3)

    const primera = await withTenantContext(tenant.id, (tx) => listTenantClients(tenant.id, {}, tx))

    // El `LIMIT n+1` es para DETECTAR, no para devolver una fila de más.
    expect(primera.rows).toHaveLength(CLIENTES_PAGE_SIZE)
    expect(primera.hasMore).toBe(true)
  })

  it('las páginas no se pisan ni se saltean personas', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const total = CLIENTES_PAGE_SIZE + 3
    await seedPersonas(tenant.id, total)

    const p0 = await withTenantContext(tenant.id, (tx) => listTenantClients(tenant.id, {}, tx, 0))
    const p1 = await withTenantContext(tenant.id, (tx) => listTenantClients(tenant.id, {}, tx, 1))
    const keys = new Set([...p0.rows, ...p1.rows].map((r) => r.key))

    expect(p1.rows).toHaveLength(3)
    expect(p1.hasMore).toBe(false)
    expect(keys.size).toBe(total)
  })

  it('una página fuera de rango devuelve vacío, no la primera', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await seedPersonas(tenant.id, 2)

    const lejos = await withTenantContext(tenant.id, (tx) =>
      listTenantClients(tenant.id, {}, tx, 9),
    )

    expect(lejos.rows).toHaveLength(0)
    expect(lejos.hasMore).toBe(false)
  })
})

describe('listTenantClients — la lista única de personas (B13)', () => {
  it('muestra al titular de un fijo que no tiene cuenta', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    await insertAbonado(tenant.id, courtId, 'Diego del lunes', '11 2233-4455')

    const rows = await list(tenant.id)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'contact',
      playerId: null,
      name: 'Diego del lunes',
      fixedCount: 1,
    })
    // La clave del grupo es el teléfono normalizado — el mismo que calcula el TS.
    expect(rows[0]!.key).toBe(normalizeContactPhone('11 2233-4455'))
  })

  it('agrupa en UNA persona dos fijos del mismo teléfono escrito distinto', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    await insertAbonado(tenant.id, courtId, 'Diego', '11 2233-4455', { timeStart: '20:00' })
    await insertAbonado(tenant.id, courtId, 'Diego S.', '+54 9 11 2233-4455', {
      timeStart: '21:00',
    })

    const rows = await list(tenant.id)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.fixedCount).toBe(2)
    // Gana el nombre del fijo más reciente.
    expect(rows[0]!.name).toBe('Diego S.')
  })

  it('NO fusiona dos personas distintas con el teléfono mal cargado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    await insertAbonado(tenant.id, courtId, 'Uno', 'no tiene', { timeStart: '20:00' })
    await insertAbonado(tenant.id, courtId, 'Otro', 's/d', { timeStart: '21:00' })

    const rows = await list(tenant.id)

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.name).sort()).toEqual(['Otro', 'Uno'])
    // Sin teléfono utilizable, la clave cae al id de la fila.
    for (const r of rows) expect(r.key.startsWith('id:')).toBe(true)
  })

  it('sugiere al jugador con el mismo teléfono, incluso escrito con 0 y 15', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await sql`UPDATE players SET phone = ${'+54 9 11 2233-4455'} WHERE id = ${player.id}`
    await linkPlayerToTenant(sql, tenant.id, player.id)
    // El complejo lo anotó como lo escribe medio país: la cola de 10 dígitos NO
    // coincide (el `15` la corre), la de 8 sí. La sugerencia usa la de 8.
    await insertAbonado(tenant.id, courtId, 'Diego del lunes', '011 15 2233-4455')

    const rows = await list(tenant.id)
    const contacto = rows.find((r) => r.kind === 'contact')

    expect(contacto?.suggestedPlayerId).toBe(player.id)
    expect(contacto?.suggestedPlayerName).toBeTruthy()
  })

  it('no filtra contactos de otro complejo', async () => {
    const sql = getSql()
    const a = await createTestTenant(sql)
    const b = await createTestTenant(sql)
    const courtA = await insertCourt(a.id)
    await insertAbonado(a.id, courtA, 'Solo de A', '11 9999-0000')

    expect((await list(a.id)).map((r) => r.name)).toContain('Solo de A')
    expect((await list(b.id)).map((r) => r.name)).not.toContain('Solo de A')
  })

  it('el buscador encuentra a una persona sin cuenta por nombre y por teléfono', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    await insertAbonado(tenant.id, courtId, 'Ramiro Quiroga', '11 7777-8888')

    expect((await list(tenant.id, 'Quiroga')).map((r) => r.name)).toEqual(['Ramiro Quiroga'])
    expect((await list(tenant.id, '7777')).map((r) => r.name)).toEqual(['Ramiro Quiroga'])
    expect(await list(tenant.id, 'nadie-con-este-nombre')).toEqual([])
  })
})

describe('linkContactToPlayer / unlinkContactFromPlayer (B13)', () => {
  it('vincula los fijos, reasigna sus reservas y actualiza el contador de la relación', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenant.id, player.id)

    const abonadoId = await insertAbonado(tenant.id, courtId, 'Diego', '11 2233-4455')
    await insertAbonadoBooking(tenant.id, courtId, abonadoId, '2030-01-07')
    await insertAbonadoBooking(tenant.id, courtId, abonadoId, '2030-01-14')

    const before = await ptrCounters(tenant.id, player.id)

    const result = await withTenantContext(tenant.id, (tx) =>
      linkContactToPlayer(tenant.id, normalizeContactPhone('11 2233-4455'), player.id, tx),
    )

    expect(result).toEqual({ abonadosLinked: 1, bookingsReassigned: 2 })

    const after = await ptrCounters(tenant.id, player.id)
    expect(after.bookings_count).toBe(before.bookings_count + 2)
    expect(after.last_booking_at).not.toBeNull()

    // Y la persona deja de figurar como "sin cuenta": ahora es una sola fila.
    const rows = await list(tenant.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'player', playerId: player.id, fixedCount: 1 })
    expect(rows[0]!.bookingsCount).toBe(after.bookings_count)
  })

  it('es idempotente: el segundo click no vuelve a contar', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    const abonadoId = await insertAbonado(tenant.id, courtId, 'Diego', '11 2233-4455')
    await insertAbonadoBooking(tenant.id, courtId, abonadoId, '2030-01-07')

    const key = normalizeContactPhone('11 2233-4455')
    await withTenantContext(tenant.id, (tx) => linkContactToPlayer(tenant.id, key, player.id, tx))
    const afterFirst = await ptrCounters(tenant.id, player.id)

    const second = await withTenantContext(tenant.id, (tx) =>
      linkContactToPlayer(tenant.id, key, player.id, tx),
    )

    expect(second).toEqual({ abonadosLinked: 0, bookingsReassigned: 0 })
    expect((await ptrCounters(tenant.id, player.id)).bookings_count).toBe(afterFirst.bookings_count)
  })

  it('rechaza vincular con un jugador que no es cliente del complejo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const otro = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const ajeno = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, otro.id, ajeno.id)
    await insertAbonado(tenant.id, courtId, 'Diego', '11 2233-4455')

    const result = await withTenantContext(tenant.id, (tx) =>
      linkContactToPlayer(tenant.id, normalizeContactPhone('11 2233-4455'), ajeno.id, tx),
    )

    expect(result).toBeNull()
    // Y el fijo sigue sin dueño.
    const rows = await list(tenant.id)
    expect(rows.find((r) => r.kind === 'contact')).toBeDefined()
  })

  it('desvincular deja exactamente el estado anterior', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    const abonadoId = await insertAbonado(tenant.id, courtId, 'Diego', '11 2233-4455')
    await insertAbonadoBooking(tenant.id, courtId, abonadoId, '2030-01-07')
    await insertAbonadoBooking(tenant.id, courtId, abonadoId, '2030-01-14')

    const key = normalizeContactPhone('11 2233-4455')
    const antes = await ptrCounters(tenant.id, player.id)

    await withTenantContext(tenant.id, (tx) => linkContactToPlayer(tenant.id, key, player.id, tx))
    const undo = await withTenantContext(tenant.id, (tx) =>
      unlinkContactFromPlayer(tenant.id, player.id, tx),
    )

    expect(undo).toEqual({ abonadosUnlinked: 1, bookingsReverted: 2 })
    expect((await ptrCounters(tenant.id, player.id)).bookings_count).toBe(antes.bookings_count)

    // La persona vuelve a la lista como contacto, con su nombre intacto.
    const rows = await list(tenant.id)
    const contacto = rows.find((r) => r.kind === 'contact')
    expect(contacto?.name).toBe('Diego')
    expect(contacto?.fixedCount).toBe(1)
  })

  it('no toca reservas de otro complejo aunque compartan el teléfono', async () => {
    const sql = getSql()
    const a = await createTestTenant(sql)
    const b = await createTestTenant(sql)
    const courtA = await insertCourt(a.id)
    const courtB = await insertCourt(b.id)
    const player = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, a.id, player.id)

    await insertAbonado(a.id, courtA, 'Diego', '11 2233-4455')
    const abonadoB = await insertAbonado(b.id, courtB, 'Diego', '11 2233-4455')
    await insertAbonadoBooking(b.id, courtB, abonadoB, '2030-01-07')

    await withTenantContext(a.id, (tx) =>
      linkContactToPlayer(a.id, normalizeContactPhone('11 2233-4455'), player.id, tx),
    )

    const rows = await sql<{ player_id: string | null }[]>`
      SELECT player_id FROM abonados WHERE id = ${abonadoB}
    `
    expect(rows[0]!.player_id).toBeNull()
    expect((await list(b.id)).find((r) => r.kind === 'contact')).toBeDefined()
  })
})
