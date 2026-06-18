'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import { uuid } from '@/shared/validation/primitives'
import { requireSystemAdminAction } from '@/modules/auth/system-admin.guards'
import {
  buildImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_MS,
} from '@/modules/auth/impersonation'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { getFirstActiveAdminStaffUserId } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import {
  DowngradeBlockedError,
  InvalidTransitionError,
  PlanNotFoundError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import {
  cancelSubscriptionInputSchema,
  changePlanInputSchema,
  confirmNameMatches,
  extendTrialInputSchema,
  forceStatusInputSchema,
  isDestructiveTargetStatus,
  reactivateInputSchema,
  updateSettingsInputSchema,
} from '@/modules/super-admin/support.schema'
import {
  cancelSubscriptionForSupport,
  changePlanForSupport,
  extendTrial,
  forceTenantStatus,
  PlanAlreadyAssignedError,
  reactivateTenant,
  TenantNotFoundError,
  TrialNotActiveError,
  updateTenantSettingsForSupport,
} from '@/modules/super-admin/support.service'
import { getTenantSummary } from '@/modules/super-admin/tenants.service'

/**
 * Server Actions de soporte del detalle de tenant (panel SuperAdmin).
 *
 * Patrón por action (spec §5):
 *   1. requireSystemAdminAction() — guard + rate limit interno (contrato).
 *   2. zod parse del input.
 *   3. Confirmación tipo GitHub server-side para destructivas.
 *   4. Llamada al support.service (que emite el audit `support.*`).
 *   5. revalidatePath de lista y detalle.
 */

export type SupportActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }

const CONFIRM_MISMATCH =
  'El nombre ingresado no coincide con el nombre exacto del complejo. No se ejecutó la acción.'

function revalidateTenantPaths(tenantId: string): void {
  revalidatePath('/super-admin/tenants')
  revalidatePath(`/super-admin/tenants/${tenantId}`)
}

function mapKnownError(err: unknown): SupportActionResult {
  if (err instanceof InvalidTransitionError) {
    return {
      success: false,
      error: `Transición inválida según el ciclo de vida: de '${err.from}' a '${err.to}'. Puede deberse a una ventana temporal del FSM (dunning/retención) todavía no cumplida.`,
    }
  }
  if (err instanceof SubscriptionNotFoundError) {
    return { success: false, error: 'El complejo no tiene suscripción registrada.' }
  }
  if (err instanceof PlanNotFoundError) {
    return { success: false, error: 'Plan destino inexistente o inactivo.' }
  }
  if (err instanceof DowngradeBlockedError) {
    return {
      success: false,
      error: `El complejo tiene ${err.currentCourtCount} canchas online y el plan destino permite ${err.targetMaxCourts}. Desactivá canchas antes de bajar de plan.`,
    }
  }
  if (err instanceof TenantNotFoundError) {
    return { success: false, error: 'Complejo no encontrado.' }
  }
  if (err instanceof TrialNotActiveError) {
    return {
      success: false,
      error: `Solo se puede extender el trial de un complejo en estado 'trialing' (actual: '${err.status}').`,
    }
  }
  if (err instanceof PlanAlreadyAssignedError) {
    return { success: false, error: 'El complejo ya tiene asignado ese plan.' }
  }
  throw err
}

// ─── Forzar transición de estado ─────────────────────────────────────────────

export async function forceTenantStatusAction(input: unknown): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = forceStatusInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const { tenantId, targetStatus, confirmName } = parsed.data

  const summary = await getTenantSummary(tenantId)
  if (!summary) return { success: false, error: 'Complejo no encontrado.' }

  // Destructivas (blocked / deleted): confirmación escribiendo el nombre exacto.
  if (isDestructiveTargetStatus(targetStatus)) {
    if (!confirmName || !confirmNameMatches(summary.name, confirmName)) {
      return { success: false, error: CONFIRM_MISMATCH }
    }
  }

  try {
    const result = await forceTenantStatus(tenantId, targetStatus, auth.admin.id)
    revalidateTenantPaths(tenantId)
    return {
      success: true,
      message: `Estado forzado: '${result.from}' → '${result.to}'.`,
    }
  } catch (err) {
    return mapKnownError(err)
  }
}

// ─── Reactivar ───────────────────────────────────────────────────────────────

export async function reactivateTenantAction(input: unknown): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = reactivateInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  try {
    const result = await reactivateTenant(parsed.data.tenantId, auth.admin.id)
    revalidateTenantPaths(parsed.data.tenantId)
    return { success: true, message: `Complejo reactivado (estaba '${result.from}').` }
  } catch (err) {
    return mapKnownError(err)
  }
}

// ─── Extender trial ──────────────────────────────────────────────────────────

