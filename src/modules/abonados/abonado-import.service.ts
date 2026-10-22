import { eq } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { isLockTimeout } from '@/shared/db/pg-errors'
import { physicalRange } from '@/shared/time/physical-range'
import { listCourts } from '@/modules/courts/court.service'
import { slotIsPhysicallyNextDay } from '@/modules/bookings/booking.service'
import { paidPeriodCutoff } from '@/modules/bookings/paid-period.guard'
import { checkAbonadoSlotConflict, createAbonado, getAbonadoSlotConflicts } from './abonado.service'
import { createAbonadoSchema } from './abonado.schema'
import { generateSlotDates } from './slot-generator'
import { AbonadoConflictError, CourtNotFoundError } from './abonado.errors'
import { parseDelimitedText, serializeTable, validateImportText } from './abonado-import.parse'
import type {
  ImportOutcome,
  ImportPreview,
  ImportRowPreview,
  ImportRowValue,
} from './abonado-import.types'
import type { CreateAbonadoInput } from './abonado.types'

/** Las mismas semanas que genera el alta manual (`createAbonado`, `count: 8`). */
const PREVIEW_WEEKS = 8

/** Abre una transacción con el contexto del tenant: `withTenantContext` en la action. */
type InTenantTx = <T>(fn: (tx: DbTx) => Promise<T>) => Promise<T>

function toCreateInput(value: ImportRowValue, startsOn: string): CreateAbonadoInput {
  return {
    courtId: value.courtId,
    contactName: value.contactName,
    contactPhone: value.contactPhone,
    dayOfWeek: value.dayOfWeek,
    timeStart: value.timeStart,
    timeEnd: value.timeEnd,
    pricePerSession: value.pricePerSession,
    startsOn,
    paymentMethod: 'cash',
  }
}

/**
 * La vista previa del importador: cada fila de la planilla con lo que va a
 * pasar si se confirma. Repite, fila por fila, los chequeos de la vista previa
 * del alta manual (`previewAbonadoSlotsAction`) con las mismas funciones: otro
 * fijo activo en ese horario, el corte del período pago y las fechas ya
 * reservadas. Lo único propio son los chequeos de la planilla
 * (`validateImportText`).
 *
 * `startsFrom` es el "Empiezan el" del lote: cada fijo arranca el primer día
 * suyo a partir de ahí, como en el alta manual, donde la fecha solo puede caer
 * en el día elegido. Si ese día es hoy y la hora ya pasó, arranca la semana
 * siguiente: el lote trae "hoy" por defecto, y sin esto un fijo del día de hoy
 * a una hora ya pasada nacía con un turno confirmado en el pasado.
 */
export async function previewAbonadoImport(
  tenantId: string,
  text: string,
  startsFrom: string,
  tx: DbTx,
): Promise<ImportPreview> {
  const courts = await listCourts(tenantId, tx)
  const [tenant] = await tx
    .select({ closedDates: tenants.closedDates, closesNextDay: tenants.closesNextDay })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const validated = validateImportText(
    text,
    courts.map((c) => ({ id: c.id, name: c.name })),
    { closesNextDay: tenant?.closesNextDay ?? false },
  )
  if (!validated.ok) return validated

  const closedDates = (tenant?.closedDates ?? []) as string[]
  const cutoff = await paidPeriodCutoff(tenantId, tx)

  const rows: ImportRowPreview[] = []
  for (const row of validated.rows) {
    const base: ImportRowPreview = {
      line: row.line,
      raw: row.raw,
      value: row.value,
      startsOn: null,
      firstDate: null,
      startsNextWeek: false,
      errors: row.errors,
      slotCount: 0,
      skippedDates: [],
      physicallyNextDay: false,
    }
    const value = row.value
    if (!value) {
      rows.push(base)
      continue
    }

    const [firstDay, nextWeek] = generateSlotDates({
      dayOfWeek: value.dayOfWeek,
      startsOn: startsFrom,
      endsOn: null,
      fromDate: startsFrom,
      count: 2,
      closedDates: [],
    })
    // Misma madrugada para las dos fechas: es el mismo día de la semana.
    const physicallyNextDay =
      firstDay && tenant?.closesNextDay
        ? await slotIsPhysicallyNextDay(tenantId, firstDay, value.timeStart, tx)
        : false
    // El instante de `bookings.starts_at`, el mismo que calcula `createAbonado`.
    const startsNextWeek =
      !!firstDay &&
      physicalRange({
        date: firstDay,
        timeStart: value.timeStart,
        timeEnd: value.timeEnd,
        physicallyNextDay,
      }).startsAt.getTime() <= Date.now()
    const startsOn = startsNextWeek ? nextWeek : firstDay
    // Se entendió pero no se puede cargar: el valor queda para mostrar la fila
    // tal como se leyó, y el error es lo que la deja afuera.
    const fail = (error: string) => rows.push({ ...base, errors: [error] })

    // La misma barrera que corre `createAbonadoAction` antes del service.
    if (!startsOn || !createAbonadoSchema.safeParse(toCreateInput(value, startsOn)).success) {
      fail('Datos inválidos')
      continue
    }
    const fixedTaken = await checkAbonadoSlotConflict(
      value.courtId,
      value.dayOfWeek,
      value.timeStart,
      value.timeEnd,
      tenantId,
      null,
      tx,
    )
    if (fixedTaken) {
      fail('Ya hay un turno fijo activo en ese horario')
      continue
    }

    const dates = generateSlotDates({
      dayOfWeek: value.dayOfWeek,
      startsOn,
      endsOn: null,
      fromDate: startsOn,
      count: PREVIEW_WEEKS,
      closedDates,
    })
    const bookable = cutoff === null ? dates : dates.filter((d) => d <= cutoff)
    if (bookable.length === 0) {
      fail('No queda ninguna fecha para generar este turno')
      continue
    }
    const taken = await getAbonadoSlotConflicts(
      tenantId,
      value.courtId,
      value.timeStart,
      value.timeEnd,
      bookable,
      tx,
    )
    if (taken.length === bookable.length) {
      fail('Todas las fechas de este horario ya están reservadas')
      continue
    }

    rows.push({
      ...base,
      startsOn,
      firstDate: bookable.find((d) => !taken.includes(d)) ?? null,
      startsNextWeek,
      slotCount: bookable.length - taken.length,
      skippedDates: taken,
      physicallyNextDay,
    })
  }
  return { ok: true, rows, ignoredColumns: validated.ignoredColumns }
}

