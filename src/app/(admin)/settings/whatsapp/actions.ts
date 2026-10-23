'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import type { ActionResult } from '@/shared/types/action-result'
import {
  findAndRegisterWhatsappConnection,
  getWhatsappPlusState,
  setWhatsappBotEnabled,
  startWhatsappConnect,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { CONNECT_ERROR_MESSAGE } from './connect-messages'

const NO_PLUS = 'Tu complejo no tiene el asistente de WhatsApp.'

export async function setWhatsappBotEnabledAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = z.enum(['true', 'false']).safeParse(formData.get('enabled'))
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const enabled = parsed.data === 'true'
  // Con el flag apagado para el complejo la sección no existe: tampoco se
  // puede prender por un POST armado a mano. Y sin número conectado no hay nada
  // que prender.
  const saved =
    (await getWhatsappPlusState(tenant.id))?.connection != null &&
    (await withTenantContext(tenant.id, (tx) => setWhatsappBotEnabled(tenant.id, enabled, tx)))
  if (!saved) return { success: false, error: NO_PLUS }

  revalidatePath('/settings/whatsapp')
  return { success: true }
}

/** "Conectar mi WhatsApp": manda al dueño al link de Kapso. */
export async function startWhatsappConnectAction(): Promise<ActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  if ((await getWhatsappPlusState(tenant.id)) === null) return { success: false, error: NO_PLUS }

  const started = await startWhatsappConnect({ id: tenant.id, name: tenant.name })
  if (!started.ok) return { success: false, error: CONNECT_ERROR_MESSAGE[started.error] }
  redirect(started.url)
}

/** "Ya lo conecté": por si el dueño terminó en Kapso pero no volvió a TurnoGol. */
export async function checkWhatsappConnectionAction(): Promise<ActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant, user } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }
  if ((await getWhatsappPlusState(tenant.id)) === null) return { success: false, error: NO_PLUS }

  const result = await findAndRegisterWhatsappConnection(
    { id: tenant.id, name: tenant.name },
    user.staffUserId,
  )
  if (!result.ok) return { success: false, error: CONNECT_ERROR_MESSAGE[result.error] }
  redirect('/settings/whatsapp?conectado=1')
}