export async function extendTrialAction(input: unknown): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = extendTrialInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Datos inválidos: días entre 1 y 90.' }
  }

  try {
    const result = await extendTrial(parsed.data.tenantId, parsed.data.days, auth.admin.id)
    revalidateTenantPaths(parsed.data.tenantId)
    return {
      success: true,
      message: `Trial extendido ${parsed.data.days} días (vence ${result.trialEndsAt.toISOString().slice(0, 10)}).`,
    }
  } catch (err) {
    return mapKnownError(err)
  }
}

// ─── Cambiar plan sin cobro ──────────────────────────────────────────────────

export async function changePlanAction(input: unknown): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = changePlanInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  try {
    await changePlanForSupport(
      parsed.data.tenantId,
      parsed.data.targetPlanId,
      auth.admin.id,
      getBillingGateway(),
    )
    revalidateTenantPaths(parsed.data.tenantId)
    return { success: true, message: 'Plan cambiado sin cobro.' }
  } catch (err) {
    return mapKnownError(err)
  }
}

// ─── Cancelar suscripción (destructiva) ──────────────────────────────────────

export async function cancelSubscriptionAction(input: unknown): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = cancelSubscriptionInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Datos inválidos: motivo de 3 a 500 caracteres.' }
  }
  const { tenantId, reason, confirmName } = parsed.data

  const summary = await getTenantSummary(tenantId)
  if (!summary) return { success: false, error: 'Complejo no encontrado.' }
  if (!confirmNameMatches(summary.name, confirmName)) {
    return { success: false, error: CONFIRM_MISMATCH }
  }

  try {
    const result = await cancelSubscriptionForSupport(
      tenantId,
      reason,
      auth.admin.id,
      getBillingGateway(),
    )
    revalidateTenantPaths(tenantId)
    return {
      success: true,
      message: `Suscripción cancelada. Acceso hasta ${result.accessUntil.toISOString().slice(0, 10)}.`,
    }
  } catch (err) {
    return mapKnownError(err)
  }
}

// ─── Editar settings whitelisteados ──────────────────────────────────────────

export async function updateTenantSettingsAction(input: unknown): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = updateSettingsInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Datos inválidos: solo campos whitelisteados de settings.' }
  }

  try {
    await updateTenantSettingsForSupport(
      parsed.data.tenantId,
      parsed.data.patch,
      auth.admin.id,
    )
    revalidateTenantPaths(parsed.data.tenantId)
    return { success: true, message: 'Settings actualizados.' }
  } catch (err) {
    return mapKnownError(err)
  }
}

// ─── Reset de contraseña de staff (spec §7) ──────────────────────────────────

const resetStaffPasswordInputSchema = z.object({
  tenantId: uuid,
  email: z.string().trim().toLowerCase().email(),
})

type AuthUserLite = { id: string; email?: string; app_metadata?: Record<string, unknown> }

/**
 * supabase-js no expone lookup por email: paginamos listUsers de forma acotada
 * (mismo patrón que staff/actions.ts). null si no se ubica.
 */
async function findAuthUserByEmail(
  adminClient: SupabaseClient,
  email: string,
): Promise<AuthUserLite | null> {
  const PER_PAGE = 1000
  const MAX_PAGES = 10
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE })
    const users = data?.users ?? []
    if (error || users.length === 0) return null
    const found = users.find((u) => u.email?.toLowerCase() === email)
    if (found) return found as AuthUserLite
    if (users.length < PER_PAGE) return null
  }
  return null
}

/** Contraseña temporal legible para dictar por teléfono (≥8, sin ambigüedad). */
function generateTempPassword(): string {
  return `TG-${randomBytes(5).toString('hex')}`
}

/**
 * Reset de contraseña de un staff (soporte telefónico). Genera una contraseña
 * temporal + `force_password_change=true`: el titular entra con la temporal y el
 * layout admin lo obliga a cambiarla. Solo aplica a staff (el jugador sigue
 * passwordless). El email debe ser un miembro ACTIVO de este complejo: acota el
 * alcance del panel per-tenant. Audita `support.user.password_reset`.
 */
