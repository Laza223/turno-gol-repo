import { sql, eq, and } from 'drizzle-orm'
import { abonados } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { invalidateAvailSearch } from '@/shared/cache/slots-cache'
import { addDays } from '@/shared/dates/art'
import { physicalRange } from '@/shared/time/physical-range'
import { getCourtById } from '@/modules/courts/court.service'
import { slotIsPhysicallyNextDay } from '@/modules/bookings/booking.service'
import { paidPeriodCutoff } from '@/modules/bookings/paid-period.guard'
import {
  depositCashFlowDescription,
  summarizeBookingCharges,
} from '@/modules/bookings/booking.charges'
import {
  checkAbonadoSlotConflict,
  getClosedDates,
  lockCourtRow,
  rowToAbonadoRow,
} from './abonado.service'
import {
  AbonadoAlreadyCanceledError,
  AbonadoConflictError,
  AbonadoMoveConflictError,
  AbonadoNotEditableError,
  AbonadoNotFoundError,
  CourtNotFoundError,
} from './abonado.errors'
import type {
  AbonadoRow,
  UpdateAbonadoCounts,
  UpdateAbonadoInput,
  UpdateAbonadoOutcome,
  UpdateAbonadoPreview,
} from './abonado.types'

/**
 * Editar un turno fijo en TODAS sus fechas futuras (spec 2026-11-08).
 *
 * Qué es una fecha "futura": `status = 'confirmed'` y `starts_at >= ahora`
 * (instante físico, igual que `cancelAbonado`: `date` es el día operativo y no
 * dice si ya pasó). Lo pasado, jugado o cancelado no se toca nunca.
 *
 * La fila `abonados` es la fuente de las fechas que el worker genere de ahí en
 * más; acá se resuelve solo lo ya generado.
 */

type FutureSession = {
  id: string
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  guestName: string | null
  guestPhone: string | null
  /** Plata ya cobrada de esta fecha (seña retenida + cobros de mostrador). */
  paid: number
}

type PriceVerdict = 'none' | 'update' | 'keepOwnPrice' | 'keepPaid'

type SessionVerdict = {
  id: string
  price: PriceVerdict
  /** Pasa del `guest_name` viejo al nuevo (solo fijos sin cuenta de jugador). */
  rename: boolean
  /** Se le escribe el teléfono (solo fijos sin cuenta de jugador). */
  setPhone: boolean
}

type AbonadoSnapshot = Pick<
  AbonadoRow,
  'pricePerSession' | 'playerId' | 'contactName' | 'contactPhone'
>

/**
 * Qué le pasa a cada fecha futura. Pura: la usan la vista previa y la edición
 * real, así el número que ve el encargado nunca contradice lo que se aplica.
 *
 * Precio: una fecha cuyo precio ya no es el del fijo se puso a mano (promo,
 * feriado) y se respeta; una fecha con más cobrado que el precio nuevo también.
 */
export function classifyAbonadoUpdate(
  abonado: AbonadoSnapshot,
  sessions: readonly FutureSession[],
  input: UpdateAbonadoInput,
): { verdicts: SessionVerdict[]; counts: Omit<UpdateAbonadoCounts, 'moved'> } {
  const newPrice = input.pricePerSession
  const priceChanges = newPrice !== undefined && newPrice !== abonado.pricePerSession
  const noAccount = abonado.playerId === null

  const counts = { futureSessions: sessions.length, priceUpdated: 0, keptOwnPrice: 0, keptPaid: 0 }
  const verdicts = sessions.map((s): SessionVerdict => {
    let price: PriceVerdict = 'none'
    if (priceChanges) {
      if (s.priceSnapshot !== abonado.pricePerSession) price = 'keepOwnPrice'
      else if (newPrice < s.paid) price = 'keepPaid'
      else price = 'update'
    }
    if (price === 'update') counts.priceUpdated++
    if (price === 'keepOwnPrice') counts.keptOwnPrice++
    if (price === 'keepPaid') counts.keptPaid++

    return {
      id: s.id,
      price,
      rename:
        noAccount &&
        input.contactName !== undefined &&
        input.contactName !== abonado.contactName &&
        s.guestName === abonado.contactName,
      // `guest_phone` NULL es el caso normal de una fecha generada antes del fix:
      // se completa. Uno distinto al del fijo lo corrigió alguien a mano: se respeta.
      setPhone:
        noAccount &&
        input.contactPhone !== undefined &&
        input.contactPhone !== abonado.contactPhone &&
        (s.guestPhone === null || s.guestPhone === abonado.contactPhone),
    }
  })

  return { verdicts, counts }
}

