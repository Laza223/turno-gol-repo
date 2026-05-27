'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql as dsql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import {
  createCourt,
  updateCourt,
  toggleStatus,
  getCourtCountAndLimit,
  validatePricingRulesCoverage,
} from '@/modules/courts/court.service'
import { createCourtSchema, updateCourtSchema } from '@/modules/courts/court.schema'
import { bookings, abonados } from '@/shared/db/schema'

export type CourtActionResult =
  | { success: true; courtId?: string }
  | { success: false; error: string }

async function requireStaffTenant() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  return tenant
}

export async function createCourtAction(formData: FormData): Promise<CourtActionResult> {
  const tenant = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const pricingRaw = formData.get('pricing')
  let pricingParsed: unknown
  try {
    pricingParsed = JSON.parse(typeof pricingRaw === 'string' ? pricingRaw : '{}')
  } catch {
    return { success: false, error: 'Formato de precios inválido' }
  }

  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    surfaceType: formData.get('surfaceType'),
    capacity: Number(formData.get('capacity')),
    pricing: pricingParsed,
  }

  const parsed = createCourtSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const coverage = validatePricingRulesCoverage(parsed.data.pricing.rules, tenant.openingHours)
  if (!coverage.valid) {
    const sample = coverage.gaps
      .slice(0, 3)
      .map((g) => `${g.day} ${g.time}`)
      .join(', ')
    return { success: false, error: `Precios sin cubrir: ${sample}` }
  }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const { count, maxCourts } = await getCourtCountAndLimit(tenant.id, tx)
    if (maxCourts !== null && count >= maxCourts) {
      return {
        success: false as const,
        error: `Tu plan soporta hasta ${maxCourts} canchas. Hacé upgrade para agregar más.`,
      }
    }
    const court = await createCourt(tenant.id, parsed.data, tx)
    return { success: true as const, courtId: court.id }
  })

  if (result.success) revalidatePath('/canchas')
  return result
}

export async function updateCourtAction(
  courtId: string,
  formData: FormData,
): Promise<CourtActionResult> {
  const tenant = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const pricingRaw = formData.get('pricing')
  let pricingParsed: unknown
  try {
    pricingParsed = pricingRaw ? JSON.parse(pricingRaw as string) : undefined
  } catch {
    return { success: false, error: 'Formato de precios inválido' }
  }

  const raw = {
    name: formData.get('name') ?? undefined,
    description: formData.get('description') ?? undefined,
    surfaceType: formData.get('surfaceType') ?? undefined,
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : undefined,
    pricing: pricingParsed,
  }

  const parsed = updateCourtSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  if (parsed.data.pricing) {
    const coverage = validatePricingRulesCoverage(parsed.data.pricing.rules, tenant.openingHours)
    if (!coverage.valid) {
      const sample = coverage.gaps
        .slice(0, 3)
        .map((g) => `${g.day} ${g.time}`)
        .join(', ')
      return { success: false, error: `Precios sin cubrir: ${sample}` }
    }
  }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const court = await updateCourt(courtId, parsed.data, tx)
    if (!court) return { success: false as const, error: 'Cancha no encontrada' }
    return { success: true as const, courtId: court.id }
  })

  if (result.success) revalidatePath('/canchas')
  return result
}

export async function toggleCourtStatusAction(
  courtId: string,
  status: 'online' | 'offline',
): Promise<CourtActionResult> {
  const tenant = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const court = await toggleStatus(courtId, status, tx)
    if (!court) return { success: false as const, error: 'Cancha no encontrada' }
    return { success: true as const, courtId: court.id }
  })

  if (result.success) revalidatePath('/canchas')
  return result
}

export type CourtDeactivationImpactResult =
  | { success: true; futureBookings: number; activeAbonados: number }
  | { success: false; error: string }

export async function getCourtDeactivationImpactAction(
  courtId: string,
): Promise<CourtDeactivationImpactResult> {
  const tenant = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  // ART = UTC-3. Fecha de hoy en Argentina (YYYY-MM-DD); se compara contra la
  // columna `date` con cast explícito ::date — misma convención que
  // booking.service.ts (evita ambigüedad de serialización de Date en Drizzle).
  const dateStr = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

  return withTenantContext(tenant.id, async (tx) => {
    const [b] = await tx
      .select({ n: dsql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.courtId, courtId),
          dsql`${bookings.date} >= ${dateStr}::date`,
          inArray(bookings.status, ['confirmed', 'pending_payment']),
        ),
      )
    const [a] = await tx
      .select({ n: dsql<number>`count(*)::int` })
      .from(abonados)
      .where(and(eq(abonados.courtId, courtId), eq(abonados.status, 'active')))
    return {
      success: true as const,
      futureBookings: b?.n ?? 0,
      activeAbonados: a?.n ?? 0,
    }
  })
}
