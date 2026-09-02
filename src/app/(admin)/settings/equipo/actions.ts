'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import {
  BLOCKED_TENANT_STATUSES,
  READ_ONLY_TENANT_STATUSES,
} from '@/modules/tenants/tenant.lifecycle'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import { DEFAULT_INVITE_ROLE, STAFF_ROLES } from '@/modules/staff/roles'
import { isStaffMemberOfTenant, upsertStaffUser } from '@/modules/staff/staff.service'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/sentry'

type AuthUserLite = { id: string; email?: string; app_metadata?: Record<string, unknown> }

/**
 * Hallazgo 03-invite-staff-rollback: el envío real de la invitación
 * (inviteUserByEmail) corre DENTRO de la misma transacción que el upsert de
 * `tenant_staff_members`. `withTenantContext` (src/shared/db/client.ts) solo
 * hace rollback si el callback LANZA — un `return` de valor de negocio
 * comitea igual. Clase propia (en vez de un `return {success:false}` desde
 * adentro del callback) para que el fallo de entrega SÍ dispare el rollback
 * del alta de staff, y se capture afuera de `withTenantContext` para
 * devolver el mismo StaffActionResult al usuario.
 */
class InviteDeliveryError extends Error {
  name = 'InviteDeliveryError'
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

/**
 * GoTrue no distingue "SMTP caído" con un código propio (ver ErrorCode en
 * @supabase/auth-js/lib/error-codes.ts): esos fallos llegan como
 * unexpected_failure o sin código. Solo el rate limit de envío de email es
 * distinguible por .code, así que es el único caso con mensaje propio — el
 * resto (SMTP incluido) cae en el mensaje fijo.
 */
const INVITE_RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit'])

function mapInviteDeliveryError(code: string | undefined): string {
  if (code && INVITE_RATE_LIMIT_CODES.has(code)) {
    return 'Se enviaron demasiadas invitaciones en poco tiempo. Esperá unos minutos y volvé a intentar.'
  }
  return 'No pudimos enviar la invitación por email. Verificá que el email esté bien escrito y probá de nuevo en unos minutos.'
}

/**
 * Busca un auth user por email. supabase-js no expone lookup por email, así que
 * paginamos listUsers de forma acotada. Best-effort: si no se ubica, el callback
 * de login sincroniza staff_user_id igual (#47).
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

export type StaffActionResult = { success: true } | { success: false; error: string }

/**
 * Estados de tenant que bloquean la gestión de staff (Fase 3 #14).
 *
 * Fix 4 (M7, ENS-26): este archivo NO pasa por `requireAdminStaffAction` /
 * `requireOperatorStaff` (los guards centrales de M5) — tiene su propio
 * guard de sesión (`requireStaffTenant`) y de rol (`assertActorIsAdmin`,
 * dentro de la tx). Este chequeo de tenant lifecycle es, por lo tanto, el
 * ÚNICO punto que lo cubre acá — NO es redundante con el guard central
 * (nunca se invoca en este archivo), así que no se elimina. Lo que sí se
 * alinea es la FUENTE: antes era una 3ra copia local (`STAFF_WRITE_BLOCKED_
 * STATUSES` hardcodeada) que además incluía `canceled` — contradiciendo
 * ENS-26 (`canceled` = acceso completo hasta `current_period_end`, ya
 * pagó; el sweep recién lo pasa a `blocked` al vencer, doc4 §2 /
 * tenant.lifecycle.ts). Ahora deriva de `BLOCKED_TENANT_STATUSES` +
 * `READ_ONLY_TENANT_STATUSES` (tenant.lifecycle.ts), la misma fuente única que
 * ya usa `guards.ts` (`BLOCKED_STAFF_TENANT_STATUSES`) — `canceled` deja de
 * bloquear la gestión de equipo.
 */
const STAFF_WRITE_BLOCKED_STATUSES: ReadonlySet<string> = new Set([
  ...BLOCKED_TENANT_STATUSES,
  ...READ_ONLY_TENANT_STATUSES,
])

/**
 * Guard server-side compartido para mutaciones de staff (Fase 3 #14):
 * bloquea tenants en estado no operativo (suspended/blocked/churned/
 * deleted — ver STAFF_WRITE_BLOCKED_STATUSES arriba), que getStaffTenant no
 * filtra. La autorización por rol (solo admin) la aplica assertActorIsAdmin
 * dentro de la transacción.
 * Devuelve un StaffActionResult de error, o null si la mutacion puede continuar.
 */
async function guardStaffMutation(tenant: {
  status: string
}): Promise<{ success: false; error: string } | null> {
  if (STAFF_WRITE_BLOCKED_STATUSES.has(tenant.status)) {
    return { success: false, error: 'El complejo no está activo.' }
  }
  return null
}

const inviteSchema = z.object({
  email: z.email('Email inválido'),
  firstName: z.string().min(1, 'Nombre requerido').max(100, 'Máximo 100 caracteres'),
  lastName: z.string().min(1, 'Apellido requerido').max(100, 'Máximo 100 caracteres'),
  // El default Encargado se aplica acá (capa de aplicación); el DEFAULT de la
  // columna sigue siendo 'admin' por retrocompatibilidad (migración 026).
  role: z.enum(STAFF_ROLES, { error: 'Rol inválido' }).default(DEFAULT_INVITE_ROLE),
})

async function requireStaffTenant() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  // Spread para fijar staffUserId como string: el narrowing del if se pierde
  // dentro de los callbacks de withTenantContext.
  return { user: { ...user, staffUserId: user.staffUserId }, tenant }
}

