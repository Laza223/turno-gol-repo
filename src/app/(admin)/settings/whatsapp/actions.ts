'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import type { ActionResult } from '@/shared/types/action-result'
import {
  getWhatsappConnection,
  setWhatsappBotEnabled,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'

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
  const saved = await withTenantContext(tenant.id, async (tx) => {
    // Con el flag apagado para el complejo la sección no existe: tampoco se
    // puede prender por un POST armado a mano.
    if (!(await getWhatsappConnection(tenant.id, tx))) return false
    return setWhatsappBotEnabled(tenant.id, enabled, tx)
  })
  if (!saved) return { success: false, error: 'Tu complejo no tiene el asistente de WhatsApp.' }

  revalidatePath('/settings/whatsapp')
  return { success: true }
}
