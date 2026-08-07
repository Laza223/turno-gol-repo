'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql as dsql } from 'drizzle-orm'
import { requireAdminStaffAction, requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import {
  createCourt,
  updateCourt,
  toggleStatus,
  getCourtCountAndLimit,
  validatePricingRulesCoverage,
  getCourtById,
  appendCourtPhoto,
  removeCourtPhoto,
  reorderCourtPhotos,
} from '@/modules/courts/court.service'
import { createCourtSchema, updateCourtSchema } from '@/modules/courts/court.schema'
import { bookings, abonados } from '@/shared/db/schema'

export type CourtActionResult =
  | { success: true; courtId?: string }
  | { success: false; error: string }

// Checkbox/flag → boolean | undefined (ausente = undefined, usa default del schema).
function formBool(v: FormDataEntryValue | null): boolean | undefined {
  if (v == null) return undefined
  return v === 'true' || v === 'on' || v === '1'
}

// Crear cancha (nombre/precio/formato) es Configuración: solo admin
// (audit_report.md 3-18).
export async function createCourtAction(formData: FormData): Promise<CourtActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const pricingRaw = formData.get('pricing')
  let pricingParsed: unknown
  try {
    pricingParsed = JSON.parse(typeof pricingRaw === 'string' ? pricingRaw : '{}')
  } catch {
    return { success: false, error: 'Formato de precios inválido' }
  }

  // Bridge: la UI todavía postea el formato bajo el campo legacy 'capacity'
  // (valores 5/7/8/9/11 = el N del formato). Se interpreta como `format`.
  const formatRaw = formData.get('format') ?? formData.get('capacity')
  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    surfaceType: formData.get('surfaceType'),
    format: Number(formatRaw),
    isCovered: formBool(formData.get('isCovered')),
    hasLighting: formBool(formData.get('hasLighting')),
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

  if (result.success) revalidatePath('/settings/canchas')
  return result
}

// Editar cancha (nombre/precio/formato) es Configuración: solo admin
// (audit_report.md 3-18).
export async function updateCourtAction(
  courtId: string,
  formData: FormData,
): Promise<CourtActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const pricingRaw = formData.get('pricing')
  let pricingParsed: unknown
  try {
    pricingParsed = pricingRaw ? JSON.parse(pricingRaw as string) : undefined
  } catch {
    return { success: false, error: 'Formato de precios inválido' }
  }

  const formatRaw = formData.get('format') ?? formData.get('capacity')
  const raw = {
    name: formData.get('name') ?? undefined,
    description: formData.get('description') ?? undefined,
    surfaceType: formData.get('surfaceType') ?? undefined,
    format: formatRaw != null ? Number(formatRaw) : undefined,
    isCovered: formBool(formData.get('isCovered')),
    hasLighting: formBool(formData.get('hasLighting')),
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
    const court = await updateCourt(courtId, tenant.id, parsed.data, tx)
    if (!court) return { success: false as const, error: 'Cancha no encontrada' }
    return { success: true as const, courtId: court.id }
  })

  if (result.success) revalidatePath('/settings/canchas')
  return result
}

// Activar/desactivar (lluvia, mantenimiento) es operativo: admin + manager
// (audit_report.md 3-18, decisión revisada 2026-07-01).
export async function toggleCourtStatusAction(
  courtId: string,
  status: 'online' | 'offline',
): Promise<CourtActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const court = await toggleStatus(courtId, tenant.id, status, tx)
    if (!court) return { success: false as const, error: 'Cancha no encontrada' }
    return { success: true as const, courtId: court.id }
  })

  if (result.success) revalidatePath('/settings/canchas')
  return result
}

export type CourtDeactivationImpactResult =
  | { success: true; futureBookings: number; activeAbonados: number }
  | { success: false; error: string }

