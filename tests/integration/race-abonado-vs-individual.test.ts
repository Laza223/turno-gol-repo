import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import { createAbonado } from '@/modules/abonados/abonado.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string

// ── helpers ──────────────────────────────────────────────────────────
// Cuenta bookings que el constraint de exclusión considera "vivos"
// (pending_payment | confirmed) sobre un slot exacto court+fecha+hora.
async function countActiveOnSlot(date: string, timeStart: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c
    FROM bookings
    WHERE court_id = ${seed.courtId}
      AND date = ${date}::date
      AND time_start = ${timeStart}::time
      AND status IN ('pending_payment', 'confirmed')
  `
  return rows[0]!.c
}

// Cuenta los bookings generados por un abonado concreto en una fecha.
async function countAbonadoBookingsOn(abonadoId: string, date: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c
    FROM bookings
    WHERE abonado_id = ${abonadoId} AND date = ${date}::date
  `
  return rows[0]!.c
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
}, 30_000)

afterAll(async () => closeSql())

describe('abonado slot generation vs individual booking on same slot', () => {
  it('reserva individual pre-existente → abonado salta esa fecha como conflicto, genera el resto y NO duplica el slot', async () => {
    // Día abonado: Lunes (1). Próximo lunes desde startsOn.
    const startsOn = '2026-10-05' // Monday

    // 1. Crear booking individual en el primer lunes 20:00-21:00
    await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: startsOn,
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )

    // 2. Crear abonado lunes 20:00-21:00 a partir del mismo startsOn.
    //    8 lunes candidatos (10-05 … 11-23): el primero choca, los otros 7 no.
    const { abonado, slotsGenerated, conflictDates } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        seed.staffUserId,
        {
          courtId: seed.courtId,
          playerId,
          contactName: 'Test',
          contactPhone: '+5491111111111',
          dayOfWeek: 1, // Monday
          timeStart: '20:00',
          timeEnd: '21:00',
          pricePerSession: 100000,
          monthlyPrice: 400000,
          startsOn,
          endsOn: '2026-11-30',
          paymentMethod: 'cash',
        },
        tx,
      ),
    )

    // El abonado se crea igual (activo); el conflicto solo salta el slot chocado.
    expect(abonado.status).toBe('active')
    expect(conflictDates).toEqual([startsOn]) // exactamente esa fecha, ninguna otra
    expect(slotsGenerated).toBe(7) // 8 candidatos − 1 conflicto

    // Invariante de seguridad: el slot chocado tiene EXACTAMENTE 1 booking activo
    // (el individual). Si el skip se rompiera y el abonado insertara igual, habría
    // 2 (o el INSERT habría reventado por el exclusion constraint).
    expect(await countActiveOnSlot(startsOn, '20:00')).toBe(1)
    // Y ese único booking es el individual, no uno generado por el abonado.
    expect(await countAbonadoBookingsOn(abonado.id, startsOn)).toBe(0)

    // El abonado sí generó sus 7 bookings restantes.
    const sql = getSql()
    const generated = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM bookings WHERE abonado_id = ${abonado.id}
    `
    expect(generated[0]!.c).toBe(7)
  }, 30_000)

  it('individual y abonado concurrentes en el mismo slot → exactamente UNO persiste (exclusion constraint)', async () => {
    const startsOn = '2026-11-02' // Monday

    // Dispatch both concurrent
    const indivPromise = withTenantContext(tenant.id, async (tx) => {
      try {
        await createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date: startsOn,
            timeStart: '14:00',
            timeEnd: '15:00',
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
          },
          tx,
        )
        return 'indiv_won' as const
      } catch {
        return 'indiv_lost' as const
      }
    })

    const abonadoPromise = withTenantContext(tenant.id, async (tx) => {
      try {
        const r = await createAbonado(
          tenant.id,
          seed.staffUserId,
          {
            courtId: seed.courtId,
            playerId,
            contactName: 'Conc',
            contactPhone: '+5491122222222',
            dayOfWeek: 1, // Monday
            timeStart: '14:00',
            timeEnd: '15:00',
            pricePerSession: 100000,
            monthlyPrice: 400000,
            startsOn,
            endsOn: '2026-11-30',
            paymentMethod: 'cash',
          },
          tx,
        )
        return { kind: 'abonado_won' as const, slots: r.slotsGenerated, conflicts: r.conflictDates }
      } catch {
        return { kind: 'abonado_failed' as const }
      }
    })

    const [indivRes, abonadoRes] = await Promise.all([indivPromise, abonadoPromise])

    // Invariante fuerte: EXACTAMENTE 1 booking activo sobre el slot disputado.
    //  - `> 1` significaría double-booking (exclusion constraint roto).
    //  - `0` significaría que ambos abortaron y el slot quedó vacío (deadlock /
    //    rollback espurio). El `<= 1` original toleraba este caso silenciosamente.
    expect(await countActiveOnSlot(startsOn, '14:00')).toBe(1)

    // Al menos una operación tuvo éxito sobre ese slot: si el individual perdió,
    // fue porque el abonado ganó el slot (y viceversa). "Ambos fallaron" es un bug.
    const someoneWon =
      indivRes === 'indiv_won' ||
      (abonadoRes.kind === 'abonado_won' && !abonadoRes.conflicts.includes(startsOn))
    expect(someoneWon).toBe(true)

    // Consistencia: el origen del booking sobreviviente coincide con quién ganó.
    if (indivRes === 'indiv_won') {
      // El individual ganó → el abonado debe haber saltado ese slot (o fallado entero).
      const abonadoRows = await countActiveOnSlot(startsOn, '14:00')
      expect(abonadoRows).toBe(1)
    }
  }, 30_000)

  // ── GAP: timing inverso ──────────────────────────────────────────────
  it('abonado pre-existente → reserva individual sobre el mismo slot es rechazada con SlotTakenError', async () => {
    const startsOn = '2027-03-01' // Monday

    // 1. Crear abonado primero: genera 8 bookings (confirmed/fixed), incluido el slot.
    const { abonado, slotsGenerated } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        seed.staffUserId,
        {
          courtId: seed.courtId,
          playerId,
          contactName: 'Inverso',
          contactPhone: '+5491133333333',
          dayOfWeek: 1,
          timeStart: '10:00',
          timeEnd: '11:00',
          pricePerSession: 100000,
          monthlyPrice: 400000,
          startsOn,
          paymentMethod: 'cash',
        },
        tx,
      ),
    )
    expect(slotsGenerated).toBe(8)
    expect(await countAbonadoBookingsOn(abonado.id, startsOn)).toBe(1)

    // 2. La reserva individual sobre ese slot ya ocupado debe rechazarse.
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date: startsOn,
            timeStart: '10:00',
            timeEnd: '11:00',
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
            priceOverride: 100000,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(SlotTakenError)

    // El slot sigue con 1 booking: el del abonado, no se duplicó.
    expect(await countActiveOnSlot(startsOn, '10:00')).toBe(1)
    expect(await countAbonadoBookingsOn(abonado.id, startsOn)).toBe(1)
  }, 30_000)

  // ── GAP: un booking CANCELADO no debe bloquear la generación ──────────
  it('reserva individual cancelada NO cuenta como conflicto → abonado genera el slot igual', async () => {
    const startsOn = '2027-04-05' // Monday
    const sql = getSql()

    // Booking individual CANCELADO sobre el slot (fuera del exclusion constraint,
    // que solo cubre pending_payment|confirmed).
    await sql`
      INSERT INTO bookings (tenant_id, court_id, player_id, date, time_start, time_end,
        type, status, price_snapshot, deposit_amount, deposit_status,
        canceled_reason, canceled_by, canceled_at)
      VALUES (
        ${tenant.id}, ${seed.courtId}, ${playerId},
        ${startsOn}::date, '11:00'::time, '12:00'::time,
        'spontaneous', 'canceled_no_refund', ${100000}, 0, 'not_required',
        'test', 'admin', NOW()
      )
    `

    const { abonado, slotsGenerated, conflictDates } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        seed.staffUserId,
        {
          courtId: seed.courtId,
          playerId,
          contactName: 'Cancelado',
          contactPhone: '+5491144444444',
          dayOfWeek: 1,
          timeStart: '11:00',
          timeEnd: '12:00',
          pricePerSession: 100000,
          monthlyPrice: 400000,
          startsOn,
          paymentMethod: 'cash',
        },
        tx,
      ),
    )

    // El slot cancelado NO es conflicto: los 8 lunes se generan.
    expect(conflictDates).not.toContain(startsOn)
    expect(slotsGenerated).toBe(8)
    // El abonado generó su booking en esa fecha, conviviendo con el cancelado.
    expect(await countAbonadoBookingsOn(abonado.id, startsOn)).toBe(1)
    expect(await countActiveOnSlot(startsOn, '11:00')).toBe(1) // solo el del abonado está activo
  }, 30_000)

  // ── GAP: overlap PARCIAL (abonado 120min vs individual 60min) ─────────
  it('reserva individual que solapa parcialmente el rango del abonado → fecha marcada como conflicto', async () => {
    const startsOn = '2027-05-03' // Monday

    // Individual 17:00-18:00 pre-existente.
    await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: startsOn,
          timeStart: '17:00',
          timeEnd: '18:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
          priceOverride: 100000,
        },
        tx,
      ),
    )

    // Abonado 16:00-18:00 (120min): solapa parcialmente con el individual 17-18.
    const { abonado, slotsGenerated, conflictDates } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        seed.staffUserId,
        {
          courtId: seed.courtId,
          playerId,
          contactName: 'Parcial',
          contactPhone: '+5491155555555',
          dayOfWeek: 1,
          timeStart: '16:00',
          timeEnd: '18:00',
          pricePerSession: 100000,
          monthlyPrice: 400000,
          startsOn,
          paymentMethod: 'cash',
        },
        tx,
      ),
    )

    // El solape parcial cuenta como conflicto: esa fecha se salta.
    expect(conflictDates).toContain(startsOn)
    expect(slotsGenerated).toBe(7) // 8 candidatos − 1 conflicto
    // El abonado NO insertó nada en esa fecha (habría reventado el exclusion constraint).
    expect(await countAbonadoBookingsOn(abonado.id, startsOn)).toBe(0)
  }, 30_000)

  // ── GAP: slots ADYACENTES (tocan pero no solapan) conviven ────────────
  it('reserva individual adyacente (termina justo cuando arranca el abonado) NO es conflicto', async () => {
    // 2027-08-02: lunes libre del span de 8 semanas del test de overlap parcial (termina 2027-06-21).
    const startsOn = '2027-08-02' // Monday

    // Individual 17:00-18:00 pre-existente.
    await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: startsOn,
          timeStart: '17:00',
          timeEnd: '18:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
          priceOverride: 100000,
        },
        tx,
      ),
    )

    // Abonado 18:00-19:00: arranca exactamente cuando termina el individual.
    // Rangos half-open [) → NO solapan.
    const { abonado, slotsGenerated, conflictDates } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        seed.staffUserId,
        {
          courtId: seed.courtId,
          playerId,
          contactName: 'Adyacente',
          contactPhone: '+5491166666666',
          dayOfWeek: 1,
          timeStart: '18:00',
          timeEnd: '19:00',
          pricePerSession: 100000,
          monthlyPrice: 400000,
          startsOn,
          paymentMethod: 'cash',
        },
        tx,
      ),
    )

    // Adyacencia no es conflicto: los 8 se generan y ambos bookings conviven.
    expect(conflictDates).not.toContain(startsOn)
    expect(slotsGenerated).toBe(8)
    expect(await countAbonadoBookingsOn(abonado.id, startsOn)).toBe(1) // 18-19 del abonado
    expect(await countActiveOnSlot(startsOn, '17:00')).toBe(1) // 17-18 individual
    expect(await countActiveOnSlot(startsOn, '18:00')).toBe(1) // 18-19 abonado
  }, 30_000)
})