async function loadFutureSessions(
  tenantId: string,
  abonadoId: string,
  tx: DbTx,
  lock: boolean,
): Promise<FutureSession[]> {
  // El instante se liga desde JS y no con NOW(): un solo reloj (ver cancelAbonado).
  const nowIso = new Date().toISOString()
  const rows = (await tx.execute(sql`
    SELECT id, court_id, date::text AS date, time_start::text AS time_start,
           time_end::text AS time_end, price_snapshot, deposit_amount,
           deposit_status::text AS deposit_status, guest_name, guest_phone
    FROM bookings
    WHERE abonado_id = ${abonadoId}
      AND tenant_id = ${tenantId}
      AND status = 'confirmed'
      AND starts_at >= ${nowIso}::timestamptz
    ORDER BY starts_at
    ${lock ? sql`FOR UPDATE` : sql``}
  `)) as unknown as Array<{
    id: string
    court_id: string
    date: string
    time_start: string
    time_end: string
    price_snapshot: number
    deposit_amount: number
    deposit_status: string
    guest_name: string | null
    guest_phone: string | null
  }>

  if (rows.length === 0) return []

  // Con el FOR UPDATE tomado, un cobro concurrente espera (el FK de cash_flows
  // pide KEY SHARE sobre la reserva) y el total de abajo no se desactualiza.
  const charges = (await tx.execute(sql`
    SELECT booking_id, amount, description
    FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND type = 'income'
      AND category = 'booking'
      AND booking_id IN (${sql.join(
        rows.map((r) => sql`${r.id}::uuid`),
        sql`, `,
      )})
  `)) as unknown as Array<{ booking_id: string; amount: number; description: string | null }>

  const chargesByBooking = new Map<string, number>()
  for (const c of charges) {
    if (c.description === depositCashFlowDescription(c.booking_id)) continue
    chargesByBooking.set(c.booking_id, (chargesByBooking.get(c.booking_id) ?? 0) + c.amount)
  }

  return rows.map((r) => ({
    id: r.id,
    courtId: r.court_id,
    date: r.date,
    timeStart: r.time_start,
    timeEnd: r.time_end,
    priceSnapshot: r.price_snapshot,
    depositAmount: r.deposit_amount,
    depositStatus: r.deposit_status,
    guestName: r.guest_name,
    guestPhone: r.guest_phone,
    paid: summarizeBookingCharges({
      priceSnapshot: r.price_snapshot,
      depositAmount: r.deposit_amount,
      depositStatus: r.deposit_status,
      chargesTotal: chargesByBooking.get(r.id) ?? 0,
    }).totalPaid,
  }))
}

type MoveTarget = {
  id: string
  date: string
  courtId: string
  timeStart: string
  timeEnd: string
  startsAt: Date
  endsAt: Date
}

type MovePlan = {
  targets: MoveTarget[]
  conflictDates: string[]
  fixedConflict: boolean
  /** Fechas que se quedan como están: ya pasaron, están en un día cerrado, se movieron a mano o quedan después del fin del fijo. */
  notMoved: number
}

const hhmm = (t: string) => t.slice(0, 5)

function isSlotChange(abonado: AbonadoRow, input: UpdateAbonadoInput): boolean {
  return (
    (input.courtId !== undefined && input.courtId !== abonado.courtId) ||
    (input.dayOfWeek !== undefined && input.dayOfWeek !== abonado.dayOfWeek) ||
    (input.timeStart !== undefined && input.timeStart !== hhmm(abonado.timeStart)) ||
    (input.timeEnd !== undefined && input.timeEnd !== hhmm(abonado.timeEnd))
  )
}