// Preview del impacto de desactivar: mismo nivel que el toggle que dispara.
export async function getCourtDeactivationImpactAction(
  courtId: string,
): Promise<CourtDeactivationImpactResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

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
          eq(bookings.tenantId, tenant.id),
          eq(bookings.courtId, courtId),
          dsql`${bookings.date} >= ${dateStr}::date`,
          inArray(bookings.status, ['confirmed', 'pending_payment']),
        ),
      )
    const [a] = await tx
      .select({ n: dsql<number>`count(*)::int` })
      .from(abonados)
      .where(and(eq(abonados.tenantId, tenant.id), eq(abonados.courtId, courtId), eq(abonados.status, 'active')))
    return {
      success: true as const,
      futureBookings: b?.n ?? 0,
      activeAbonados: a?.n ?? 0,
    }
  })
}

export type CourtPhotoActionResult =
  | { success: true; photos: string[] }
  | { success: false; error: string }

const MAX_PHOTO_BYTES = 2 * 1024 * 1024

// Fotos de cancha son Configuración (misma cancha = solo admin, ver
// createCourtAction/updateCourtAction arriba).
export async function uploadCourtPhotoAction(
  courtId: string,
  formData: FormData,
): Promise<CourtPhotoActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  // Dynamic import: r2.ts trae @aws-sdk/client-s3, un paquete pesado que solo
  // hace falta acá — cargarlo top-level rompía TAMBIÉN create/update/toggle
  // (mismo módulo 'use server') si el SDK falla al resolver en este entorno.
  const { isR2Configured, putImage, publicUrl } = await import('@/shared/storage/r2')

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — upload deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    return { success: false, error: 'Archivo inválido' }
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { success: false, error: 'La imagen no puede superar 2MB' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `${tenant.id}/courts/${courtId}/${crypto.randomUUID()}.webp`

  try {
    await putImage(key, bytes, 'image/webp')
  } catch {
    return { success: false, error: 'No se pudo subir la imagen' }
  }

  const url = publicUrl(key)

  try {
    const photos = await withTenantContext(tenant.id, (tx) =>
      appendCourtPhoto(courtId, tenant.id, url, tx),
    )
    if (photos === null) return { success: false, error: 'Cancha no encontrada' }
    revalidatePath('/settings/canchas')
    revalidatePath(`/${tenant.slug}`)
    return { success: true, photos }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'No se pudo guardar la foto' }
  }
}

export async function removeCourtPhotoAction(
  courtId: string,
  url: string,
): Promise<CourtPhotoActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const { isR2Configured, keyFromPublicUrl, deleteImage } = await import('@/shared/storage/r2')

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — borrado deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const key = keyFromPublicUrl(url)
  if (!key || !key.startsWith(`${tenant.id}/`)) {
    return { success: false, error: 'Imagen inválida' }
  }

  const photos = await withTenantContext(tenant.id, async (tx) => {
    const court = await getCourtById(courtId, tenant.id, tx)
    if (!court) return null
    // La key ya pasó el chequeo de prefijo tenant.id, pero eso no alcanza:
    // podría ser una URL válida de OTRO recurso del mismo tenant (ej. logo).
    // Solo se borra si de verdad está en las fotos de ESTA cancha.
    if (!court.photos.includes(url)) return 'NOT_OWNED' as const
    return removeCourtPhoto(courtId, tenant.id, url, tx)
  })
  if (photos === null) return { success: false, error: 'Cancha no encontrada' }
  if (photos === 'NOT_OWNED') return { success: false, error: 'Imagen inválida' }

  await deleteImage(key)

  revalidatePath('/settings/canchas')
  revalidatePath(`/${tenant.slug}`)
  return { success: true, photos }
}

export async function reorderCourtPhotosAction(
  courtId: string,
  urls: string[],
): Promise<CourtPhotoActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    const photos = await withTenantContext(tenant.id, (tx) =>
      reorderCourtPhotos(courtId, tenant.id, urls, tx),
    )
    if (photos === null) return { success: false, error: 'Cancha no encontrada' }
    revalidatePath('/settings/canchas')
    revalidatePath(`/${tenant.slug}`)
    return { success: true, photos }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'No se pudo reordenar' }
  }
}
