import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { createAbonado, cancelAbonado } from '@/modules/abonados/abonado.service'
import { previewUpdateAbonado, updateAbonado } from '@/modules/abonados/abonado.update'
import {
  AbonadoAlreadyCanceledError,
  AbonadoMoveConflictError,
  AbonadoNotFoundError,
} from '@/modules/abonados/abonado.errors'
import type { UpdateAbonadoInput } from '@/modules/abonados/abonado.types'

// 2030-01-07 es lunes (dayOfWeek = 1): futuro lejano, sin choques esperables.
const ABO_START = '2030-01-07'
const PRICE = 800_000

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function insertCourt(tenantId: string, name = 'Cancha Edit Fijo'): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${name}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: PRICE }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function setup(opts: { withPlayer?: boolean } = {}) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const courtId = await insertCourt(tenant.id)
  const player = opts.withPlayer ? await createTestPlayer(sql) : null
  if (player) {
    await sql`
      INSERT INTO player_tenant_relationships (player_id, tenant_id)
      VALUES (${player.id}, ${tenant.id})
      ON CONFLICT DO NOTHING
    `
  }
  const { abonado } = await withTenantContext(tenant.id, (tx) =>
    createAbonado(
      tenant.id,
      staff.id,
      {
        courtId,
        playerId: player?.id,
        contactName: 'Cachi',
        contactPhone: '1122334455',
        dayOfWeek: 1,
        timeStart: '14:00',
        timeEnd: '15:00',
        pricePerSession: PRICE,
        startsOn: ABO_START,
        paymentMethod: 'cash',
      },
      tx,
    ),
  )
  return { sql, tenant, staff, courtId, abonado }
}

type Session = {
  id: string
  date: string
  time_start: string
  court_id: string
  price_snapshot: number
  guest_name: string | null
  guest_phone: string | null
  starts_at: string
}

async function sessionsOf(abonadoId: string): Promise<Session[]> {
  const sql = getSql()
  return sql<Session[]>`
    SELECT id, date::text AS date, time_start::text AS time_start, court_id,
           price_snapshot, guest_name, guest_phone, starts_at
    FROM bookings WHERE abonado_id = ${abonadoId} ORDER BY date
  `
}

function edit(tenantId: string, staffId: string, abonadoId: string, input: UpdateAbonadoInput) {
  return withTenantContext(tenantId, (tx) => updateAbonado(tenantId, abonadoId, staffId, input, tx))
}

/** El trigger de la migr. 089 solo deja cambiar el precio con este marcador. */
async function forcePrice(bookingId: string, price: number) {
  const sql = getSql()
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.booking_edit', 'on', true)`
    await tx`UPDATE bookings SET price_snapshot = ${price} WHERE id = ${bookingId}`
  })
}

async function addCharge(tenantId: string, staffId: string, bookingId: string, amount: number) {
  const sql = getSql()
  await sql`
    INSERT INTO cash_flows (tenant_id, type, category, amount, method, description,
                            booking_id, registered_by, occurred_at)
    VALUES (${tenantId}, 'income', 'booking', ${amount}, 'cash', 'Cobro de turno',
            ${bookingId}, ${staffId}, NOW())
  `
}

