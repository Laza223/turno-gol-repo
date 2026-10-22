import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import {
  BLOCKED_TENANT_STATUSES,
  READ_ONLY_TENANT_STATUSES,
} from '@/modules/tenants/tenant.lifecycle'
import type { StaffUser } from '@/modules/auth/types'
import type { TenantRow } from '@/modules/tenants/tenant.types'
import { getStaffRole } from './staff.service'
import type { StaffRole } from './roles'

type AdminStaff = {
  user: StaffUser & { staffUserId: string }
  tenant: TenantRow
}

/**
 * Gate de lifecycle del staff, el único punto por el que pasan
 * requireOperatorStaff / requireAdminStaffAction / requireAdminStaff.
 *
 * - BLOCKED_TENANT_STATUSES (blocked/churned/deleted): nada pasa.
 * - READ_ONLY_TENANT_STATUSES (suspended): pasa solo quien lo pide con
 *   `allowReadOnly`, que es lo que hacen las pages del panel para LEER. Las
 *   Server Actions no lo piden, así que por default toda escritura se rechaza.
 *   Desde 2026-10-22 es el estado de la prueba vencida y de la mora
 *   (`docs/decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md`): el
 *   dueño y el encargado miran, pero no operan.
 *
 * El default es el seguro: una page que se olvida de `allowReadOnly` rebota a
 * un complejo en solo lectura (bug visible), mientras que una action que se
 * olvidara de pedir el bloqueo sería una escritura que se cuela.
 *
 * Hallazgo R2 (ensayo general): los Server Actions no pasan por
 * (admin)/layout.tsx, así que su hard-lock nunca corría para ellos — un tenant
 * `blocked` por falta de pago podía seguir creando reservas o moviendo caja
 * invocando la action por POST directo.
 */
type LifecycleGate = 'open' | 'read_only' | 'blocked'

/**
 * Cómo le pega el lifecycle a ESTA sesión. La impersonación de SuperAdmin
 * bypassea todo a propósito ((admin)/layout.tsx, spec §6): necesita poder
 * entrar a un tenant bloqueado para dar soporte (revisar/corregir datos antes
 * de que el dueño reactive el pago).
 */
async function lifecycleGateForStaff(tenant: TenantRow): Promise<LifecycleGate> {
  const gate: LifecycleGate = BLOCKED_TENANT_STATUSES.has(tenant.status)
    ? 'blocked'
    : READ_ONLY_TENANT_STATUSES.has(tenant.status)
      ? 'read_only'
      : 'open'
  if (gate === 'open') return gate
  const impersonating = await getImpersonationSession()
  return impersonating === null ? gate : 'open'
}

/** Lo que ve el staff cuando una escritura choca con el solo lectura. */
const READ_ONLY_ERROR =
  'El complejo está en solo lectura: podés ver todo, pero no cargar ni cambiar nada hasta que se active el plan.'

type LifecycleOptions = {
  /** La llamada solo lee: un complejo en solo lectura (`suspended`) pasa. */
  allowReadOnly?: boolean
}

/**
 * Resultado de los guards para Server Actions: el rechazo por rol NO
 * redirige — la action devuelve `{ success: false, error }` y la UI muestra
 * el mensaje. Solo la falta de sesión staff redirige a /login.
 */
export type StaffActionAuth =
  | {
      ok: true
      user: StaffUser & { staffUserId: string }
      tenant: TenantRow
      role: StaffRole
    }
  | { ok: false; error: string }

async function requireStaffWithRole(
  allowed: readonly StaffRole[],
  error: string,
  opts?: LifecycleOptions & { billing?: boolean },
): Promise<StaffActionAuth> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (!tenant) return { ok: false, error: 'Tenant no encontrado' }

  // Rol SIEMPRE leído de la DB: extractAuthUser hardcodea role 'admin' en el
  // JWT, así que user.role nunca es protección (mismo criterio que
  // requireAdminStaff). null = membresía inactiva o inexistente.
  const role = await getStaffRole(tenant.id, user.staffUserId)
  if (!role || !allowed.includes(role)) return { ok: false, error }

  if (opts?.billing) {
    // Excepción de facturación, misma que `withBillingTenant` para
    // `/api/billing/reactivate`: al que quiere pagar no se le cierra la puerta
    // (ENS-20). Un tenant `suspended`/`blocked` tiene que poder corregir CON QUÉ
    // paga, o el único flujo que lo saca del bloqueo queda inalcanzable. Solo
    // `deleted` (datos ya borrados) queda afuera.
    if (tenant.status === 'deleted') {
      return { ok: false, error: 'El complejo fue eliminado.' }
    }
  } else {
    const gate = await lifecycleGateForStaff(tenant)
    if (gate === 'blocked') {
      return { ok: false, error: 'El complejo está bloqueado por falta de pago.' }
    }
    if (gate === 'read_only' && !opts?.allowReadOnly) return { ok: false, error: READ_ONLY_ERROR }
  }

  return { ok: true, user: { ...user, staffUserId: user.staffUserId }, tenant, role }
}