/**
 * A dónde va cada fecha si cambia el día, el horario o la cancha, y qué la
 * frena. Todo o nada: con una sola fecha frenada no se mueve ninguna (el worker
 * cuenta por fecha, no por horario, y un fijo con dos horarios no se entiende).
 *
 * El día de la semana corre cada fecha al próximo día nuevo, nunca hacia atrás.
 * No se mueven ni frenan nada (se cuentan en `notMoved`) las fechas que:
 *  - ya habrían pasado (por ejemplo hoy, moviendo a una hora anterior);
 *  - quedarían después del `ends_on` del fijo;
 *  - caen en un día que el complejo cerró (decisión 2026-11-08);
 *  - alguien movió a mano a otra cancha, día u horario: no coinciden con el
 *    slot actual del fijo y se respetan igual que un precio puesto a mano.
 */
async function planMove(
  tenantId: string,
  abonado: AbonadoRow,
  sessions: readonly FutureSession[],
  input: UpdateAbonadoInput,
  tx: DbTx,
): Promise<MovePlan> {
  const none: MovePlan = { targets: [], conflictDates: [], fixedConflict: false, notMoved: 0 }
  if (!isSlotChange(abonado, input)) return none

  const courtId = input.courtId ?? abonado.courtId
  const dayOfWeek = input.dayOfWeek ?? abonado.dayOfWeek
  const timeStart = input.timeStart ?? hhmm(abonado.timeStart)
  const timeEnd = input.timeEnd ?? hhmm(abonado.timeEnd)

  const fixedConflict = await checkAbonadoSlotConflict(
    courtId,
    dayOfWeek,
    timeStart,
    timeEnd,
    tenantId,
    abonado.id,
    tx,
  )
  // Sin fechas por venir igual se avisa del choque con otro fijo: si no, el
  // encargado se entera recién al guardar.
  if (sessions.length === 0) return { ...none, fixedConflict }

  const closed = new Set(await getClosedDates(tenantId, tx))
  const cutoff = await paidPeriodCutoff(tenantId, tx)
  const endsOn = abonado.endsOn ? abonado.endsOn.toISOString().slice(0, 10) : null
  const shift = (dayOfWeek - abonado.dayOfWeek + 7) % 7
  const now = Date.now()

  const conflictDates = new Set<string>()
  const targets: MoveTarget[] = []
  let notMoved = 0
  for (const s of sessions) {
    const sessionDow = new Date(`${s.date}T00:00:00Z`).getUTCDay()
    if (
      s.courtId !== abonado.courtId ||
      sessionDow !== abonado.dayOfWeek ||
      hhmm(s.timeStart) !== hhmm(abonado.timeStart) ||
      hhmm(s.timeEnd) !== hhmm(abonado.timeEnd)
    ) {
      notMoved++
      continue
    }
    const date = addDays(s.date, shift)
    if (endsOn !== null && date > endsOn) {
      notMoved++
      continue
    }
    // El madrugada/día-operativo cambia con la fecha (cada día tiene su apertura).
    const physicallyNextDay = await slotIsPhysicallyNextDay(tenantId, date, timeStart, tx)
    const { startsAt, endsAt } = physicalRange({ date, timeStart, timeEnd, physicallyNextDay })
    if (startsAt.getTime() <= now) {
      notMoved++
      continue
    }
    if (closed.has(date)) {
      notMoved++
      continue
    }
    if (cutoff !== null && date > cutoff) {
      conflictDates.add(date)
      continue
    }
    targets.push({ id: s.id, date, courtId, timeStart, timeEnd, startsAt, endsAt })
  }

  if (targets.length > 0) {
    const taken = (await tx.execute(sql`
      SELECT c.idx
      FROM (VALUES ${sql.join(
        targets.map(
          (t, i) =>
            sql`(${i}::int, ${t.courtId}::uuid, ${t.startsAt.toISOString()}::timestamptz, ${t.endsAt.toISOString()}::timestamptz)`,
        ),
        sql`, `,
      )}) AS c(idx, court_id, starts_at, ends_at)
      WHERE EXISTS (
        SELECT 1
        FROM bookings b
        WHERE b.court_id = c.court_id
          AND b.status IN ('pending_payment', 'confirmed')
          AND b.id NOT IN (${sql.join(
            targets.map((t) => sql`${t.id}::uuid`),
            sql`, `,
          )})
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(c.starts_at, c.ends_at)
      )
    `)) as unknown as Array<{ idx: number }>
    for (const r of taken) conflictDates.add(targets[r.idx]!.date)
  }

  return { targets, conflictDates: [...conflictDates].sort(), fixedConflict, notMoved }
}

