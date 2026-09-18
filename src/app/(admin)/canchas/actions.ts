'use server'

import { revalidatePath } from 'next/cache'
import { revalidatePublicListings } from '@/shared/cache/public-listings'
import { and, eq, inArray, sql as dsql } from 'drizzle-orm'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import {
  createCourt,
  updateCourt,
  toggleStatus,
  getCourtCountAndBilled,
  validatePricingRulesCoverage,
  getCourtById,
  appendCourtPhoto,
  removeCourtPhoto,
  reorderCourtPhotos,
} from '@/modules/courts/court.service'
import { CourtPhotoLimitError, CourtPhotoOrderMismatchError } from '@/modules/courts/court.errors'
import { createCourtSchema, updateCourtSchema } from '@/modules/courts/court.schema'
import { bookings, abonados } from '@/shared/db/schema'
import { captureException, captureMessage } from '@/lib/sentry'
import type { DbTx } from '@/shared/db/client'
import {
  changeBilledCourts,
  loadActivePlan,
  pricingParamsOf,
} from '@/modules/billing/billing.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { monthlyListAmount } from '@/modules/billing/pricing'
import { billingChangeMessage, type BillingChangePreview } from './billing-copy'

export type CourtActionResult =
  | { success: true; courtId?: string }
  | {
      success: false
      error: string
      /**
       * Presente = la operación NO falló: está frenada esperando que el dueño
       * confirme que su cuota sube. Se reintenta la MISMA llamada con
       * `confirmBillingChange = true`.
       */
      requiresBillingConfirmation?: BillingChangePreview
    }

/**
 * Marca interna para el fallo al mover `billed_courts`.
 *
 * Se tira ADENTRO de la transacción para que el rollback se lleve puesta la
 * cancha recién creada o prendida: si no, quedaría una cancha operando que
 * nadie factura, que es exactamente el agujero que este gate existe para
 * tapar. Se atrapa afuera, donde ya no hay nada que deshacer y lo único que
 * falta es devolver un error legible en vez de un 500.
 */
class BilledCourtsSyncFailed extends Error {
  constructor(public readonly reason: unknown) {
    super('No se pudo actualizar la facturación')
    this.name = 'BilledCourtsSyncFailed'
  }
}

const BILLING_SYNC_ERROR =
  'No pudimos actualizar tu facturación, así que no guardamos el cambio. Probá de nuevo en un momento.'

/**
 * ¿Esta operación deja más canchas prendidas de las que se facturan?
 *
 * El gate de canchas nunca estuvo para limitar canchas: estaba para que nadie
 * operara de más pagando de menos (ver el comentario de `toggleStatus` abajo).
 * Con precio por cancha deja de bloquear y pasa a AVISAR, pero sigue siendo el
 * mismo candado: sin él, prender la 4ª, 5ª y 6ª cancha no mueve
 * `billed_courts` y el complejo se cobra de menos para siempre.
 *
 * `null` = no hay nada que confirmar (no sube la cuenta, o no hay suscripción
 * en un estado donde mover el cobro signifique algo).
 */
async function billingPreviewFor(
  billed: { billedCourts: number | null; isTrialing: boolean },
  nextOnlineCourts: number,
  tx: DbTx,
): Promise<BillingChangePreview | null> {
  if (billed.billedCourts === null || nextOnlineCourts <= billed.billedCourts) return null
  // Los montos salen del motor de precio, no de una cuenta a mano acá: la
  // pantalla y el cobro no pueden divergir.
  const params = pricingParamsOf(await loadActivePlan(tx))
  return {
    currentBilledCourts: billed.billedCourts,
    nextBilledCourts: nextOnlineCourts,
    currentMonthlyCents: monthlyListAmount(billed.billedCourts, params),
    nextMonthlyCents: monthlyListAmount(nextOnlineCourts, params),
    isTrialing: billed.isTrialing,
  }
}

/**
 * Agenda (o aplica, si está en prueba) la suba de la cuota. Con la suscripción
 * activa esto NO cobra nada: deja el cambio pendiente para
 * `current_period_end` y lo aplica el sweep diario. Decisión 2026-09-17 P4:
 * sumar o sacar una cancha nunca se cobra prorrateado.
 */
