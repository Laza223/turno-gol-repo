import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { rescheduleBooking } from '@/modules/bookings/booking.reschedule'
import { addDays, artTodayStr } from '@/shared/dates/art'
import {
  BookingDateOutOfRangeError,
  BookingNotReschedulableError,
  CourtOfflineError,
  PriceUnavailableError,
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
 * Reprogramar (Fase 3). Lo que se está protegiendo acá:
 *  - que mover el turno reescriba TODAS las columnas del slot, no sólo las de
 *    display — si `starts_at`/`ends_at` quedan viejas, el exclusion constraint
 *    deja de ver los choques reales y se puede sobrevender una cancha;
 *  - que el precio se recalcule (la excepción de la migr. 070) y que el escape
 *    hatch del precio pactado siga funcionando;
 *  - que un turno no choque CONSIGO MISMO al moverse dentro de su propio rango;
 *  - que lo que no es una reserva de un jugador (torneo, bloqueo) no se pueda
 *    mover por acá.
 */

// Precio por franja: mañana barato, noche caro. Así "mover de 10:00 a 21:00"
// tiene un cambio de precio observable, que es justo lo que la 070 habilita.
const PRICING = {
  rules: [
    { days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], from: '08:00', to: '18:00', price: 500000 },
    { days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], from: '18:00', to: '23:00', price: 900000 },
  ],
}
const MANANA = 500000
const NOCHE = 900000

/**
 * Fechas en ART, con las MISMAS funciones que usa `assertDateWindow`.
 *
 * Con `toISOString()` (UTC) esto era un flake por hora del día: entre las 21:00
 * y la medianoche ART ya es el día siguiente en UTC, así que `dateIn(-1)`
 * devolvía HOY y el caso de "no se puede mover al pasado" pasaba a ser válido.
 * El test tiene que medir el tiempo con el mismo reloj que el código bajo test.
 */
function dateIn(days: number): string {
  return addDays(artTodayStr(), days)
}

// Espejo de resolvePoolMax() en src/shared/db/client.ts. Con una sola conexión
// las "transacciones concurrentes" se serializan en la cola del pool: el test
// quedaría verde sin haber ejercitado nada.
const EFFECTIVE_POOL_MAX = (() => {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 3
})()

function requirePoolMaxAtLeast2(testName: string): void {
  if (EFFECTIVE_POOL_MAX < 2) {
    throw new Error(
      `${testName} requiere DATABASE_POOL_MAX>=2 para ejercitar la serialización ` +
        `real entre 2 tx concurrentes; valor efectivo=${EFFECTIVE_POOL_MAX}.`,
    )
  }
}

let tenantId: string
let staffUserId: string
let playerId: string
let courtA: string
let courtB: string
let courtOffline: string