async function loadEditableAbonado(
  tenantId: string,
  abonadoId: string,
  tx: DbTx,
  lock: boolean,
): Promise<AbonadoRow> {
  const base = tx
    .select()
    .from(abonados)
    .where(and(eq(abonados.id, abonadoId), eq(abonados.tenantId, tenantId)))
    .limit(1)
  const rows = await (lock ? base.for('update') : base)
  const row = rows[0]
  if (!row) throw new AbonadoNotFoundError(abonadoId)
  if (row.status === 'canceled') throw new AbonadoAlreadyCanceledError()
  if (row.status !== 'active') throw new AbonadoNotEditableError()
  return rowToAbonadoRow(row)
}

/**
 * Qué cambió, para el historial: `[antes, después]` en lo que no es dato de una
 * persona (precio, cancha, día, horario). Nombre y teléfono solo dejan constancia
 * de que cambiaron, así el historial no guarda datos personales.
 */
function auditChanges(abonado: AbonadoRow, input: UpdateAbonadoInput): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.pricePerSession !== undefined)
    out.pricePerSession = [abonado.pricePerSession, input.pricePerSession]
  if (input.courtId !== undefined) out.courtId = [abonado.courtId, input.courtId]
  if (input.dayOfWeek !== undefined) out.dayOfWeek = [abonado.dayOfWeek, input.dayOfWeek]
  if (input.timeStart !== undefined) out.timeStart = [hhmm(abonado.timeStart), input.timeStart]
  if (input.timeEnd !== undefined) out.timeEnd = [hhmm(abonado.timeEnd), input.timeEnd]
  if (input.contactName !== undefined) out.contactName = 'changed'
  if (input.contactPhone !== undefined) out.contactPhone = 'changed'
  return out
}

/** Cancha destino: de este complejo, o `CourtNotFoundError`. */
async function assertCourtOfTenant(tenantId: string, input: UpdateAbonadoInput, tx: DbTx) {
  if (input.courtId === undefined) return
  const court = await getCourtById(input.courtId, tenantId, tx)
  if (!court) throw new CourtNotFoundError(input.courtId)
}

/**
 * Vista previa: mismos conteos y choques que la edición real, sin escribir ni
 * lockear. Si hay un choque lo devuelve en `conflictDates`/`fixedConflict`
 * (no tira: la pantalla lo muestra antes de que el encargado confirme).
 */
export async function previewUpdateAbonado(
  tenantId: string,
  abonadoId: string,
  input: UpdateAbonadoInput,
  tx: DbTx,
): Promise<UpdateAbonadoPreview> {
  const abonado = await loadEditableAbonado(tenantId, abonadoId, tx, false)
  await assertCourtOfTenant(tenantId, input, tx)
  const sessions = await loadFutureSessions(tenantId, abonadoId, tx, false)
  const { counts } = classifyAbonadoUpdate(abonado, sessions, input)
  const move = await planMove(tenantId, abonado, sessions, input, tx)
  return {
    ...counts,
    moved: move.targets.length,
    notMoved: move.notMoved,
    conflictDates: move.conflictDates,
    fixedConflict: move.fixedConflict,
  }
}