const ADMIN_ONLY_ERROR = 'Solo un administrador puede gestionar el equipo.'

/**
 * Gestionar el equipo es zona de configuración: solo 'admin' (roles 026).
 * Se lee de la DB dentro de la misma transacción de la mutación — el claim
 * `role` del JWT queda viejo si el rol cambió después del login.
 * Devuelve un StaffActionResult de error, o null si el actor puede mutar.
 */
async function assertActorIsAdmin(
  tx: DbTx,
  tenantId: string,
  actorStaffUserId: string,
): Promise<{ success: false; error: string } | null> {
  const [actor] = await tx
    .select({ role: tenantStaffMembers.role })
    .from(tenantStaffMembers)
    .where(
      and(
        eq(tenantStaffMembers.tenantId, tenantId),
        eq(tenantStaffMembers.staffUserId, actorStaffUserId),
        eq(tenantStaffMembers.isActive, true),
      ),
    )
    .limit(1)

  if (actor?.role !== 'admin') return { success: false, error: ADMIN_ONLY_ERROR }
  return null
}

export async function inviteStaffAction(formData: FormData): Promise<StaffActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const guard = await guardStaffMutation(tenant)
  if (guard) return guard

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    // FormData.get devuelve null si falta el campo; el default de zod solo
    // aplica sobre undefined.
    role: formData.get('role') ?? undefined,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const { email, firstName, lastName, role } = parsed.data
  const lowerEmail = email.toLowerCase()

  // Fase 1 (pool de tenant, RLS aplica): autorización + chequeo de duplicado.
  // Sin escrituras todavía: staff_users es global y su INSERT/UPDATE no tiene
  // policy para el rol app (006_rls_policies.sql, "gestión vía service role"),
  // así que el upsert se resuelve en la Fase 2 vía worker pool.
  const preflight = await withTenantContext(tenant.id, async (tx) => {
    const denied = await assertActorIsAdmin(tx, tenant.id, user.staffUserId)
    if (denied) return denied

    const existing = await tx
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .innerJoin(tenantStaffMembers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
      .where(
        and(
          eq(staffUsers.email, lowerEmail),
          eq(tenantStaffMembers.tenantId, tenant.id),
          eq(tenantStaffMembers.isActive, true),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return { success: false as const, error: 'Este email ya es miembro activo del complejo.' }
    }
    return { success: true as const }
  })
  if (!preflight.success) return preflight

  // Fase 2 (worker pool, bypass RLS): upsert del staff_user global. El actor ya
  // fue validado como admin en la Fase 1, antes de esta escritura.
  let staffUser: Awaited<ReturnType<typeof upsertStaffUser>>
  try {
    staffUser = await upsertStaffUser(lowerEmail, firstName, lastName)
  } catch (err) {
    captureException(err)
    return {
      success: false,
      error: 'No pudimos crear el usuario. Volvé a intentar en un momento.',
    }
  }

  // Fase 3 (pool de tenant): vincula al tenant (con policies propias) + invita.
  // Si el envío de la invitación falla, se lanza InviteDeliveryError (en vez
  // de un `return` de negocio) para que Drizzle haga rollback del upsert de
  // tenant_staff_members — ver comentario del hallazgo en InviteDeliveryError.
  let result: { success: true } | { success: false; error: string }
  try {
    result = await withTenantContext(tenant.id, async (tx) => {
      await tx
        .insert(tenantStaffMembers)
        .values({
          tenantId: tenant.id,
          staffUserId: staffUser.id,
          role,
          addedBy: user.staffUserId,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [tenantStaffMembers.tenantId, tenantStaffMembers.staffUserId],
          // Re-invitar a un miembro inactivo lo reactiva con el rol recién elegido.
          set: { isActive: true, role, addedBy: user.staffUserId },
        })

      const adminClient = createAdminClient()
      const { data: inviteData, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(lowerEmail, {
          // Mismo patrón token_hash que signup/recovery/magic-link (ADR-002):
          // el link tiene que apuntar a /api/auth/callback, no directo a
          // /dashboard — invite.html arma `{{ .RedirectTo }}&token_hash=...`.
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent('/dashboard')}`,
        })

      if (inviteError && !inviteError.message.includes('already been registered')) {
        throw new InviteDeliveryError(inviteError.message, inviteError.code)
      }

      if (inviteData?.user?.id) {
        // Usuario nuevo en auth: solo pertenece a este complejo, claim completo.
        // force_password_change: el invite de GoTrue crea el usuario SIN
        // contraseña — sin este flag entra directo a /dashboard y queda sin
        // forma de volver a loguearse una vez que cierra sesión.
        await adminClient.auth.admin.updateUserById(inviteData.user.id, {
          app_metadata: {
            staff_user_id: staffUser.id,
            tenant_id: tenant.id,
            role,
            force_password_change: true,
          },
        })
      } else if (inviteError) {
        // 'already been registered': el usuario ya existe en auth (p. ej. admin de
        // otro complejo). inviteUserByEmail no devuelve su id, así que lo buscamos y
        // sincronizamos SOLO staff_user_id, preservando su tenant_id/role actuales
        // para no pisar la sesión de otros complejos (#47).
        const existingAuth = await findAuthUserByEmail(adminClient, lowerEmail)
        if (existingAuth) {
          await adminClient.auth.admin.updateUserById(existingAuth.id, {
            app_metadata: { ...(existingAuth.app_metadata ?? {}), staff_user_id: staffUser.id },
          })
        }
      }

      return { success: true as const }
    })
  } catch (err) {
    if (err instanceof InviteDeliveryError) {
      captureException(err)
      return { success: false, error: mapInviteDeliveryError(err.code) }
    }
    throw err
  }

  if (result.success) revalidatePath('/settings/equipo')
  return result
}

export async function deactivateStaffAction(staffMemberId: string): Promise<StaffActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const guard = await guardStaffMutation(tenant)
  if (guard) return guard

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const denied = await assertActorIsAdmin(tx, tenant.id, user.staffUserId)
    if (denied) return denied

    const [target] = await tx
      .select({ role: tenantStaffMembers.role })
      .from(tenantStaffMembers)
      .where(
        and(eq(tenantStaffMembers.id, staffMemberId), eq(tenantStaffMembers.tenantId, tenant.id)),
      )
      .limit(1)

    if (!target) return { success: false as const, error: 'Miembro no encontrado.' }

    // Lockout (roles 026): con roles, lo que no puede quedar en cero son los
    // ADMINS activos, no los miembros. Un complejo solo con encargados no
    // tendría quién entre a configuración.
    //
    // FOR UPDATE (security scan F18): sin lock, dos deactivateStaffAction
    // concurrentes (cada uno apuntando a un admin DISTINTO) pueden leer el
    // mismo count=2 antes de que cualquiera commitee, y los dos pasan el
    // chequeo <=1 — el tenant queda con cero admins activos. Al lockear las
    // filas de admin activo, la segunda transacción bloquea hasta que la
    // primera commitea y, al despertar, Postgres re-evalúa el WHERE contra la
    // fila ya actualizada (isActive=false) — el count baja a 1 y la segunda
    // desactivación se rechaza correctamente. Postgres no permite FOR UPDATE
    // junto con una función de agregación (count()), así que se traen las
    // filas y se cuenta en JS.
    if (target.role === 'admin') {
      const activeAdmins = await tx
        .select({ id: tenantStaffMembers.id })
        .from(tenantStaffMembers)
        .where(
          and(
            eq(tenantStaffMembers.tenantId, tenant.id),
            eq(tenantStaffMembers.isActive, true),
            eq(tenantStaffMembers.role, 'admin'),
          ),
        )
        .for('update')

      if (activeAdmins.length <= 1) {
        return {
          success: false as const,
          error: 'El complejo debe tener al menos un administrador activo.',
        }
      }
    }

    const [updated] = await tx
      .update(tenantStaffMembers)
      .set({ isActive: false })
      .where(
        and(eq(tenantStaffMembers.id, staffMemberId), eq(tenantStaffMembers.tenantId, tenant.id)),
      )
      .returning({ id: tenantStaffMembers.id })

    if (!updated) return { success: false as const, error: 'Miembro no encontrado.' }
    return { success: true as const }
  })

  if (result.success) revalidatePath('/settings/equipo')
  return result
}

const updateRoleSchema = z.enum(STAFF_ROLES, { error: 'Rol inválido' })

export async function updateStaffRoleAction(
  staffMemberId: string,
  role: string,
): Promise<StaffActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const guard = await guardStaffMutation(tenant)
  if (guard) return guard

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsedRole = updateRoleSchema.safeParse(role)
  if (!parsedRole.success) {
    return { success: false, error: parsedRole.error.issues[0]?.message ?? 'Rol inválido' }
  }
  const newRole = parsedRole.data

  const result = await withTenantContext(tenant.id, async (tx) => {
    const denied = await assertActorIsAdmin(tx, tenant.id, user.staffUserId)
    if (denied) return denied

    const [target] = await tx
      .select({ staffUserId: tenantStaffMembers.staffUserId })
      .from(tenantStaffMembers)
      .where(
        and(eq(tenantStaffMembers.id, staffMemberId), eq(tenantStaffMembers.tenantId, tenant.id)),
      )
      .limit(1)

    if (!target) return { success: false as const, error: 'Miembro no encontrado.' }

    // Protección lockout: nadie se cambia su propio rol. Degradarse a sí mismo
    // podría dejar al complejo sin ningún admin con acceso a configuración.
    if (target.staffUserId === user.staffUserId) {
      return { success: false as const, error: 'No podés cambiar tu propio rol.' }
    }

    await tx
      .update(tenantStaffMembers)
      .set({ role: newRole })
      .where(
        and(eq(tenantStaffMembers.id, staffMemberId), eq(tenantStaffMembers.tenantId, tenant.id)),
      )

    return { success: true as const }
  })

  if (result.success) revalidatePath('/settings/equipo')
  return result
}

export async function resendInviteAction(email: string): Promise<StaffActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const guard = await guardStaffMutation(tenant)
  if (guard) return guard

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // Fase 3 #12: el email no debe ser arbitrario; tiene que pertenecer a un
  // miembro (activo O inactivo) del tenant actual antes de disparar
  // inviteUserByEmail. El único punto de entrada de esta acción en la UI
  // (StaffActions.tsx) es justamente el miembro YA desactivado — el ítem
  // "Reenviar invitación" solo se renderiza cuando !member.isActive — así
  // que acotar a is_active=true dejaba esto en 0 resultados siempre.
  const parsedEmail = z.email().safeParse(email)
  if (!parsedEmail.success) return { success: false, error: 'Email inválido.' }
  const normalizedEmail = parsedEmail.data.toLowerCase()

  // Fase 1 (pool de tenant, RLS aplica): solo autorización del actor.
  const denied = await withTenantContext(tenant.id, (tx) =>
    assertActorIsAdmin(tx, tenant.id, user.staffUserId),
  )
  if (denied) return denied

  // Fase 2 (worker pool, bypass RLS): staff_users es global y su policy de
  // SELECT (006_rls_policies.sql) solo expone miembros is_active=true, así
  // que esta lectura necesita el mismo bypass que listStaffRoster.
  const isMember = await isStaffMemberOfTenant(tenant.id, normalizedEmail)
  if (!isMember) {
    return { success: false, error: 'Este email no es miembro del complejo.' }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent('/dashboard')}`,
  })

  if (error) {
    captureException(error)
    return {
      success: false,
      error: 'No pudimos reenviar la invitación. Probá de nuevo en unos minutos.',
    }
  }
  return { success: true }
}
