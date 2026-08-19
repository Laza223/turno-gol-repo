'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { disconnectMercadoPago } from '@/modules/tenants/tenant.service'

export type DisconnectMpResult = { success: true } | { success: false; error: string }

/**
 * Desvincula MercadoPago del complejo. Solo admin: es la credencial con la que
 * el complejo cobra, del mismo nivel que conectarla (`/api/mp/oauth-start` ya
 * rebota al manager a /dashboard).
 *
 * Existe porque conectar era un camino de ida — el botón "Conectar" se oculta
 * apenas hay `mpConnectedAt`, y no había ninguna otra puerta desde la UI. Un
 * complejo que autorizó la cuenta equivocada, o que cambia de cuenta de
 * MercadoPago, quedaba trabado (la copy vieja decía "escribinos para
 * cambiarla").
 *
 * No revoca nada del lado de MercadoPago a propósito: el consentimiento vive
 * en (usuario, aplicación) y revocarlo desde acá afectaría también a cualquier
 * otro vínculo de esa persona. Lo que se corta es que TurnoGol pueda cobrar en
 * su nombre, que es lo que el dueño está pidiendo.
 */
export async function disconnectMercadoPagoAction(): Promise<DisconnectMpResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant, user } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  if (!tenant.mpConnectedAt) {
    return { success: false, error: 'Este complejo no tiene MercadoPago conectado.' }
  }

  await withTenantContext(tenant.id, async (tx) => {
    const { mpUserId } = await disconnectMercadoPago(tenant.id, tx)
    await insertAuditLog(tx, {
      tenantId: tenant.id,
      actorId: user.staffUserId,
      actorType: 'staff',
      action: 'tenant.mp_disconnected',
      resourceType: 'tenant',
      resourceId: tenant.id,
      // El mpUserId queda registrado porque es el dato que permite reconstruir
      // a qué cuenta estaba vinculado; el token nunca se audita.
      metadata: { mpUserId },
    })
  })

  // También /settings/reservas: desconectar apaga `requires_deposit`, así que
  // esa pantalla queda mostrando una seña que ya no existe.
  revalidatePath('/settings/facturacion')
  revalidatePath('/settings/reservas')
  return { success: true }
}