export async function updateAbonado(
  tenantId: string,
  abonadoId: string,
  staffUserId: string,
  input: UpdateAbonadoInput,
  tx: DbTx,
): Promise<UpdateAbonadoOutcome> {
  const abonado = await loadEditableAbonado(tenantId, abonadoId, tx, true)
  await assertCourtOfTenant(tenantId, input, tx)

  // ORDEN DE LOCKS: canchas (origen y destino, por id para que dos ediciones
  // cruzadas no se esperen en cruz) y DESPUÉS las reservas, igual que
  // rescheduleBooking. Un cambio de cancha/día/horario es el único que las
  // necesita: un cambio de precio o de nombre no compite por el horario.
  if (isSlotChange(abonado, input)) {
    const courtIds = [...new Set([abonado.courtId, input.courtId ?? abonado.courtId])].sort()
    for (const id of courtIds) await lockCourtRow(id, tx)
  }

  const sessions = await loadFutureSessions(tenantId, abonadoId, tx, true)
  const { verdicts, counts } = classifyAbonadoUpdate(abonado, sessions, input)
  const move = await planMove(tenantId, abonado, sessions, input, tx)
  if (move.fixedConflict || move.conflictDates.length > 0) {
    throw new AbonadoMoveConflictError(move.conflictDates, move.fixedConflict)
  }

  const priceIds = verdicts.filter((v) => v.price === 'update').map((v) => v.id)
  if (priceIds.length > 0) {
    // Sin el marcador el trigger de la migr. 089 rechaza el cambio de precio.
    // `set_config(..., true)` = SET LOCAL: muere con la transacción.
    await tx.execute(sql`SELECT set_config('app.booking_edit', 'on', true)`)
    await tx.execute(sql`
      UPDATE bookings
      SET price_snapshot = ${input.pricePerSession!}, updated_at = now()
      WHERE id IN (${sql.join(
        priceIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    `)
  }

  for (const v of verdicts) {
    if (!v.rename && !v.setPhone) continue
    await tx.execute(sql`
      UPDATE bookings
      SET guest_name = ${v.rename ? input.contactName! : sql`guest_name`},
          guest_phone = ${v.setPhone ? input.contactPhone! : sql`guest_phone`},
          updated_at = now()
      WHERE id = ${v.id}::uuid
    `)
  }

  // Las SEIS columnas del slot juntas: `starts_at`/`ends_at` son las que mira el
  // exclusion constraint de bookings (migr. 040/041).
  for (const t of move.targets) {
    await tx.execute(sql`
      UPDATE bookings
      SET court_id = ${t.courtId}::uuid, date = ${t.date}::date,
          time_start = ${t.timeStart}::time, time_end = ${t.timeEnd}::time,
          starts_at = ${t.startsAt.toISOString()}::timestamptz,
          ends_at = ${t.endsAt.toISOString()}::timestamptz,
          updated_at = now()
      WHERE id = ${t.id}::uuid
    `)
  }

  const updatedRows = await tx
    .update(abonados)
    .set({
      ...(input.courtId !== undefined && { courtId: input.courtId }),
      ...(input.contactName !== undefined && { contactName: input.contactName }),
      ...(input.contactPhone !== undefined && { contactPhone: input.contactPhone }),
      ...(input.dayOfWeek !== undefined && { dayOfWeek: input.dayOfWeek }),
      ...(input.timeStart !== undefined && { timeStart: input.timeStart }),
      ...(input.timeEnd !== undefined && { timeEnd: input.timeEnd }),
      ...(input.pricePerSession !== undefined && { pricePerSession: input.pricePerSession }),
      updatedAt: new Date(),
    })
    .where(eq(abonados.id, abonadoId))
    .returning()
    .catch((err: unknown) => {
      // Otro turno fijo ganó el horario entre el chequeo y el UPDATE (23P01,
      // `no_overlapping_abonados`). Drizzle deja el código en `cause`.
      const code = (err as { cause?: { code?: string } }).cause?.code
      if (code === '23P01') throw new AbonadoConflictError()
      throw err
    })

  const updated = rowToAbonadoRow(updatedRows[0]!)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'abonado.updated',
    resourceType: 'abonado',
    resourceId: abonadoId,
    metadata: {
      changed: auditChanges(abonado, input),
      ...counts,
      moved: move.targets.length,
      notMoved: move.notMoved,
    },
  })

  const touchedDates = new Set<string>()
  for (const t of move.targets) {
    touchedDates.add(t.date)
    const from = sessions.find((s) => s.id === t.id)
    if (from) touchedDates.add(from.date)
  }
  for (const d of touchedDates) await invalidateAvailSearch(d)

  return { abonado: updated, ...counts, moved: move.targets.length }
}