async function syncBilledCourts(
  tenantId: string,
  targetBilledCourts: number,
  tx: DbTx,
): Promise<void> {
  try {
    await changeBilledCourts(tenantId, targetBilledCourts, getBillingGateway(), tx)
  } catch (err) {
    throw new BilledCourtsSyncFailed(err)
  }
}

/** Traduce el rollback por facturación a un error legible; el resto se propaga. */
function billingSyncResult(err: unknown): CourtActionResult {
  if (err instanceof BilledCourtsSyncFailed) {
    captureException(err.reason)
    return { success: false, error: BILLING_SYNC_ERROR }
  }
  throw err
}

// Checkbox/flag → boolean | undefined (ausente = undefined, usa default del schema).
function formBool(v: FormDataEntryValue | null): boolean | undefined {
  if (v == null) return undefined
  return v === 'true' || v === 'on' || v === '1'
}

// Crear cancha (nombre/precio/formato) es Configuración: solo admin
// (audit_report.md 3-18).
export async function createCourtAction(
  formData: FormData,
  confirmBillingChange = false,
): Promise<CourtActionResult> {
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

  const coverage = validatePricingRulesCoverage(
    parsed.data.pricing.rules,
    tenant.openingHours,
    tenant.closesNextDay,
  )
  if (!coverage.valid) {
    const sample = coverage.gaps
      .slice(0, 3)
      .map((g) => `${g.day} ${g.time}`)
      .join(', ')
    // Regla de negocio funcionando, no una excepción — pero sin esto queda
    // invisible: un complejo real quedó trabado sin poder cargar canchas y
    // sólo se supo por WhatsApp (docs/gtm/ejecucion/10-aprendizajes.md).
    captureMessage('crear cancha: cobertura de precios incompleta', {
      level: 'warning',
      extra: { tenantId: tenant.id, gapsCount: coverage.gaps.length, sample },
    })
    return { success: false, error: `Precios sin cubrir: ${sample}` }
  }

  const result = await withTenantContext(tenant.id, async (tx): Promise<CourtActionResult> => {
    const billed = await getCourtCountAndBilled(tenant.id, tx)
    // Una cancha nace `online` (default de la tabla), así que suma a la cuenta
    // facturable desde el minuto cero.
    const nextOnlineCourts = billed.onlineCourts + 1
    const preview = await billingPreviewFor(billed, nextOnlineCourts, tx)

    if (preview && !confirmBillingChange) {
      return {
        success: false,
        error: billingChangeMessage(preview),
        requiresBillingConfirmation: preview,
      }
    }

    const court = await createCourt(tenant.id, parsed.data, tx)
    if (preview) await syncBilledCourts(tenant.id, nextOnlineCourts, tx)
    return { success: true, courtId: court.id }
  }).catch(billingSyncResult)

  if (result.success) revalidatePath('/canchas')
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
    const coverage = validatePricingRulesCoverage(
      parsed.data.pricing.rules,
      tenant.openingHours,
      tenant.closesNextDay,
    )
    if (!coverage.valid) {
      const sample = coverage.gaps
        .slice(0, 3)
        .map((g) => `${g.day} ${g.time}`)
        .join(', ')
      // Ver comentario en createCourtAction: sin esto el bloqueo es mudo.
      captureMessage('editar cancha: cobertura de precios incompleta', {
        level: 'warning',
        extra: { tenantId: tenant.id, courtId, gapsCount: coverage.gaps.length, sample },
      })
      return { success: false, error: `Precios sin cubrir: ${sample}` }
    }
  }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const court = await updateCourt(courtId, tenant.id, parsed.data, tx)
    if (!court) return { success: false as const, error: 'Cancha no encontrada' }
    return { success: true as const, courtId: court.id }
  })

  if (result.success) revalidatePath('/canchas')
  return result
}

