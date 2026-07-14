import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { withSystemAdminContext } from '@/shared/db/client'
import { systemAdmins } from '@/shared/db/schema'
import { logger } from '@/shared/lib/logger'
import { SuperAdminLayoutShell } from '@/components/layout/super-admin-layout-shell'
import { signOutAction } from '@/app/(admin)/actions/auth'

// Panel interno: jamás indexable ni linkeado desde superficies públicas
// (spec 2026-06-12 §3 — hardening).
export const metadata: Metadata = {
  title: 'SuperAdmin · TurnoGol',
  robots: { index: false, follow: false },
}

/** Throttle del side-effect de login: evita un UPDATE (y su fila de audit
 * del trigger 012) por cada navegación dentro del panel. */
const LAST_LOGIN_THROTTLE = sql`now() - interval '15 minutes'`

/**
 * Registra last_login_at/last_login_ip del system admin. Fire-and-forget:
 * cualquier error se loguea y NUNCA rompe el render del panel.
 *
 * Va vía `withSystemAdminContext` — la policy self-update de `system_admins`
 * (006_rls_policies.sql) permite el UPDATE del propio registro por
 * `app.current_system_admin_id`. Nota: el trigger de auditoría de
 * 012_system_admins_audit.sql emite un `system_admin.updated` por cada
 * update efectivo; el throttle de 15 min acota ese ruido a ~4 filas/hora.
 */
async function recordLastLogin(systemAdminId: string): Promise<void> {
  try {
    const forwardedFor = (await headers()).get('x-forwarded-for')
    const ip = forwardedFor?.split(',')[0]?.trim() || null

    await withSystemAdminContext(systemAdminId, async (tx) => {
      await tx
        .update(systemAdmins)
        .set({
          lastLoginAt: sql`now()`,
          lastLoginIp: ip,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(systemAdmins.id, systemAdminId),
            or(
              isNull(systemAdmins.lastLoginAt),
              lt(systemAdmins.lastLoginAt, LAST_LOGIN_THROTTLE),
            ),
          ),
        )
    })
  } catch (err) {
    logger.warn('super-admin.last_login_update_failed', {
      module: 'super-admin',
      systemAdminId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  // Triple chequeo (claim JWT + fila activa en DB + allowlist de email);
  // cualquier fallo redirige a /login sin diferenciar motivo.
  const auth = await requireSystemAdmin()

  await recordLastLogin(auth.admin.id)

  const adminName =
    `${auth.admin.firstName} ${auth.admin.lastName}`.trim() || auth.admin.email

  return (
    <SuperAdminLayoutShell
      userEmail={auth.admin.email}
      adminName={adminName}
      signOut={signOutAction}
    >
      {children}
    </SuperAdminLayoutShell>
  )
}
