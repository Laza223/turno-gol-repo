import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { editBooking } from '@/modules/bookings/booking.edit'
import { addDays, artTodayStr } from '@/shared/dates/art'
import {
  BookingNotEditableError,
  BookingPriceBelowPaidError,
  BookingValidationError,
  CourtOfflineError,
  SlotTakenError,
} from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * Editar reserva (D2, docs/decisions/2026-09-15-evento-repetible-edicion-y-cobro-parcial.md).
 *
 * A diferencia de reprogramar, acá el turno NUNCA se mueve: mismo court_id,
 * mismo date/time_start siempre. Lo que se protege:
 *  - nombre/teléfono sólo se tocan si es un invitado (player_id NULL);
 *  - la duración sólo se edita en un evento `spontaneous` cargado por el staff
 *    (nunca en una reserva online, aunque comparta el mismo `type`);
 *  - el precio nunca baja de lo ya cobrado;
 *  - la migración 089 exige el marcador `app.booking_edit` para tocar
 *    `price_snapshot` — sin `editBooking` de por medio, el trigger sigue
 *    rechazando (ver booking-price-immutability.test.ts).
 */

let tenantId: string
let staffUserId: string
let playerId: string
let courtA: string

function dateIn(days: number): string {
  return addDays(artTodayStr(), days)
}

