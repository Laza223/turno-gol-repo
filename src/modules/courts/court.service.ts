import { and, eq, sql } from 'drizzle-orm'
import { courts, tenantSubscriptions, plans } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { CourtRow, CreateCourtInput, UpdateCourtInput, PricingRule, CourtPricingData } from './court.types'

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

export async function getCourtCountAndLimit(
  tenantId: string,
  tx: DbTx,
): Promise<{ count: number; maxCourts: number | null; planSlug: string | null }> {
  const [countRow] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(courts)
    .where(eq(courts.tenantId, tenantId))

  const subRows = await tx
    .select({ maxCourts: plans.maxCourts, planSlug: plans.slug })
    .from(tenantSubscriptions)
    .innerJoin(plans, eq(tenantSubscriptions.planId, plans.id))
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1)

  return {
    count: Number(countRow?.count ?? 0),
    maxCourts: subRows[0]?.maxCourts ?? null,
    planSlug: subRows[0]?.planSlug ?? null,
  }
}

export function calculatePrice(
  pricing: CourtPricingData,
  date: Date,
): number | null {
  const artDate = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  const dayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[artDate.getUTCDay()]!
  const slotTime = `${String(artDate.getUTCHours()).padStart(2, '0')}:${String(artDate.getUTCMinutes()).padStart(2, '0')}`
  const slotMins = timeToMins(slotTime)

  for (const rule of pricing.rules) {
    if (!rule.days.includes(dayKey)) continue
    const fromMins = timeToMins(rule.from)
    const toMins = rule.to === '00:00' ? 24 * 60 : timeToMins(rule.to)
    if (slotMins >= fromMins && slotMins < toMins) {
      return rule.price ?? null
    }
  }
  return null
}

export function validatePricingRulesCoverage(
  rules: PricingRule[],
  openingHours: OpeningHours,
): { valid: boolean; gaps: { day: string; time: string }[] } {
  const gaps: { day: string; time: string }[] = []

  for (const [day, hours] of Object.entries(openingHours) as [string, OpeningHours[keyof OpeningHours]][]) {
    if (!hours || hours.closed) continue
    const openMins = timeToMins(hours.open)
    const closeMins = hours.close === '00:00' ? 24 * 60 : timeToMins(hours.close)

    for (let m = openMins; m < closeMins; m += 60) {
      const slotTime = `${String(Math.floor(m / 60)).padStart(2, '0')}:00`
      const covered = rules.some((r) => {
        if (!r.days.includes(day)) return false
        const fm = timeToMins(r.from)
        const tm = r.to === '00:00' ? 24 * 60 : timeToMins(r.to)
        return m >= fm && m < tm
      })
      if (!covered) gaps.push({ day, time: slotTime })
    }
  }

  return { valid: gaps.length === 0, gaps }
}

export function nextPlanSlug(current: string | null): string {
  if (current === 'predio') return 'complejo'
  if (current === 'complejo') return 'estadio'
  return 'estadio'
}