async function insertCourt(opts: { pricing?: unknown; status?: string } = {}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${`Cancha ${Math.random().toString(36).slice(2, 8)}`}, ${10},
      ${sql.json((opts.pricing ?? PRICING) as never)},
      ${opts.status ?? 'online'}
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(opts: {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  status?: string
  type?: string
  price?: number
  withPlayer?: boolean
  /** Seña: monto + estado. Default sin seña. */
  deposit?: { amount: number; status: 'pending' | 'paid' | 'captured' }
  /** Contrato al que pertenece la sesión (solo para type='fixed'). */
  abonadoId?: string
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, price_snapshot, deposit_amount, deposit_status,
      payment_method, status, type, abonado_id
    ) VALUES (
      ${tenantId}, ${opts.courtId}, ${opts.withPlayer === false ? null : playerId},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${opts.date}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${opts.date}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${opts.price ?? MANANA},
      ${opts.deposit?.amount ?? 0},
      ${opts.deposit?.status ?? 'not_required'}::deposit_status,
      NULL,
      ${opts.status ?? 'confirmed'}::booking_status, ${opts.type ?? 'spontaneous'}::booking_type,
      ${opts.abonadoId ?? null}
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function readBooking(id: string) {
  const sql = getSql()
  const rows = await sql<
    {
      court_id: string
      date: string
      time_start: string
      time_end: string
      starts_at: string
      ends_at: string
      price_snapshot: number
      status: string
      type: string
      abonado_id: string | null
    }[]
  >`
    SELECT court_id, date::text AS date, time_start::text AS time_start,
           time_end::text AS time_end, starts_at, ends_at, price_snapshot, status,
           type::text AS type, abonado_id
    FROM bookings WHERE id = ${id}
  `
  return rows[0]!
}

/**
 * Abonado real para las sesiones `type='fixed'`: el punto de los tests de abajo
 * es que la sesión SIGA perteneciendo al contrato después de moverla, y con
 * `abonado_id` en NULL eso no se puede probar.
 */
// `no_overlapping_abonados` prohíbe dos contratos en la misma cancha, día y
// franja: cada abonado del archivo se crea en un día de semana propio.
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

function move(input: {
  bookingId: string
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  priceOverride?: number
}) {
  return withTenantContext(tenantId, (tx) =>
    rescheduleBooking(tenantId, { ...input, staffUserId }, tx),
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
  courtB = await insertCourt()
  courtOffline = await insertCourt({ status: 'offline' })
  // El default del producto son 6 días de anticipación. Se sube a 60 para que
  // los casos de abajo puedan usar fechas cómodas sin chocar contra la ventana;
  // el test que SÍ verifica la ventana usa una fecha absurda (400 días) que
  // queda fuera igual.
  await sql`
    UPDATE tenants
    SET settings = settings || '{"booking_advance_days": 60}'::jsonb
    WHERE id = ${tenantId}
  `
}, 40_000)

afterAll(async () => {
  await closeSql()
})

describe('rescheduleBooking — mover el turno', () => {
  it('reescribe las SEIS columnas del slot, no sólo las de display', async () => {
    const date = dateIn(3)
    const target = dateIn(4)
    const id = await insertBooking({ courtId: courtA, date, timeStart: '10:00', timeEnd: '11:00' })

    await move({ bookingId: id, courtId: courtB, date: target, timeStart: '21:00', timeEnd: '22:00' })

    const b = await readBooking(id)
    expect(b.court_id).toBe(courtB)
    expect(b.date).toBe(target)
    expect(b.time_start).toBe('21:00:00')
    expect(b.time_end).toBe('22:00:00')
    // Lo importante: los instantes físicos siguieron al slot nuevo. Si quedaran
    // en el viejo, la DB no vería los choques reales.
    // `new Date(...)` explícito: postgres-js devuelve los timestamptz de una
    // query cruda como string, y `.getTime()` sobre eso revienta en runtime
    // (gotcha ya documentado del repo).
    expect(new Date(b.starts_at).getTime()).toBe(new Date(`${target}T21:00:00-03:00`).getTime())
    expect(new Date(b.ends_at).getTime()).toBe(new Date(`${target}T22:00:00-03:00`).getTime())
  }, 30_000)

  it('recalcula el precio a la franja destino (lo que habilita la migr. 070)', async () => {
    const date = dateIn(5)
    const id = await insertBooking({ courtId: courtA, date, timeStart: '10:00', timeEnd: '11:00' })
    expect((await readBooking(id)).price_snapshot).toBe(MANANA)

    const out = await move({ bookingId: id, courtId: courtA, date, timeStart: '20:00', timeEnd: '21:00' })

    expect((await readBooking(id)).price_snapshot).toBe(NOCHE)
    expect(out.priceChanged).toBe(true)
  }, 30_000)

  it('respeta un precio pactado a mano en vez de devolverlo a la tarifa de lista', async () => {
    const date = dateIn(6)
    const id = await insertBooking({
      courtId: courtA, date, timeStart: '10:00', timeEnd: '11:00', price: 123456,
    })

    await move({
      bookingId: id, courtId: courtA, date, timeStart: '20:00', timeEnd: '21:00',
      priceOverride: 123456,
    })

    expect((await readBooking(id)).price_snapshot).toBe(123456)
  }, 30_000)

  it('mover dentro del mismo rango NO choca consigo mismo', async () => {
    const date = dateIn(7)
    const id = await insertBooking({ courtId: courtA, date, timeStart: '14:00', timeEnd: '15:00' })

    // Mismo lugar, mismo horario: el pre-chequeo ingenuo se vería a sí mismo.
    await expect(
      move({ bookingId: id, courtId: courtA, date, timeStart: '14:00', timeEnd: '15:00' }),
    ).resolves.toBeDefined()

    const b = await readBooking(id)
    expect(b.time_start).toBe('14:00:00')
  }, 30_000)

  it('rechaza mover encima de otro turno activo', async () => {
    const date = dateIn(8)
    const ocupado = await insertBooking({ courtId: courtA, date, timeStart: '16:00', timeEnd: '17:00' })
    const aMover = await insertBooking({ courtId: courtA, date, timeStart: '10:00', timeEnd: '11:00' })
    expect(ocupado).toBeTruthy()

    await expect(
      move({ bookingId: aMover, courtId: courtA, date, timeStart: '16:00', timeEnd: '17:00' }),
    ).rejects.toBeInstanceOf(SlotTakenError)

    // El turno original quedó intacto.
    expect((await readBooking(aMover)).time_start).toBe('10:00:00')
  }, 30_000)

  it('SÍ deja mover encima del hueco que dejó un turno cancelado', async () => {
    const date = dateIn(9)
    await insertBooking({
      courtId: courtB, date, timeStart: '16:00', timeEnd: '17:00', status: 'canceled_no_refund',
    })
    const aMover = await insertBooking({ courtId: courtB, date, timeStart: '10:00', timeEnd: '11:00' })

    await move({ bookingId: aMover, courtId: courtB, date, timeStart: '16:00', timeEnd: '17:00' })

    expect((await readBooking(aMover)).time_start).toBe('16:00:00')
  }, 30_000)

  it('rechaza mover un turno ya jugado o cancelado', async () => {
    const date = dateIn(10)
    for (const status of ['completed', 'no_show', 'canceled_refunded', 'expired']) {
      const id = await insertBooking({
        courtId: courtA, date, timeStart: '08:00', timeEnd: '09:00', status,
      })
      await expect(
        move({ bookingId: id, courtId: courtA, date, timeStart: '12:00', timeEnd: '13:00' }),
      ).rejects.toBeInstanceOf(BookingNotReschedulableError)
    }
  }, 40_000)

  it('rechaza mover una hora de torneo o un bloqueo — no son reservas de un cliente', async () => {
    const date = dateIn(11)
    const bloqueo = await insertBooking({
      courtId: courtA, date, timeStart: '08:00', timeEnd: '09:00', type: 'block',
      price: 0, withPlayer: false,
    })
    await expect(
      move({ bookingId: bloqueo, courtId: courtA, date, timeStart: '12:00', timeEnd: '13:00' }),
    ).rejects.toBeInstanceOf(BookingNotReschedulableError)
  }, 30_000)

  /**
   * Mover una sesión suelta de abonado: HABILITADO por decisión del dueño
   * (2026-08-05). Este test estaba invertido —asertaba el rechazo— desde la
   * revisión adversarial de T7, cuando todavía era una decisión de producto
   * abierta.
   *
   * Lo que protege ahora es lo mismo que protegía el guard: su `price_snapshot`
   * sale del CONTRATO (`abonados.price_per_session`, abonado.service.ts:132), no
   * de `court.pricing`. Si se recalculara contra la grilla de tarifas, mover la
   * sesión le pisaría al cliente el precio pactado — en silencio, y el trigger
   * de la migr. 070 no lo frena porque el estado es 'confirmed'.
   */
  it('mueve una sesión de abonado a una franja de OTRO precio conservando el del contrato', async () => {
    const date = dateIn(11)
    const abonadoId = await insertAbonado(courtA, 777777)
    const sesion = await insertBooking({
      courtId: courtA,
      date,
      timeStart: '10:00', // franja MAÑANA (500000 en la grilla)
      timeEnd: '11:00',
      type: 'fixed',
      abonadoId,
      // Precio pactado por sesión, DISTINTO de cualquier regla de court.pricing.
      price: 777777,
    })

    // Destino en la franja NOCHE (900000 en la grilla): si el precio se
    // recalculara, quedaría en 900000.
    const out = await move({
      bookingId: sesion,
      courtId: courtA,
      date,
      timeStart: '20:00',
      timeEnd: '21:00',
    })

    const row = await readBooking(sesion)
    expect(row.time_start).toBe('20:00:00')
    // 🔴 Lo único que importa: el precio pactado NO se movió.
    expect(row.price_snapshot).toBe(777777)
    expect(row.price_snapshot).not.toBe(NOCHE)
    expect(out.priceChanged).toBe(false)
  }, 30_000)

  it('la sesión movida sigue siendo del abonado: conserva type=fixed y abonado_id', async () => {
    const date = dateIn(12)
    const abonadoId = await insertAbonado(courtA, 777777)
    const sesion = await insertBooking({
      courtId: courtA,
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'fixed',
      abonadoId,
      price: 777777,
    })

    await move({ bookingId: sesion, courtId: courtB, date, timeStart: '20:00', timeEnd: '21:00' })

    const row = await readBooking(sesion)
    // El `.set()` del UPDATE no lista ninguna de las dos columnas; este test es
    // la alarma si un refactor futuro las agrega.
    expect(row.type).toBe('fixed')
    expect(row.abonado_id).toBe(abonadoId)
  }, 30_000)

  /**
   * 🔴 El caller no puede pisar el precio pactado ni pasándolo explícito. Hoy
   * `priceOverride` no viaja por la Server Action, pero es un campo público del
   * input de dominio: si el check de `type === 'fixed'` quedara DESPUÉS del de
   * `priceOverride`, un llamado directo bypaseando la UI le cambiaría el precio
   * al contrato.
   */
  it('ignora un priceOverride explícito en una sesión de abonado', async () => {
    const date = dateIn(13)
    const abonadoId = await insertAbonado(courtA, 777777)
    const sesion = await insertBooking({
      courtId: courtA,
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'fixed',
      abonadoId,
      price: 777777,
    })

    await move({
      bookingId: sesion,
      courtId: courtA,
      date,
      timeStart: '20:00',
      timeEnd: '21:00',
      priceOverride: 1,
    })

    expect((await readBooking(sesion)).price_snapshot).toBe(777777)
  }, 30_000)

  it('rechaza mover una sesión de abonado encima de OTRA sesión del mismo abonado', async () => {
    const date = dateIn(14)
    const abonadoId = await insertAbonado(courtA, 777777)
    const sesionA = await insertBooking({
      courtId: courtA,
      date,
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'fixed',
      abonadoId,
      price: 777777,
    })
    await insertBooking({
      courtId: courtA,
      date,
      timeStart: '11:00',
      timeEnd: '12:00',
      type: 'fixed',
      abonadoId,
      price: 777777,
    })

    await expect(
      move({ bookingId: sesionA, courtId: courtA, date, timeStart: '11:00', timeEnd: '12:00' }),
    ).rejects.toBeInstanceOf(SlotTakenError)

    expect((await readBooking(sesionA)).time_start).toBe('10:00:00')
  }, 30_000)

  /**
   * 🔴 Hallazgo de la revisión adversarial de T7, encontrado por DOS lentes
   * independientes. `deposit_amount` se calcula al crear como un % del precio
   * de ESA franja (booking.service.ts:438) y este UPDATE nunca lo recalcula. Con
   * la seña esperando pago hay además un link de MercadoPago vivo cotizado con
   * ese monto. Mover el turno a una franja más barata dejaba una seña MAYOR al
   * precio total del turno — y ese monto stale es justo el que MP cobra.
   */
  it('rechaza mover un turno con la seña esperando pago', async () => {
    const date = dateIn(9)
    const id = await insertBooking({
      courtId: courtA,
      date,
      timeStart: '21:00',
      timeEnd: '22:00',
      status: 'pending_payment',
      price: NOCHE,
      // 30% de la franja CARA: si el turno se mueve a la mañana ($5.000), la
      // seña ($2.700) sigue siendo del precio viejo.
      deposit: { amount: 270000, status: 'pending' },
    })

    await expect(
      move({ bookingId: id, courtId: courtA, date, timeStart: '10:00', timeEnd: '11:00' }),
    ).rejects.toBeInstanceOf(BookingNotReschedulableError)

    const row = await readBooking(id)
    expect(row.time_start).toBe('21:00:00')
    expect(row.price_snapshot).toBe(NOCHE)
  }, 30_000)

  /**
   * 🔴 Misma familia: mover un turno YA PAGADO a una franja más barata dejaba el
   * precio por debajo de lo cobrado. `summarizeBookingCharges` clampea el
   * pendiente en 0, así que la diferencia a favor del cliente no aparecía en
   * ningún lado — se la tragaba el sistema en silencio.
   */
  it('rechaza mover a una franja que vale menos de lo que el cliente ya pagó', async () => {
    const date = dateIn(9)
    const id = await insertBooking({
      courtId: courtB,
      date,
      timeStart: '20:00',
      timeEnd: '21:00',
      price: NOCHE,
      // Seña ya cobrada por $9.000: la franja de mañana vale $5.000.
      deposit: { amount: NOCHE, status: 'paid' },
    })

    await expect(
      move({ bookingId: id, courtId: courtB, date, timeStart: '11:00', timeEnd: '12:00' }),
    ).rejects.toBeInstanceOf(BookingNotReschedulableError)

    expect((await readBooking(id)).price_snapshot).toBe(NOCHE)
  }, 30_000)

  it('control positivo: con seña PAGADA menor al precio destino, sí se mueve', async () => {
    const date = dateIn(9)
    const id = await insertBooking({
      courtId: courtB,
      date,
      timeStart: '14:00',
      timeEnd: '15:00',
      price: MANANA,
      deposit: { amount: 150000, status: 'paid' },
    })

    await move({ bookingId: id, courtId: courtB, date, timeStart: '21:00', timeEnd: '22:00' })

    const row = await readBooking(id)
    expect(row.time_start).toBe('21:00:00')
    expect(row.price_snapshot).toBe(NOCHE)
  }, 30_000)

  it('rechaza el pasado y la fecha fuera de la ventana de anticipación', async () => {
    const date = dateIn(12)
    const id = await insertBooking({ courtId: courtA, date, timeStart: '10:00', timeEnd: '11:00' })

    await expect(
      move({ bookingId: id, courtId: courtA, date: dateIn(-1), timeStart: '10:00', timeEnd: '11:00' }),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)

    // El default del producto son 6 días de anticipación.
    await expect(
      move({ bookingId: id, courtId: courtA, date: dateIn(400), timeStart: '10:00', timeEnd: '11:00' }),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
  }, 30_000)

  it('rechaza mover a una cancha pausada', async () => {
    const date = dateIn(3)
    const id = await insertBooking({ courtId: courtA, date, timeStart: '12:00', timeEnd: '13:00' })
    await expect(
      move({ bookingId: id, courtId: courtOffline, date, timeStart: '12:00', timeEnd: '13:00' }),
    ).rejects.toBeInstanceOf(CourtOfflineError)
  }, 30_000)

  it('rechaza un horario sin tarifa configurada en vez de inventar un precio', async () => {
    const sinTarifaDeMadrugada = await insertCourt({
      pricing: { rules: [{ days: ['sun','mon','tue','wed','thu','fri','sat'], from: '08:00', to: '12:00', price: 100000 }] },
    })
    const date = dateIn(3)
    const id = await insertBooking({
      courtId: sinTarifaDeMadrugada, date, timeStart: '09:00', timeEnd: '10:00', price: 100000,
    })

    await expect(
      move({ bookingId: id, courtId: sinTarifaDeMadrugada, date, timeStart: '20:00', timeEnd: '21:00' }),
    ).rejects.toBeInstanceOf(PriceUnavailableError)
  }, 30_000)

  it('deja rastro en audit_logs con el precio viejo y el nuevo', async () => {
    const sql = getSql()
    const date = dateIn(4)
    const id = await insertBooking({ courtId: courtA, date, timeStart: '09:00', timeEnd: '10:00' })

    await move({ bookingId: id, courtId: courtA, date, timeStart: '19:00', timeEnd: '20:00' })

    const rows = await sql<{ action: string; metadata: Record<string, unknown> }[]>`
      SELECT action, metadata FROM audit_logs
      WHERE resource_id = ${id} AND action = 'booking.rescheduled'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.metadata.oldPrice).toBe(MANANA)
    expect(rows[0]!.metadata.newPrice).toBe(NOCHE)
    expect(rows[0]!.metadata.fromTimeStart).toBe('09:00')
  }, 30_000)

  it('encola el aviso al jugador, y no encola nada si la reserva es de un invitado', async () => {
    const date = dateIn(5)
    const conJugador = await insertBooking({ courtId: courtB, date, timeStart: '09:00', timeEnd: '10:00' })
    const out1 = await move({
      bookingId: conJugador, courtId: courtB, date, timeStart: '11:00', timeEnd: '12:00',
    })
    expect(out1.notificationIds).toHaveLength(1)

    const invitado = await insertBooking({
      courtId: courtB, date, timeStart: '13:00', timeEnd: '14:00', withPlayer: false,
    })
    const out2 = await move({
      bookingId: invitado, courtId: courtB, date, timeStart: '15:00', timeEnd: '16:00',
    })
    expect(out2.notificationIds).toHaveLength(0)
  }, 30_000)

  it('dos reprogramaciones al mismo hueco: una gana, la otra recibe SlotTakenError', async () => {
    requirePoolMaxAtLeast2('reprogramación concurrente')
    const date = dateIn(14)
    const a = await insertBooking({ courtId: courtA, date, timeStart: '08:00', timeEnd: '09:00' })
    const b = await insertBooking({ courtId: courtA, date, timeStart: '09:00', timeEnd: '10:00' })

    const destino = { courtId: courtA, date, timeStart: '17:00', timeEnd: '18:00' }
    const [ra, rb] = await Promise.allSettled([
      move({ bookingId: a, ...destino }),
      move({ bookingId: b, ...destino }),
    ])

    const ganadores = [ra, rb].filter((r) => r.status === 'fulfilled')
    const perdedores = [ra, rb].filter((r) => r.status === 'rejected')
    expect(ganadores).toHaveLength(1)
    expect(perdedores).toHaveLength(1)
    // Puede venir del pre-chequeo o del exclusion constraint de la DB según
    // quién llegue primero; las dos rutas terminan en el mismo error.
    expect((perdedores[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotTakenError)

    // Y sobre todo: la cancha no quedó sobrevendida.
    const sql = getSql()
    const ocupando = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM bookings
      WHERE court_id = ${courtA} AND time_start = '17:00'::time
        AND date = ${date}::date AND status IN ('confirmed','pending_payment')
    `
    expect(ocupando[0]!.n).toBe('1')
  }, 40_000)

  it('también mueve un turno que todavía espera la seña', async () => {
    const date = dateIn(6)
    const id = await insertBooking({
      courtId: courtB, date, timeStart: '08:00', timeEnd: '09:00', status: 'pending_payment',
    })

    await move({ bookingId: id, courtId: courtB, date, timeStart: '19:00', timeEnd: '20:00' })

    const b = await readBooking(id)
    expect(b.status).toBe('pending_payment')
    expect(b.time_start).toBe('19:00:00')
    expect(b.price_snapshot).toBe(NOCHE)
  }, 30_000)
})
