import { and, eq, sql } from 'drizzle-orm'
import { courts, tenantSubscriptions } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { priceForSlot } from '@/lib/booking/pricing'
import { effectiveCloseMins } from '@/shared/time/operating-day'
import type {
  CourtRow,
  CreateCourtInput,
  UpdateCourtInput,
  PricingRule,
  CourtPricingData,
} from './court.types'
import { CourtPhotoLimitError, CourtPhotoOrderMismatchError } from './court.errors'

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function rowToCourtRow(row: typeof courts.$inferSelect): CourtRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    surfaceType: row.surfaceType,
    isCovered: row.isCovered,
    hasLighting: row.hasLighting,
    format: row.format,
    capacity: row.capacity,
    photos: (row.photos as string[]) ?? [],
    status: row.status,
    pricing: row.pricing as CourtPricingData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listCourts(tenantId: string, tx: DbTx): Promise<CourtRow[]> {
  const rows = await tx
    .select()
    .from(courts)
    .where(eq(courts.tenantId, tenantId))
    .orderBy(courts.createdAt)
  return rows.map(rowToCourtRow)
}

/**
 * Canchas sin ninguna foto (online o pausadas, igual que la lista de /canchas).
 * `photos` es nullable en el schema: NULL y `{}` cuentan como sin foto.
 */
export async function countCourtsWithoutPhotos(tenantId: string, tx: DbTx): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(courts)
    .where(and(eq(courts.tenantId, tenantId), sql`COALESCE(cardinality(${courts.photos}), 0) = 0`))
  return Number(row?.count ?? 0)
}

export async function getCourtById(
  courtId: string,
  tenantId: string,
  tx: DbTx,
): Promise<CourtRow | null> {
  const rows = await tx
    .select()
    .from(courts)
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .limit(1)
  return rows[0] ? rowToCourtRow(rows[0]) : null
}

export async function createCourt(
  tenantId: string,
  data: CreateCourtInput,
  tx: DbTx,
): Promise<CourtRow> {
  const [row] = await tx
    .insert(courts)
    .values({
      tenantId,
      name: data.name,
      description: data.description ?? null,
      surfaceType: data.surfaceType,
      isCovered: data.isCovered ?? false,
      hasLighting: data.hasLighting ?? true,
      format: data.format,
      // capacity derivado: jugadores totales = format × 2 (cambio #17).
      capacity: data.format * 2,
      pricing: data.pricing as unknown as Record<string, unknown>,
      photos: data.photos ?? [],
    })
    .returning()
  return rowToCourtRow(row!)
}

export async function updateCourt(
  courtId: string,
  tenantId: string,
  data: UpdateCourtInput,
  tx: DbTx,
): Promise<CourtRow | null> {
  const patch: Partial<typeof courts.$inferInsert> = { updatedAt: new Date() }
  if (data.name !== undefined) patch.name = data.name
  if (data.description !== undefined) patch.description = data.description ?? null
  if (data.surfaceType !== undefined) patch.surfaceType = data.surfaceType
  if (data.isCovered !== undefined) patch.isCovered = data.isCovered
  if (data.hasLighting !== undefined) patch.hasLighting = data.hasLighting
  if (data.format !== undefined) {
    patch.format = data.format
    patch.capacity = data.format * 2 // capacity sigue derivado de format (cambio #17)
  }
  if (data.pricing !== undefined) patch.pricing = data.pricing as unknown as Record<string, unknown>

  const rows = await tx
    .update(courts)
    .set(patch)
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning()
  return rows[0] ? rowToCourtRow(rows[0]) : null
}

export async function toggleStatus(
  courtId: string,
  tenantId: string,
  status: 'online' | 'offline',
  tx: DbTx,
): Promise<CourtRow | null> {
  const rows = await tx
    .update(courts)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning()
  return rows[0] ? rowToCourtRow(rows[0]) : null
}

/**
 * Canchas ONLINE del complejo y canchas por las que hoy se factura.
 *
 * Reemplaza a `getCourtCountAndLimit`, que devolvía el techo de
 * `plans.max_courts`. Desde la decisión del 2026-09-17 (precio lineal por
 * cancha) **no hay techo**: agregar una cancha no se bloquea, cuesta $30.000
 * más por mes. Lo que se compara ahora es contra
 * `tenant_subscriptions.billed_courts`, o sea lo que está cargado en el
 * preapproval de MercadoPago.
 *
 * Solo cuenta `status = 'online'`: una cancha apagada no genera reservas ni
 * ingresos. Es a propósito el MISMO criterio que `countOnlineCourts`
 * (billing.service.ts) — el aviso de /canchas y el piso de facturación tienen
 * que medir lo mismo, o el complejo queda atrapado entre dos números que no
 * coinciden.
 *
 * `billedCourts` es por cuántas canchas se va a cobrar en el PRÓXIMO cobro:
 * `pending_billed_courts` si hay un cambio agendado, si no `billed_courts`.
 * Comparar solo contra `billed_courts` dejaba un agujero de plata: con una baja
 * agendada (5 → 3), volver a prender las canchas 4 y 5 no avisaba nada (5 ≤ 5),
 * la baja seguía en pie y el sweep terminaba cobrando 3 con 5 prendidas.
 *
 * `billedCourts: null` = no hay suscripción en un estado donde mover el cobro
 * signifique algo (`active` / `trialing`). En ese caso no hay nada que
 * confirmar ni que agendar: crear o prender canchas pasa sin ruido.
 */