/**
 * Por qué una fila que pasó la vista previa no entra al confirmar. `null` = un
 * error inesperado, que corta el lote como en el alta manual.
 */
function skipReason(err: unknown): string | null {
  if (err instanceof AbonadoConflictError) return 'Ya hay un turno fijo activo en ese horario'
  // El mensaje de la clase trae el id de la cancha: no le sirve a nadie.
  if (err instanceof CourtNotFoundError) return 'Esa cancha ya no existe'
  // Otra reserva tenía la cancha tomada más que el `lock_timeout` del rol.
  if (isLockTimeout(err)) {
    return 'Había otra reserva cargándose en esa cancha: revisá de nuevo en unos segundos'
  }
  return null
}

/**
 * Carga las filas buenas de la planilla. Corre la vista previa de nuevo —no se
 * confía en lo que vio el cliente: entre el preview y el confirmar pudo entrar
 * una reserva— y llama a `createAbonado`, el camino del alta manual, una vez
 * por fila.
 *
 * Cada fila va en su propia transacción (`inTenantTx`). `createAbonado` toma la
 * fila de la cancha con FOR UPDATE, y ese lock dura hasta el COMMIT: con el lote
 * en una sola transacción, cada cancha tocada quedaba tomada hasta la última
 * fila, y pasado el `lock_timeout` de 3 s del rol las reservas online y de la
 * grilla de esa cancha fallaban. Así el lock dura lo que tarda una fila.
 *
 * La contracara: si el lote se corta a la mitad, lo ya cargado queda. Volver a
 * revisar lo muestra como fijo existente, así que reintentar no duplica. Una
 * fila que `createAbonado` rechaza por un choque que apareció recién, o porque
 * la cancha siguió tomada, queda afuera y el resto sigue.
 */
export async function importAbonados(
  tenantId: string,
  staffUserId: string,
  text: string,
  startsFrom: string,
  inTenantTx: InTenantTx,
): Promise<ImportOutcome> {
  const preview = await inTenantTx((tx) => previewAbonadoImport(tenantId, text, startsFrom, tx))
  if (!preview.ok) return preview

  const created: Extract<ImportOutcome, { ok: true }>['created'] = []
  const skipped: Extract<ImportOutcome, { ok: true }>['skipped'] = []
  for (const row of preview.rows) {
    const contactName = row.value?.contactName ?? row.raw.name ?? ''
    if (!row.value || !row.startsOn || row.errors.length > 0) {
      skipped.push({ line: row.line, contactName, reason: row.errors[0] ?? 'Datos inválidos' })
      continue
    }
    const input = toCreateInput(row.value, row.startsOn)
    try {
      const result = await inTenantTx((tx) => createAbonado(tenantId, staffUserId, input, tx))
      created.push({ line: row.line, contactName, slotsGenerated: result.slotsGenerated })
    } catch (err) {
      const reason = skipReason(err)
      if (reason === null) throw err
      skipped.push({ line: row.line, contactName, reason })
    }
  }

  // Lo que quedó afuera vuelve a la caja tal como vino (con el encabezado), para
  // corregirlo y revisar solo eso. Es texto del propio staff que vuelve a su
  // navegador: no se guarda en ningún lado.
  const table = parseDelimitedText(text)
  const skippedLines = new Set(skipped.map((s) => s.line))
  const pendingText =
    skipped.length === 0
      ? ''
      : serializeTable(
          table.header,
          table.rows.filter((r) => skippedLines.has(r.line)).map((r) => r.cells),
        )
  return { ok: true, created, skipped, pendingText }
}