/**
 * Guard para Server Actions operativas (reservas, caja): admin y manager
 * (Encargado) pasan. Rebota con error si no hay membresía activa.
 *
 * Las pages operativas (Hoy, grilla, reservas, jugadores, abonados, caja) lo
 * usan también, con `allowReadOnly: true`: leer en solo lectura se puede,
 * escribir no.
 */
export async function requireOperatorStaff(opts?: LifecycleOptions): Promise<StaffActionAuth> {
  return requireStaffWithRole(['admin', 'manager'], 'Tu rol no permite realizar esta acción.', opts)
}

/**
 * Guard para Server Actions de configuración (p. ej. productos de cantina):
 * solo admin. A diferencia de requireAdminStaff, no redirige al rechazar.
 *
 * `allowReadOnly` es para las acciones del dueño que solo leen y tienen que
 * andar en solo lectura, como exportar sus datos.
 */
export async function requireAdminStaffAction(opts?: LifecycleOptions): Promise<StaffActionAuth> {
  return requireStaffWithRole(
    ['admin'],
    'Solo el administrador puede modificar la configuración.',
    opts,
  )
}

/**
 * Guard para Server Actions de facturación que un tenant moroso TIENE que
 * poder ejecutar (declarar con qué cuenta de MercadoPago paga). Solo admin, y
 * sin el hard-lock de lifecycle: mismo criterio que `withBillingTenant`
 * (ENS-20). No usarlo para nada que no sea "cómo/con qué se paga".
 */
export async function requireBillingAdminStaffAction(): Promise<StaffActionAuth> {
  return requireStaffWithRole(['admin'], 'Solo el administrador puede modificar la facturación.', {
    billing: true,
  })
}

/** Resultado de `requireAuthenticatedStaffAction`: `tenant` puede no existir todavía. */
export type AuthenticatedStaffAuth =
  | { ok: true; user: StaffUser & { staffUserId: string }; tenant: TenantRow | null }
  | { ok: false; error: string }

/**
 * Guard para Server Actions que son un simple proxy autenticado hacia un
 * tercero (p. ej. `geocodeAddressAction`, que sin guard sería un open relay
 * hacia Georef) y que necesitan correr ANTES de que el tenant exista: el paso
 * 1 del wizard de onboarding, cuando el dueño todavía está creando su
 * complejo. `requireAdminStaffAction`/`requireOperatorStaff` no sirven acá
 * porque `getStaffRole` necesita un `tenant.id` que todavía no existe —
 * exigirlo cortaba con "Tenant no encontrado" al primer dueño nuevo que
 * probaba el buscador de dirección (hallazgo 🔴 2, auditoría 2026-09-16).
 *
 * Mismo chequeo de identidad que ya usa `createTenantAction` para el alta:
 * solo staff autenticado. Sin mirar rol (no hay membresía que leer sin
 * tenant) ni lifecycle del tenant (no hay mutación de datos del tenant acá,
 * es una consulta de solo lectura a Georef). Si ya existe un tenant para este
 * staff, se devuelve igual — lo usa también la revisita de Perfil/paso 1.
 */
export async function requireAuthenticatedStaffAction(): Promise<AuthenticatedStaffAuth> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  return { ok: true, user: { ...user, staffUserId: user.staffUserId }, tenant }
}

/**
 * Guard server-side para zonas solo-admin (Configuración, Vista Equipo,
 * Métricas). El Encargado (manager) rebota a /dashboard por default: Hoy es
 * también suya (2026-09-19), así que no hay segundo salto. `opts.onRoleRejected`
 * lo pisa: lo usa settings/layout.tsx (H163) para ir directo a /grilla con un
 * `?notice=` que esa página traduce a un aviso, evitando el salto extra por
 * /dashboard (que perdería el query param: no reenvía searchParams al
 * redirigir). El rol se lee de la DB en cada request — un cambio de rol
 * aplica de inmediato, sin esperar a que el JWT se refresque.
 */
export async function requireAdminStaff(
  opts?: LifecycleOptions & { onRoleRejected?: string },
): Promise<AdminStaff> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (!tenant) redirect('/login')

  const role = await getStaffRole(tenant.id, user.staffUserId)
  if (role !== 'admin') redirect(opts?.onRoleRejected ?? '/dashboard')

  // Mismo bloqueo de tenant lifecycle que requireStaffWithRole (hallazgo R2):
  // requireAdminStaff también se usa como guard de Server Actions fuera de
  // (admin)/* (p. ej. finishOnboardingAction en src/app/onboarding/actions.ts),
  // rutas que no pasan por el hard-lock de (admin)/layout.tsx. Bloqueado va a
  // /suspended, como el layout; en solo lectura, quien no pidió
  // `allowReadOnly` (una escritura) va a /reactivar, que es la salida.
  const gate = await lifecycleGateForStaff(tenant)
  if (gate === 'blocked') redirect('/suspended')
  if (gate === 'read_only' && !opts?.allowReadOnly) redirect('/reactivar')

  return { user: { ...user, staffUserId: user.staffUserId }, tenant }
}