async function insertCourt(): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity)
    VALUES (${tenantId}, ${`Cancha ${Math.random().toString(36).slice(2, 8)}`}, 10)
    RETURNING id
  `
  return rows[0]!.id
}

// Mismo helper que `booking-reschedule.test.ts` (día distinto por llamada
// para no chocar el `EXCLUDE` de `abonados`, que no está bajo test acá).
let abonadoDayCursor = 0
async function insertAbonado(courtId: string, pricePerSession: number): Promise<string> {
  const sql = getSql()
  const dayOfWeek = abonadoDayCursor++ % 7
  const rows = await sql<{ id: string }[]>`
    INSERT INTO abonados (
      tenant_id, court_id, player_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session,
      starts_on, status
    ) VALUES (
      ${tenantId}, ${courtId}, ${playerId}, ${'Equipo Contrato'}, ${'1122334455'},
      ${dayOfWeek}, ${'18:00'}::time, ${'19:00'}::time, ${pricePerSession},
      CURRENT_DATE, 'active'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(opts: {
  date: string
  timeStart: string
  timeEnd: string
  courtId?: string
  status?: string
  type?: string
  price?: number
  withPlayer?: boolean
  guestName?: string
  guestPhone?: string
  /** NULL = "online" (lo creó un jugador); string = lo cargó el staff. */
  createdByStaff?: string | null
  deposit?: { amount: number; status: 'pending' | 'paid' | 'captured' }
  /** Sesión de abonado (`type: 'fixed'`) — liga la fila al contrato. */
  abonadoId?: string
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, abonado_id, date, time_start, time_end,
      starts_at, ends_at, price_snapshot, deposit_amount, deposit_status,
      payment_method, status, type, guest_name, guest_phone, created_by_staff
    ) VALUES (
      ${tenantId}, ${opts.courtId ?? courtA}, ${opts.withPlayer === false ? null : playerId},
      ${opts.abonadoId ?? null},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${opts.date}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${opts.date}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${opts.price ?? 800000},
      ${opts.deposit?.amount ?? 0},
      ${opts.deposit?.status ?? 'not_required'}::deposit_status,
      NULL,
      ${opts.status ?? 'confirmed'}::booking_status, ${opts.type ?? 'spontaneous'}::booking_type,
      ${opts.guestName ?? null}, ${opts.guestPhone ?? null},
      ${opts.withPlayer === false ? (opts.createdByStaff ?? staffUserId) : (opts.createdByStaff ?? null)}
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function readBooking(id: string) {
  const sql = getSql()
  const rows = await sql<
    {
      time_end: string
      price_snapshot: number
      guest_name: string | null
      guest_phone: string | null
    }[]
  >`
    SELECT time_end::text AS time_end, price_snapshot, guest_name, guest_phone
    FROM bookings WHERE id = ${id}
  `
  return rows[0]!
}

function edit(
  bookingId: string,
  input: {
    guestName?: string
    guestPhone?: string | null
    timeEnd?: string
    priceOverride?: number
  },
) {
  return withTenantContext(tenantId, (tx) =>
    editBooking(tenantId, staffUserId, { bookingId, ...input }, tx),
  )
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const staff = await createTestStaffUser(sql)
  staffUserId = staff.id
  await linkStaffToTenant(sql, tenantId, staff.id)
  const player = await createTestPlayer(sql)
  playerId = player.id
  await linkPlayerToTenant(sql, tenantId, player.id)
  courtA = await insertCourt()
}, 40_000)

afterAll(async () => {
  await closeSql()
})

describe('editBooking — editar reserva desde la grilla (D2)', () => {
  it('edita nombre y teléfono de un invitado', async () => {
    const date = dateIn(3)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      withPlayer: false,
      guestName: 'Juan Pérez',
      guestPhone: '1122334455',
    })

    await edit(id, { guestName: 'Juan Gómez', guestPhone: '1199988877' })

    const b = await readBooking(id)
    expect(b.guest_name).toBe('Juan Gómez')
    expect(b.guest_phone).toBe('1199988877')
  }, 20_000)

  // 🟡 Hallazgo 7 (auditoría 2026-09-16): `guestPhone: null` es la señal de
  // "borrar a propósito" que manda el schema al normalizar el '' del diálogo —
  // a diferencia de omitir el campo, que deja el valor viejo intacto.
  it('borra el teléfono de un invitado con guestPhone: null', async () => {
    const date = dateIn(17)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      withPlayer: false,
      guestName: 'Juan Pérez',
      guestPhone: '1122334455',
    })

    await edit(id, { guestPhone: null })

    const b = await readBooking(id)
    expect(b.guest_phone).toBeNull()
    expect(b.guest_name).toBe('Juan Pérez')
  }, 20_000)

  it('rechaza editar nombre/teléfono de un turno con jugador registrado', async () => {
    const date = dateIn(4)
    const id = await insertBooking({ date, timeStart: '10:00', timeEnd: '11:00' })

    await expect(edit(id, { guestName: 'Otro nombre' })).rejects.toBeInstanceOf(
      BookingValidationError,
    )
  }, 20_000)

  it('sube el precio', async () => {
    const date = dateIn(5)
    const id = await insertBooking({ date, timeStart: '10:00', timeEnd: '11:00', price: 800000 })

    await edit(id, { priceOverride: 950000 })

    expect((await readBooking(id)).price_snapshot).toBe(950000)
  }, 20_000)

  it('baja el precio (por encima de lo ya pagado)', async () => {
    const date = dateIn(6)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      price: 800000,
      deposit: { amount: 200000, status: 'paid' },
    })

    await edit(id, { priceOverride: 300000 })

    expect((await readBooking(id)).price_snapshot).toBe(300000)
  }, 20_000)

  it('RECHAZA bajar el precio por debajo de lo ya cobrado', async () => {
    const date = dateIn(7)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      price: 800000,
      deposit: { amount: 300000, status: 'paid' },
    })

    await expect(edit(id, { priceOverride: 200000 })).rejects.toBeInstanceOf(
      BookingPriceBelowPaidError,
    )
    expect((await readBooking(id)).price_snapshot).toBe(800000)
  }, 20_000)

  it('estira la duración de 1h a 3h de un evento cargado por el staff, con precio nuevo', async () => {
    const date = dateIn(8)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      withPlayer: false,
      guestName: 'Escuelita',
      price: 800000,
    })

    await edit(id, { timeEnd: '13:00', priceOverride: 2400000 })

    const b = await readBooking(id)
    expect(b.time_end).toBe('13:00:00')
    expect(b.price_snapshot).toBe(2400000)
  }, 20_000)

  it('RECHAZA una duración que pisa otro turno de la misma cancha', async () => {
    const date = dateIn(9)
    await insertBooking({
      date,
      timeStart: '12:00',
      timeEnd: '13:00',
      withPlayer: false,
      guestName: 'Otro evento',
    })
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      withPlayer: false,
      guestName: 'Escuelita',
      price: 800000,
    })

    await expect(edit(id, { timeEnd: '13:00', priceOverride: 2400000 })).rejects.toBeInstanceOf(
      SlotTakenError,
    )
    expect((await readBooking(id)).time_end).toBe('11:00:00')
  }, 20_000)

  it('RECHAZA una duración de 90 minutos (no es múltiplo de 60)', async () => {
    const date = dateIn(10)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      withPlayer: false,
      guestName: 'Escuelita',
    })

    await expect(edit(id, { timeEnd: '11:30', priceOverride: 900000 })).rejects.toBeInstanceOf(
      BookingValidationError,
    )
  }, 20_000)

  it('RECHAZA editar un turno en estado terminal', async () => {
    const date = dateIn(11)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      status: 'completed',
    })

    await expect(edit(id, { priceOverride: 900000 })).rejects.toBeInstanceOf(
      BookingNotEditableError,
    )
  }, 20_000)

  it('RECHAZA editar un bloqueo de mantenimiento', async () => {
    const date = dateIn(12)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'block',
      withPlayer: false,
      price: 0,
    })

    await expect(edit(id, { priceOverride: 900000 })).rejects.toBeInstanceOf(
      BookingNotEditableError,
    )
  }, 20_000)

  it('RECHAZA cambiar la duración de una reserva ONLINE (created_by_staff NULL)', async () => {
    const date = dateIn(13)
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      // `withPlayer` por default es true (con jugador) y createdByStaff NULL:
      // exactamente lo que crea `createOnlineBookingImpl`.
      createdByStaff: null,
    })

    await expect(edit(id, { timeEnd: '13:00', priceOverride: 2400000 })).rejects.toBeInstanceOf(
      BookingValidationError,
    )
    expect((await readBooking(id)).time_end).toBe('11:00:00')
  }, 20_000)

  // Revisión roja: `editBooking` lockea la cancha con `lockCourtOrThrow` antes
  // de tocar el booking (mismo orden que reschedule). Si la cancha quedó
  // `offline` (p. ej. el complejo la desactivó después de crear el turno),
  // ese lock tiene que rechazar — incluso para editar sólo el nombre de un
  // turno que ya existe, no para crear uno nuevo.
  it('RECHAZA editar un turno de una cancha que quedó offline', async () => {
    const date = dateIn(14)
    const offlineCourt = await insertCourt()
    const id = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      courtId: offlineCourt,
      withPlayer: false,
      guestName: 'Juan Pérez',
    })
    const sql = getSql()
    await sql`UPDATE courts SET status = 'offline' WHERE id = ${offlineCourt}`

    await expect(edit(id, { guestName: 'Juan Gómez' })).rejects.toBeInstanceOf(CourtOfflineError)
    expect((await readBooking(id)).guest_name).toBe('Juan Pérez')
  }, 20_000)

  /**
   * Corregir el precio de UNA sesión de turno fijo queda permitido (decisión
   * del dueño, 2026-09-15) — a diferencia de `rescheduleBooking`, que en una
   * sesión de abonado ignora cualquier precio pedido y conserva siempre el
   * del contrato. Lo que tiene que quedar demostrado: cambia sólo esta fila,
   * el audit trail marca que fue una excepción puntual (no una edición del
   * contrato) y ni `abonados.price_per_session` ni las otras sesiones ya
   * generadas se mueven.
   */
  it('sube el precio de una sesión de abonado: queda marcado como excepción de esa fecha, sin tocar el contrato ni otras sesiones', async () => {
    const sql = getSql()
    const date = dateIn(15)
    const abonadoId = await insertAbonado(courtA, 700000)
    const sesion = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'fixed',
      abonadoId,
      price: 700000,
    })
    const otraSesion = await insertBooking({
      date: dateIn(22),
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'fixed',
      abonadoId,
      price: 700000,
    })

    await edit(sesion, { priceOverride: 500000 })

    expect((await readBooking(sesion)).price_snapshot).toBe(500000)
    // El contrato no se tocó.
    const abonadoRows = await sql<{ price_per_session: number }[]>`
      SELECT price_per_session FROM abonados WHERE id = ${abonadoId}
    `
    expect(abonadoRows[0]!.price_per_session).toBe(700000)
    // Ni las otras sesiones ya generadas.
    expect((await readBooking(otraSesion)).price_snapshot).toBe(700000)

    const auditRows = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_logs
      WHERE resource_id = ${sesion} AND action = 'booking.edited'
    `
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]!.metadata.priceSource).toBe('session_override')
  }, 20_000)

  it('editar nombre/duración de una sesión de abonado sin tocar el precio NO marca priceSource', async () => {
    const sql = getSql()
    const date = dateIn(16)
    const abonadoId = await insertAbonado(courtA, 700000)
    const sesion = await insertBooking({
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'fixed',
      abonadoId,
      price: 700000,
      withPlayer: false,
      guestName: 'Escuelita fija',
    })

    await edit(sesion, { guestName: 'Escuelita fija (turno actualizado)' })

    const auditRows = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_logs
      WHERE resource_id = ${sesion} AND action = 'booking.edited'
    `
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]!.metadata.priceSource).toBeUndefined()
  }, 20_000)
})