export async function getCourtCountAndBilled(
  tenantId: string,
  tx: DbTx,
): Promise<{ onlineCourts: number; billedCourts: number | null; isTrialing: boolean }> {
  const [countRow] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(courts)
    .where(and(eq(courts.tenantId, tenantId), eq(courts.status, 'online')))

  const subRows = await tx
    .select({
      billedCourts: tenantSubscriptions.billedCourts,
      pendingBilledCourts: tenantSubscriptions.pendingBilledCourts,
      status: tenantSubscriptions.status,
    })
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1)

  const sub = subRows[0]
  const adjustable = sub != null && (sub.status === 'active' || sub.status === 'trialing')

  return {
    onlineCourts: Number(countRow?.count ?? 0),
    billedCourts: adjustable ? (sub.pendingBilledCourts ?? sub.billedCourts) : null,
    isTrialing: sub?.status === 'trialing',
  }
}

/**
 * Precio de la franja a la que pertenece un INSTANTE. El lookup en sí vive en
 * `@/lib/booking/pricing` (fuente única, también usable desde el cliente):
 * acá sólo queda la conversión instante → (día ART, hora de pared).
 */
export function calculatePrice(pricing: CourtPricingData, date: Date): number | null {
  const artDate = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  const dayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[artDate.getUTCDay()]!
  const slotTime = `${String(artDate.getUTCHours()).padStart(2, '0')}:${String(artDate.getUTCMinutes()).padStart(2, '0')}`
  return priceForSlot(pricing, dayKey, slotTime)
}

/**
 * Backstop de cobertura: ¿hay un precio para cada hora operativa? El rango
 * recorre el eje continuo de `effectiveCloseMins` (soporta madrugada,
 * `closesNextDay`), pero las reglas guardan horas de PARED (0–23) — mismo
 * corte que `priceForSlot`/`priceForCell` (pricing-grid.ts): la franja de
 * madrugada de un complejo que cierra pasada medianoche está etiquetada con el
 * MISMO día operativo, así que el chequeo de cobertura busca la regla módulo
 * 24hs, no en el eje extendido.
 */
export function validatePricingRulesCoverage(
  rules: PricingRule[],
  openingHours: OpeningHours,
  closesNextDay: boolean,
): { valid: boolean; gaps: { day: string; time: string }[] } {
  const gaps: { day: string; time: string }[] = []
  const DAY_MINS = 24 * 60

  for (const [day, hours] of Object.entries(openingHours) as [
    string,
    OpeningHours[keyof OpeningHours],
  ][]) {
    if (!hours || hours.closed) continue
    const openMins = timeToMins(hours.open)
    const closeMins = effectiveCloseMins(hours.open, hours.close, closesNextDay)

    for (let m = openMins; m < closeMins; m += 60) {
      const wallMins = m % DAY_MINS
      const slotTime = `${String(Math.floor(wallMins / 60)).padStart(2, '0')}:00`
      const covered = rules.some((r) => {
        if (!r.days.includes(day)) return false
        const fm = timeToMins(r.from)
        const tm = r.to === '00:00' ? DAY_MINS : timeToMins(r.to)
        return wallMins >= fm && wallMins < tm
      })
      if (!covered) gaps.push({ day, time: slotTime })
    }
  }

  return { valid: gaps.length === 0, gaps }
}

async function getCourtPhotos(
  courtId: string,
  tenantId: string,
  tx: DbTx,
): Promise<string[] | null> {
  const rows = await tx
    .select({ photos: courts.photos })
    .from(courts)
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .limit(1)
  if (!rows.length) return null
  return (rows[0]!.photos as string[]) ?? []
}

const MAX_COURT_PHOTOS = 6

/** Agrega `url` al final de `courts.photos`. Rechaza al superar 6 fotos. */
export async function appendCourtPhoto(
  courtId: string,
  tenantId: string,
  url: string,
  tx: DbTx,
): Promise<string[] | null> {
  const current = await getCourtPhotos(courtId, tenantId, tx)
  if (current === null) return null
  if (current.length >= MAX_COURT_PHOTOS) {
    throw new CourtPhotoLimitError(MAX_COURT_PHOTOS)
  }
  const next = [...current, url]
  const rows = await tx
    .update(courts)
    .set({ photos: next, updatedAt: new Date() })
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning({ photos: courts.photos })
  return (rows[0]?.photos as string[]) ?? null
}

/** Quita `url` de `courts.photos`. No falla si `url` no estaba presente. */
export async function removeCourtPhoto(
  courtId: string,
  tenantId: string,
  url: string,
  tx: DbTx,
): Promise<string[] | null> {
  const current = await getCourtPhotos(courtId, tenantId, tx)
  if (current === null) return null
  const next = current.filter((p) => p !== url)
  const rows = await tx
    .update(courts)
    .set({ photos: next, updatedAt: new Date() })
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning({ photos: courts.photos })
  return (rows[0]?.photos as string[]) ?? null
}

/** Persiste un nuevo orden de `courts.photos`. Rechaza si el conjunto no coincide con el actual (anti-injection de urls ajenas). */
export async function reorderCourtPhotos(
  courtId: string,
  tenantId: string,
  urls: string[],
  tx: DbTx,
): Promise<string[] | null> {
  const current = await getCourtPhotos(courtId, tenantId, tx)
  if (current === null) return null
  const sameSet =
    current.length === urls.length && [...current].sort().join('|') === [...urls].sort().join('|')
  if (!sameSet) {
    throw new CourtPhotoOrderMismatchError()
  }
  const rows = await tx
    .update(courts)
    .set({ photos: urls, updatedAt: new Date() })
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning({ photos: courts.photos })
  return (rows[0]?.photos as string[]) ?? null
}