export async function resetStaffPasswordAction(input: unknown): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = resetStaffPasswordInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const { tenantId, email } = parsed.data

  const summary = await getTenantSummary(tenantId)
  if (!summary) return { success: false, error: 'Complejo no encontrado.' }

  const staffRow = await withTenantContext(tenantId, (tx) =>
    tx
      .select({ staffUserId: staffUsers.id })
      .from(tenantStaffMembers)
      .innerJoin(staffUsers, eq(staffUsers.id, tenantStaffMembers.staffUserId))
      .where(
        and(
          eq(tenantStaffMembers.tenantId, tenantId),
          eq(tenantStaffMembers.isActive, true),
          eq(staffUsers.email, email),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null),
  )
  if (!staffRow) {
    return { success: false, error: 'Ese email no es un miembro activo del complejo.' }
  }

  const adminClient = createAdminClient()
  const authUser = await findAuthUserByEmail(adminClient, email)
  if (!authUser) {
    return { success: false, error: 'No se encontró la cuenta de acceso para ese email.' }
  }

  const temp = generateTempPassword()
  const meta = authUser.app_metadata ?? {}
  const { error } = await adminClient.auth.admin.updateUserById(authUser.id, {
    password: temp,
    app_metadata: { ...meta, force_password_change: true },
  })
  if (error) {
    return { success: false, error: 'No se pudo resetear la contraseña. Probá de nuevo.' }
  }

  try {
    await withTenantContext(tenantId, (tx) =>
      insertAuditLog(tx, {
        tenantId,
        actorId: auth.admin.id,
        actorType: 'system',
        action: 'support.user.password_reset',
        resourceType: 'staff_user',
        resourceId: staffRow.staffUserId,
        metadata: { staff_email: email, system_admin_email: auth.admin.email },
      }),
    )
  } catch (err) {
    return mapKnownError(err)
  }

  revalidateTenantPaths(tenantId)
  return {
    success: true,
    message: `Contraseña temporal: ${temp} — dictásela al titular. Deberá cambiarla al entrar.`,
  }
}

// ─── Impersonación (spec §6) ─────────────────────────────────────────────────

/**
 * "Entrar como este complejo": emite la cookie firmada `tg_sa_impersonate` y
 * redirige al panel del admin (/dashboard). El JWT real NO se toca — el bypass
 * vive en los guards del admin, que leen esta cookie. Audita
 * `support.impersonation.started` con actor_type='system'.
 */
export async function startImpersonationAction(
  tenantId: string,
): Promise<SupportActionResult> {
  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = uuid.safeParse(tenantId)
  if (!parsed.success) return { success: false, error: 'Tenant inválido.' }
  const id = parsed.data

  const summary = await getTenantSummary(id)
  if (!summary) return { success: false, error: 'Complejo no encontrado.' }

  // Pre-check: el tenant debe tener un admin activo para delegar los FKs a
  // staff_users.id durante la impersonación. Falla limpio acá antes de emitir
  // la cookie (si no, /dashboard tiraría NoActiveAdminToProxyError al renderizar).
  const proxyAdmin = await getFirstActiveAdminStaffUserId(id)
  if (!proxyAdmin) {
    return {
      success: false,
      error: 'El complejo no tiene un administrador activo: no se puede impersonar.',
    }
  }

  try {
    await withTenantContext(id, (tx) =>
      insertAuditLog(tx, {
        tenantId: id,
        actorId: auth.admin.id,
        actorType: 'system',
        action: 'support.impersonation.started',
        resourceType: 'tenant',
        resourceId: id,
        metadata: {
          impersonated_tenant_id: id,
          system_admin_email: auth.admin.email,
        },
      }),
    )
  } catch (err) {
    return mapKnownError(err)
  }

  const cookieValue = buildImpersonationCookie({ tenantId: id, systemAdminId: auth.admin.id })
  cookies().set({
    name: IMPERSONATION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.floor(IMPERSONATION_TTL_MS / 1000),
    path: '/',
  })

  // redirect() lanza NEXT_REDIRECT — debe quedar fuera del try.
  redirect('/dashboard')
}

/**
 * "Salir de impersonación": audita `support.impersonation.ended` (con la cookie
 * todavía presente, para que el forzado de actor también la etiquete), borra la
 * cookie y devuelve al detalle del tenant. No requiere requireSystemAdminAction:
 * getImpersonationSession ya exige que el usuario sea el system_admin emisor.
 *
 * Retorna void (siempre redirige): así se puede usar directo como `action` de un
 * <form> en el banner, cuyo tipo exige `() => void | Promise<void>`.
 */
export async function stopImpersonationAction(): Promise<void> {
  const session = await getImpersonationSession()

  if (session) {
    try {
      await withTenantContext(session.tenantId, (tx) =>
        insertAuditLog(tx, {
          tenantId: session.tenantId,
          actorId: session.systemAdminId,
          actorType: 'system',
          action: 'support.impersonation.ended',
          resourceType: 'tenant',
          resourceId: session.tenantId,
          metadata: { impersonated_tenant_id: session.tenantId },
        }),
      )
    } catch {
      // Best-effort: un fallo de audit no debe atrapar al super admin dentro de
      // la sesión impersonada. La cookie se borra igual.
    }
  }

  cookies().delete(IMPERSONATION_COOKIE_NAME)
  redirect(session ? `/super-admin/tenants/${session.tenantId}` : '/super-admin')
}
