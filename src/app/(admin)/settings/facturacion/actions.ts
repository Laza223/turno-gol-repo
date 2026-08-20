'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminStaffAction, requireBillingAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { disconnectMercadoPago } from '@/modules/tenants/tenant.service'
import { setBillingPayerEmail } from '@/modules/billing/billing.service'
import { SubscriptionNotFoundError } from '@/modules/billing/billing.errors'

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

/**
 * En el éxito viaja el email YA NORMALIZADO (o `null` si se limpió): la UI
 * muestra lo que quedó guardado, no lo que se tipeó, y de paso ese campo es la
 * señal de "esto se acaba de guardar" — ver el comentario de
 * `MpPayerEmailSection` sobre por qué el mensaje no puede depender de un
 * `useState` del cliente.
 */
export type UpdateMpPayerEmailResult =
  { success: true } | { success: true; email: string | null } | { success: false; error: string }

/**
 * Declara con qué cuenta de MercadoPago paga el complejo la suscripción
 * (migr. 078). Vacío = volver a usar el email de la cuenta de TurnoGol.
 *
 * `requireBillingAdminStaffAction` y no `requireAdminStaffAction`: el que más
 * necesita corregir este dato puede ser un dueño `suspended`/`blocked`, y ese
 * guard lo rebotaría justo en el flujo que existe para dejarlo pagar (ENS-20).
 *
 * No valida contra MercadoPago acá a propósito: la única verificación real es
 * que MP acepte el preapproval, y eso pasa en `subscribe()`/`reactivate()`,
 * a un clic de distancia. Pre-validar exigiría otra llamada a MP para nada.
 */
export async function updateMpPayerEmailAction(
  _prevState: UpdateMpPayerEmailResult,
  formData: FormData,
): Promise<UpdateMpPayerEmailResult> {
  const auth = await requireBillingAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant, user } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const raw = formData.get('mpPayerEmail')
  const trimmed = typeof raw === 'string' ? raw.trim() : ''

  let email: string | null = null
  if (trimmed !== '') {
    // Zod 4: `z.email()` valida ANTES de los transforms si va primero, así que
    // el lowercase va en un pipe (mismo patrón que perfil/actions.ts).
    const parsed = z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ message: 'Ingresá un email válido' }))
      .safeParse(trimmed)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Email inválido' }
    }
    email = parsed.data
  }

  try {
    await withTenantContext(tenant.id, async (tx) => {
      const { previous } = await setBillingPayerEmail(tenant.id, email, tx)
      await insertAuditLog(tx, {
        tenantId: tenant.id,
        actorId: user.staffUserId,
        actorType: 'staff',
        action: 'subscription.payer_email_updated',
        resourceType: 'tenant_subscription',
        resourceId: tenant.id,
        metadata: { before: previous, after: email },
      })
    })
  } catch (err) {
    if (err instanceof SubscriptionNotFoundError) {
      return { success: false, error: 'Este complejo todavía no tiene una suscripción.' }
    }
    throw err
  }

  // Sin `revalidatePath` a propósito: las dos páginas que muestran este dato
  // (`/settings/facturacion` y `/reactivar`) son dinámicas y se re-renderizan
  // solas en la próxima navegación, así que no hay caché que romper. (Ojo: NO
  // es porque revalidar se lleve puesto el estado del cliente — esa hipótesis
  // se midió con control el 2026-08-20 y se REFUTÓ: `revalidatePath` no borra
  // `state`. El "Guardado" viaja por `state` igual, porque es el dato ya
  // normalizado por el server, no porque haga falta esquivar nada.)
  return { success: true, email }
}