// Activar/desactivar (lluvia, mantenimiento) es operativo: admin + manager
// (audit_report.md 3-18, decisión revisada 2026-07-01).
export async function toggleCourtStatusAction(
  courtId: string,
  status: 'online' | 'offline',
  confirmBillingChange = false,
): Promise<CourtActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx): Promise<CourtActionResult> => {
    // Prender una cancha suma a la cuenta facturable igual que crearla, así que
    // pasa por el mismo aviso. Sin esto el cambio de cuota se esquiva en dos
    // pasos: apagar canchas, bajar por cuántas se factura (que cuenta solo las
    // activas) y volver a prenderlas — operando de más y pagando de menos.
    // Desde el precio por cancha ya NO bloquea: avisa el monto nuevo y, al
    // confirmar, agenda la suba.
    if (status === 'online') {
      const current = await getCourtById(courtId, tenant.id, tx)
      if (!current) return { success: false, error: 'Cancha no encontrada' }

      // Re-prender una cancha que ya está online no mueve la cuenta: sin este
      // corte, un doble click cobraría una cancha de más.
      if (current.status !== 'online') {
        const billed = await getCourtCountAndBilled(tenant.id, tx)
        const nextOnlineCourts = billed.onlineCourts + 1
        const preview = await billingPreviewFor(billed, nextOnlineCourts, tx)

        if (preview && !confirmBillingChange) {
          return {
            success: false,
            error: billingChangeMessage(preview),
            requiresBillingConfirmation: preview,
          }
        }

        const court = await toggleStatus(courtId, tenant.id, status, tx)
        if (!court) return { success: false, error: 'Cancha no encontrada' }
        if (preview) await syncBilledCourts(tenant.id, nextOnlineCourts, tx)
        return { success: true, courtId: court.id }
      }
    }

    // Apagar una cancha NO baja la cuota sola: bajarla es una acción
    // deliberada del dueño en Facturación. Si fuera automático, alcanzaría
    // con apagar canchas unos días para pagar menos (decisión 2026-09-17, P3).
    const court = await toggleStatus(courtId, tenant.id, status, tx)
    if (!court) return { success: false, error: 'Cancha no encontrada' }
    return { success: true, courtId: court.id }
  }).catch(billingSyncResult)

  if (result.success) revalidatePath('/canchas')
  return result
}

export type CourtDeactivationImpactResult =
  | { success: true; futureBookings: number; activeAbonados: number }
  | { success: false; error: string }

// Preview del impacto de desactivar: mismo nivel que el toggle que dispara.
export async function getCourtDeactivationImpactAction(
  courtId: string,
): Promise<CourtDeactivationImpactResult> {
  const auth = await requireAdminStaffAction()
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
      .where(
        and(
          eq(abonados.tenantId, tenant.id),
          eq(abonados.courtId, courtId),
          eq(abonados.status, 'active'),
        ),
      )
    return {
      success: true as const,
      futureBookings: b?.n ?? 0,
      activeAbonados: a?.n ?? 0,
    }
  })
}

export type CourtPhotoActionResult =
  { success: true; photos: string[] } | { success: false; error: string }

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
  } catch (err) {
    captureException(err)
    return { success: false, error: 'No pudimos subir la imagen. Probá de nuevo en un momento.' }
  }

  const url = publicUrl(key)

  try {
    const photos = await withTenantContext(tenant.id, (tx) =>
      appendCourtPhoto(courtId, tenant.id, url, tx),
    )
    if (photos === null) return { success: false, error: 'Cancha no encontrada' }
    revalidatePath('/canchas')
    revalidatePath(`/${tenant.slug}`)
    revalidatePublicListings()
    return { success: true, photos }
  } catch (e) {
    if (e instanceof CourtPhotoLimitError) {
      return { success: false, error: e.message }
    }
    captureException(e)
    return { success: false, error: 'No pudimos guardar la foto. Probá de nuevo en un momento.' }
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

  revalidatePath('/canchas')
  revalidatePath(`/${tenant.slug}`)
  revalidatePublicListings()
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
    revalidatePath('/canchas')
    revalidatePath(`/${tenant.slug}`)
    revalidatePublicListings()
    return { success: true, photos }
  } catch (e) {
    if (e instanceof CourtPhotoOrderMismatchError) {
      return { success: false, error: e.message }
    }
    captureException(e)
    return {
      success: false,
      error: 'No pudimos reordenar las fotos. Probá de nuevo en un momento.',
    }
  }
}
