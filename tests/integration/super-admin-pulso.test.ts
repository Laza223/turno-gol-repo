import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getPlatformActivity } from '@/modules/super-admin/activity.service'
import { getPlayerDetail, getPlayerStats, listPlayers } from '@/modules/super-admin/players.service'
import { insertBan, insertBooking, insertCourt } from '../helpers/factories'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

/**
 * Pulso y Jugadores del panel super-admin contra Postgres real: los conteos
 * por día ART, el predicado de "reserva online" y lo que NO sale del servicio
 * (texto libre sobre personas, contacto de un anonimizado). Con mocks esto no
 * se ve: el SQL crudo devuelve timestamps como string y arrays de enum como
 * literal de texto.
 */

const sql = getSql()

beforeEach(async () => {
  await ensureRoles(sql)
  await cleanupAll(sql)
})

afterAll(async () => {
  await cleanupAll(sql)
  await closeSql()
})

async function seedScene() {
  const tenant = await createTestTenant(sql, { name: 'El Vagón Deportivo' })
  const courtId = await insertCourt(sql, tenant.id)
  const staff = await createTestStaffUser(sql)

  const juan = await createTestPlayer(sql)
  const ana = await createTestPlayer(sql)
  const viejo = await createTestPlayer(sql)
  await sql`UPDATE players SET created_at = now() - interval '3 days' WHERE id = ${viejo.id}`
  await linkPlayerToTenant(sql, tenant.id, juan.id)

  // Online: la hizo el jugador desde el portal.
  const online = await insertBooking(sql, { tenantId: tenant.id, courtId, playerId: juan.id })
  // Vencida esperando la seña: el jugador abandonó el pago, no cuenta.
  await insertBooking(sql, {
    tenantId: tenant.id,
    courtId,
    playerId: ana.id,
    timeStart: '16:00',
    timeEnd: '17:00',
    status: 'expired',
  })
  // Cargada por el complejo para el mismo jugador.
  const byStaff = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId,
    playerId: juan.id,
    timeStart: '18:00',
    timeEnd: '19:00',
  })
  await sql`UPDATE bookings SET created_by_staff = ${staff.id} WHERE id = ${byStaff}`

  return { tenant, juan, ana, viejo, online }
}

