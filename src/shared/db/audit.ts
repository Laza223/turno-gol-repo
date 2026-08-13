import { auditLogs } from '@/shared/db/schema'
import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonationCookie,
} from '@/shared/security/impersonation-cookie'
import type { DbTx } from './client'

/** Sentinel UUID for system-originated audit rows (cron jobs, webhooks). */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Si la request está impersonando (cookie tg_sa_impersonate válida), toda
 * escritura de audit se fuerza a nombre del super admin (spec §6): ninguna
 * acción puede quedar atribuida al cliente real. Lee la cookie del request;
 * en contextos sin request (workers pg-boss) `cookies()` lanza y devolvemos
 * null vía el catch — el import es dinámico para no acoplar audit.ts a
 * next/headers en el bundle del worker.
 */
async function resolveImpersonationOverride(): Promise<{
  systemAdminId: string
  tenantId: string
} | null> {
  try {
    const { cookies } = await import('next/headers')
    // `await cookies()` dentro del try: en un worker de pg-boss (sin request
    // context) la Promise rechaza, el await lo convierte en throw y el catch de
    // abajo devuelve null. Mismo contrato que cuando `cookies()` tiraba sync.
    const cookieStore = await cookies()
    const raw = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value
    if (!raw) return null
    const payload = verifyImpersonationCookie(raw)
    if (!payload) return null

    // F16: bind the cookie to the CURRENT session — same check
    // getImpersonationSessionFor makes for the impersonated staff context.
    // Without it, a stale-but-unexpired cookie (left over on a shared
    // machine after a plain "Cerrar sesión" instead of "Salir de
    // impersonación") silently re-attributes a DIFFERENT person's audit
    // entries to the system admin who last impersonated, corrupting the
    // audit trail's non-repudiation guarantee.
    const { extractRealAuthUser } = await import('@/modules/auth/auth.middleware')
    const realUser = await extractRealAuthUser()
    if (!realUser || realUser.type !== 'system_admin') return null
    if (realUser.systemAdminId !== payload.systemAdminId) return null

    return { systemAdminId: payload.systemAdminId, tenantId: payload.tenantId }
  } catch {
    return null
  }
}

export type AuditEntry = {
  tenantId: string
  actorId: string
  actorType: 'player' | 'staff' | 'system'
  /** Format: `<resource>.<verb>` — e.g. 'booking.canceled'. */
  action: string
  resourceType: string
  resourceId: string
  metadata?: Record<string, unknown>
}

export async function insertAuditLog(tx: DbTx, entry: AuditEntry): Promise<void> {
  const override = await resolveImpersonationOverride()
  const actorId = override ? override.systemAdminId : entry.actorId
  const actorType: AuditEntry['actorType'] = override ? 'system' : entry.actorType
  const metadata = override
    ? { ...(entry.metadata ?? {}), impersonated_tenant_id: override.tenantId }
    : (entry.metadata ?? null)

  await tx.insert(auditLogs).values({
    tenantId: entry.tenantId,
    actorId,
    actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata,
  })
}

export type SystemAuditEntry = Omit<AuditEntry, 'actorId' | 'actorType'>

export async function insertSystemAuditLog(tx: DbTx, entry: SystemAuditEntry): Promise<void> {
  await insertAuditLog(tx, {
    ...entry,
    actorId: SYSTEM_ACTOR_ID,
    actorType: 'system',
  })
}