describe('updateAbonado — precio', () => {
  it('sube el precio: respeta el precio puesto a mano y actualiza el resto, con y sin cobro', async () => {
    const { tenant, staff, abonado } = await setup()
    const before = await sessionsOf(abonado.id)
    expect(before).toHaveLength(8)

    await forcePrice(before[0]!.id, 600_000) // promo puesta a mano
    await addCharge(tenant.id, staff.id, before[1]!.id, PRICE) // ya cobrada completa

    const out = await edit(tenant.id, staff.id, abonado.id, { pricePerSession: 1_000_000 })

    expect(out.futureSessions).toBe(8)
    expect(out.priceUpdated).toBe(7)
    expect(out.keptOwnPrice).toBe(1)
    expect(out.keptPaid).toBe(0)
    expect(out.moved).toBe(0)
    expect(out.abonado.pricePerSession).toBe(1_000_000)

    const after = await sessionsOf(abonado.id)
    expect(after[0]!.price_snapshot).toBe(600_000)
    for (const s of after.slice(1)) expect(s.price_snapshot).toBe(1_000_000)
  })

  it('baja el precio: la fecha con más cobrado que el precio nuevo no se toca', async () => {
    const { tenant, staff, abonado } = await setup()
    const before = await sessionsOf(abonado.id)
    await addCharge(tenant.id, staff.id, before[2]!.id, PRICE)

    const out = await edit(tenant.id, staff.id, abonado.id, { pricePerSession: 500_000 })

    expect(out.priceUpdated).toBe(7)
    expect(out.keptPaid).toBe(1)
    const after = await sessionsOf(abonado.id)
    expect(after[2]!.price_snapshot).toBe(PRICE)
    expect(after.filter((s) => s.price_snapshot === 500_000)).toHaveLength(7)
  })

  it('la vista previa da los mismos números y no escribe', async () => {
    const { tenant, staff, abonado } = await setup()
    const before = await sessionsOf(abonado.id)
    await forcePrice(before[0]!.id, 600_000)

    const preview = await withTenantContext(tenant.id, (tx) =>
      previewUpdateAbonado(tenant.id, abonado.id, { pricePerSession: 900_000 }, tx),
    )
    expect(preview).toMatchObject({
      futureSessions: 8,
      priceUpdated: 7,
      keptOwnPrice: 1,
      keptPaid: 0,
      moved: 0,
      conflictDates: [],
      fixedConflict: false,
    })
    const after = await sessionsOf(abonado.id)
    expect(after.filter((s) => s.price_snapshot === PRICE)).toHaveLength(7)

    const real = await edit(tenant.id, staff.id, abonado.id, { pricePerSession: 900_000 })
    expect(real.priceUpdated).toBe(preview.priceUpdated)
    expect(real.keptOwnPrice).toBe(preview.keptOwnPrice)
  })

  it('deja un registro en el historial con lo que cambió y cuántas fechas', async () => {
    const { sql, tenant, staff, abonado } = await setup()
    await edit(tenant.id, staff.id, abonado.id, { pricePerSession: 950_000 })
    const rows = await sql<
      { metadata: { changed: Record<string, unknown>; priceUpdated: number } }[]
    >`
      SELECT metadata FROM audit_logs
      WHERE tenant_id = ${tenant.id} AND action = 'abonado.updated' AND resource_id = ${abonado.id}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.metadata.changed).toEqual({ pricePerSession: [PRICE, 950_000] })
    expect(rows[0]!.metadata.priceUpdated).toBe(8)
  })
})

describe('updateAbonado — cliente', () => {
  it('las fechas nacen con el teléfono del fijo (deudas y WhatsApp lo leen de la reserva)', async () => {
    const { abonado } = await setup()
    for (const s of await sessionsOf(abonado.id)) expect(s.guest_phone).toBe('1122334455')
  })

  it('sin cuenta de jugador: renombra las fechas con el nombre viejo y completa el teléfono', async () => {
    const { sql, tenant, staff, abonado } = await setup()
    const before = await sessionsOf(abonado.id)
    await sql`UPDATE bookings SET guest_name = 'Corregido a mano' WHERE id = ${before[0]!.id}`
    await sql`UPDATE bookings SET guest_phone = '1100000000' WHERE id = ${before[1]!.id}`

    await edit(tenant.id, staff.id, abonado.id, {
      contactName: 'Cachi Gómez',
      contactPhone: '1133445566',
    })

    const after = await sessionsOf(abonado.id)
    expect(after[0]!.guest_name).toBe('Corregido a mano')
    for (const s of after.slice(1)) expect(s.guest_name).toBe('Cachi Gómez')
    expect(after[1]!.guest_phone).toBe('1100000000')
    for (const s of [after[0]!, ...after.slice(2)]) expect(s.guest_phone).toBe('1133445566')

    const rows = await sql<{ contact_name: string; contact_phone: string }[]>`
      SELECT contact_name, contact_phone FROM abonados WHERE id = ${abonado.id}
    `
    expect(rows[0]).toEqual({ contact_name: 'Cachi Gómez', contact_phone: '1133445566' })
  })

  it('con cuenta de jugador: cambia el contacto del fijo y no toca las fechas', async () => {
    const { tenant, staff, abonado } = await setup({ withPlayer: true })
    const before = await sessionsOf(abonado.id)

    await edit(tenant.id, staff.id, abonado.id, { contactName: 'Otro Nombre' })

    const after = await sessionsOf(abonado.id)
    expect(after.map((s) => s.guest_name)).toEqual(before.map((s) => s.guest_name))
  })
})

describe('updateAbonado — día, horario y cancha', () => {
  it('mueve todas las fechas de horario y deja coherentes las seis columnas del slot', async () => {
    const { tenant, staff, abonado } = await setup()
    const before = await sessionsOf(abonado.id)

    const out = await edit(tenant.id, staff.id, abonado.id, {
      timeStart: '16:00',
      timeEnd: '17:00',
    })

    expect(out.moved).toBe(8)
    const after = await sessionsOf(abonado.id)
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id))
    for (const s of after) {
      expect(s.time_start.slice(0, 5)).toBe('16:00')
      // 16:00 ART = 19:00 UTC, el mismo día.
      expect(new Date(s.starts_at).toISOString().slice(11, 16)).toBe('19:00')
    }
  })

  it('cambia el día de la semana: cada fecha pasa al próximo día nuevo', async () => {
    const { tenant, staff, abonado } = await setup()

    await edit(tenant.id, staff.id, abonado.id, { dayOfWeek: 3 }) // lunes → miércoles

    const after = await sessionsOf(abonado.id)
    expect(after[0]!.date).toBe('2030-01-09')
    expect(after[1]!.date).toBe('2030-01-16')
    expect(after).toHaveLength(8)
  })

  it('mueve a otra cancha del complejo', async () => {
    const { tenant, staff, abonado } = await setup()
    const court2 = await insertCourt(tenant.id, 'Cancha 2')

    const out = await edit(tenant.id, staff.id, abonado.id, { courtId: court2 })

    expect(out.moved).toBe(8)
    for (const s of await sessionsOf(abonado.id)) expect(s.court_id).toBe(court2)
  })

  it('si una fecha choca no se mueve ninguna y devuelve cuáles', async () => {
    const { sql, tenant, staff, courtId, abonado } = await setup()
    // Una reserva suelta ocupa el miércoles 16:00 de la segunda semana.
    await sql`
      INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
                            type, status, price_snapshot, deposit_amount, deposit_status, guest_name)
      VALUES (${tenant.id}, ${courtId}, '2030-01-16', '16:00', '17:00',
              '2030-01-16T19:00:00Z', '2030-01-16T20:00:00Z',
              'spontaneous', 'confirmed', ${PRICE}, 0, 'not_required', 'Ocupa')
    `
    const before = await sessionsOf(abonado.id)

    const input = { dayOfWeek: 3, timeStart: '16:00', timeEnd: '17:00' }
    const preview = await withTenantContext(tenant.id, (tx) =>
      previewUpdateAbonado(tenant.id, abonado.id, input, tx),
    )
    expect(preview.conflictDates).toEqual(['2030-01-16'])

    await expect(edit(tenant.id, staff.id, abonado.id, input)).rejects.toBeInstanceOf(
      AbonadoMoveConflictError,
    )
    const after = await sessionsOf(abonado.id)
    expect(after.map((s) => [s.date, s.time_start])).toEqual(
      before.map((s) => [s.date, s.time_start]),
    )
    const rows = await sql<{ day_of_week: number }[]>`
      SELECT day_of_week FROM abonados WHERE id = ${abonado.id}
    `
    expect(rows[0]!.day_of_week).toBe(1)
  })

  it('cuenta las fechas que quedarían después del fin del turno fijo y se quedan donde estaban', async () => {
    const { tenant, staff, courtId } = await setup()
    const { abonado } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        staff.id,
        {
          courtId,
          contactName: 'Con fin',
          contactPhone: '1100000002',
          dayOfWeek: 1,
          timeStart: '18:00',
          timeEnd: '19:00',
          pricePerSession: PRICE,
          startsOn: ABO_START,
          endsOn: '2030-01-23',
        },
        tx,
      ),
    )
    const input = { dayOfWeek: 5 } // lunes → viernes: la tercera fecha (25/01) pasa el fin

    const preview = await withTenantContext(tenant.id, (tx) =>
      previewUpdateAbonado(tenant.id, abonado.id, input, tx),
    )
    expect(preview).toMatchObject({ futureSessions: 3, moved: 2, notMoved: 1 })

    await edit(tenant.id, staff.id, abonado.id, input)
    const dates = (await sessionsOf(abonado.id)).map((s) => s.date)
    expect(dates).toEqual(['2030-01-11', '2030-01-18', '2030-01-21'])
  })

  it('respeta una fecha que alguien movió a mano a otro horario', async () => {
    const { sql, tenant, staff, abonado } = await setup()
    const before = await sessionsOf(abonado.id)
    // La tercera fecha (21/01) ya estaba movida a las 15:00 (18:00 UTC).
    await sql`
      UPDATE bookings
      SET time_start = '15:00', time_end = '16:00',
          starts_at = '2030-01-21T18:00:00Z', ends_at = '2030-01-21T19:00:00Z'
      WHERE id = ${before[2]!.id}
    `

    const out = await edit(tenant.id, staff.id, abonado.id, {
      timeStart: '16:00',
      timeEnd: '17:00',
    })

    expect(out.moved).toBe(7)
    const after = await sessionsOf(abonado.id)
    expect(after[2]!.time_start.slice(0, 5)).toBe('15:00')
    expect(after.filter((s) => s.time_start.slice(0, 5) === '16:00')).toHaveLength(7)
  })

  it('saltea una fecha en un día que el complejo cerró y mueve las demás', async () => {
    const { sql, tenant, staff, abonado } = await setup()
    await sql`UPDATE tenants SET closed_dates = ARRAY['2030-01-14']::date[] WHERE id = ${tenant.id}`

    const out = await edit(tenant.id, staff.id, abonado.id, {
      timeStart: '16:00',
      timeEnd: '17:00',
    })

    expect(out.moved).toBe(7)
    const after = await sessionsOf(abonado.id)
    expect(after.find((s) => s.date === '2030-01-14')!.time_start.slice(0, 5)).toBe('14:00')
    expect(after.filter((s) => s.time_start.slice(0, 5) === '16:00')).toHaveLength(7)
  })

  it('avisa del choque con otro fijo aunque este no tenga fechas por venir', async () => {
    const { sql, tenant, staff, courtId, abonado } = await setup()
    await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        staff.id,
        {
          courtId,
          contactName: 'Otro fijo',
          contactPhone: '1100000003',
          dayOfWeek: 1,
          timeStart: '16:00',
          timeEnd: '17:00',
          pricePerSession: PRICE,
          startsOn: ABO_START,
        },
        tx,
      ),
    )
    await sql`DELETE FROM bookings WHERE abonado_id = ${abonado.id}`

    const preview = await withTenantContext(tenant.id, (tx) =>
      previewUpdateAbonado(tenant.id, abonado.id, { timeStart: '16:00', timeEnd: '17:00' }, tx),
    )
    expect(preview).toMatchObject({ futureSessions: 0, fixedConflict: true })
  })

  it('si otro turno fijo activo ocupa el nuevo horario avisa y no mueve nada', async () => {
    const { tenant, staff, courtId, abonado } = await setup()
    await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        staff.id,
        {
          courtId,
          contactName: 'Otro fijo',
          contactPhone: '1100000001',
          dayOfWeek: 1,
          timeStart: '16:00',
          timeEnd: '17:00',
          pricePerSession: PRICE,
          startsOn: ABO_START,
        },
        tx,
      ),
    )

    const err = await edit(tenant.id, staff.id, abonado.id, {
      timeStart: '16:00',
      timeEnd: '17:00',
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(AbonadoMoveConflictError)
    expect((err as AbonadoMoveConflictError).fixedConflict).toBe(true)
  })
})

describe('updateAbonado — quién puede', () => {
  it('un turno fijo cancelado no se edita', async () => {
    const { tenant, staff, abonado } = await setup()
    await withTenantContext(tenant.id, (tx) =>
      cancelAbonado(tenant.id, abonado.id, ABO_START, staff.id, tx),
    )
    await expect(
      edit(tenant.id, staff.id, abonado.id, { pricePerSession: 1_000_000 }),
    ).rejects.toBeInstanceOf(AbonadoAlreadyCanceledError)
  })

  it('un complejo no puede editar el turno fijo de otro', async () => {
    const { abonado } = await setup()
    const sql = getSql()
    const other = await createTestTenant(sql)
    const otherStaff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, other.id, otherStaff.id)

    await expect(
      edit(other.id, otherStaff.id, abonado.id, { pricePerSession: 1 }),
    ).rejects.toBeInstanceOf(AbonadoNotFoundError)
    const rows = await sql<{ price_per_session: number }[]>`
      SELECT price_per_session FROM abonados WHERE id = ${abonado.id}
    `
    expect(rows[0]!.price_per_session).toBe(PRICE)
  })
})