describe('getPlatformActivity', () => {
  it('cuenta altas, reservas online y del complejo de hoy, sin las vencidas', async () => {
    const { tenant, juan, online } = await seedScene()

    const hoy = await getPlatformActivity('hoy')
    expect(hoy.current).toEqual({
      newPlayers: 2,
      onlineBookings: 1,
      staffBookings: 1,
      activeTenants: 1,
    })
    expect(hoy.previous.newPlayers).toBe(0)

    const semana = await getPlatformActivity('7d')
    expect(semana.current.newPlayers).toBe(3)

    expect(hoy.series).toHaveLength(14)
    expect(hoy.series.at(-1)).toMatchObject({ newPlayers: 2, onlineBookings: 1 })
    expect(hoy.series.reduce((acc, d) => acc + d.newPlayers, 0)).toBe(3)

    expect(hoy.recentOnlineBookings.map((b) => b.id)).toEqual([online])
    const feed = hoy.recentOnlineBookings[0]!
    expect(feed.tenantName).toBe(tenant.name)
    expect(feed.playerId).toBe(juan.id)
    expect(feed.createdAt).toBeInstanceOf(Date)
    expect(feed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const juanFeed = hoy.recentPlayers.find((p) => p.id === juan.id)
    expect(juanFeed?.firstTenantName).toBe(tenant.name)
  })

  it('un jugador anonimizado no muestra su nombre', async () => {
    const { juan } = await seedScene()
    await sql`UPDATE players SET status = 'anonymized' WHERE id = ${juan.id}`

    const hoy = await getPlatformActivity('hoy')
    expect(hoy.recentPlayers.find((p) => p.id === juan.id)?.name).toBe('Jugador anonimizado')
    expect(hoy.recentOnlineBookings[0]?.playerName).toBe('Jugador anonimizado')
  })
})

describe('Jugadores', () => {
  it('getPlayerStats cuenta altas y entradas de la semana', async () => {
    const { juan } = await seedScene()
    await sql`UPDATE players SET last_login_at = now() WHERE id = ${juan.id}`

    const stats = await getPlayerStats()
    expect(stats).toMatchObject({ total: 3, newToday: 2, new7d: 3, new30d: 3, active7d: 1 })
    expect(stats.series).toHaveLength(30)
  })

  it('listPlayers busca, filtra y cuenta complejos y reservas', async () => {
    const { juan, ana, viejo } = await seedScene()
    const [juanRow] = await sql<{ first_name: string }[]>`
      SELECT first_name FROM players WHERE id = ${juan.id}`

    const all = await listPlayers({ filter: 'todos', page: 0, pageSize: 25 })
    expect(all.total).toBe(3)
    const juanItem = all.rows.find((r) => r.id === juan.id)!
    expect(juanItem).toMatchObject({ tenantsCount: 1, bookingsCount: 2 })
    expect(juanItem.createdAt).toBeInstanceOf(Date)

    const byName = await listPlayers({
      q: juanRow!.first_name,
      filter: 'todos',
      page: 0,
      pageSize: 25,
    })
    expect(byName.rows.map((r) => r.id)).toContain(juan.id)

    const wildcard = await listPlayers({ q: '%', filter: 'todos', page: 0, pageSize: 25 })
    expect(wildcard.total).toBe(0)

    const withBookings = await listPlayers({ filter: 'con-reservas', page: 0, pageSize: 25 })
    expect(withBookings.rows.map((r) => r.id).sort()).toEqual([ana.id, juan.id].sort())

    await sql`UPDATE players SET created_at = now() - interval '20 days' WHERE id = ${viejo.id}`
    const nuevos = await listPlayers({ filter: 'nuevos', page: 0, pageSize: 25 })
    expect(nuevos.rows.map((r) => r.id)).not.toContain(viejo.id)

    await sql`UPDATE players SET status = 'banned' WHERE id = ${ana.id}`
    const bloqueados = await listPlayers({ filter: 'bloqueados', page: 0, pageSize: 25 })
    expect(bloqueados.rows.map((r) => r.id)).toEqual([ana.id])
  })

  it('el detalle trae etiquetas y bans del complejo, sin texto libre', async () => {
    const { tenant, juan } = await seedScene()
    await sql`
      UPDATE player_tenant_relationships
      SET tags = ARRAY['gets_credit','difficult']::player_tag[]
      WHERE player_id = ${juan.id}`
    await insertBan(sql, { tenantId: tenant.id, playerId: juan.id })
    await sql`UPDATE players SET ban_reason = 'texto libre que no debe salir' WHERE id = ${juan.id}`

    const detail = await getPlayerDetail(juan.id, { page: 0, pageSize: 20 })
    expect(detail).not.toBeNull()
    expect(detail!.tenants).toHaveLength(1)
    expect(detail!.tenants[0]).toMatchObject({
      tenantName: tenant.name,
      tags: ['gets_credit', 'difficult'],
      isBanned: true,
    })
    expect(detail!.bookingsTotal).toBe(2)
    expect(detail!.bookings.map((b) => b.online).sort()).toEqual([false, true])

    const serialized = JSON.stringify(detail)
    expect(serialized).not.toContain('texto libre que no debe salir')
    expect(serialized).not.toContain('no-show repetido')
  })

  it('un anonimizado no expone contacto', async () => {
    const { juan } = await seedScene()
    await sql`UPDATE players SET status = 'anonymized', phone = '1155550000' WHERE id = ${juan.id}`

    const detail = await getPlayerDetail(juan.id, { page: 0, pageSize: 20 })
    expect(detail!.player).toMatchObject({ email: null, phone: null, name: 'Jugador anonimizado' })

    const list = await listPlayers({ filter: 'todos', page: 0, pageSize: 25 })
    expect(list.rows.find((r) => r.id === juan.id)).toMatchObject({ email: null, phone: null })
  })

  it('un id que no existe devuelve null', async () => {
    expect(
      await getPlayerDetail('00000000-0000-4000-8000-000000000000', { page: 0, pageSize: 20 }),
    ).toBeNull()
  })
})
