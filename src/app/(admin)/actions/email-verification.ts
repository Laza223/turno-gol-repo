'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/sentry'
import { requireBillingAdminStaffAction } from '@/modules/staff/guards'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { isStaffEmailTaken } from '@/modules/auth/auth.service'
import {
  getEmailVerificationState,
  replaceUnverifiedEmail,
  sendVerificationEmail,
} from '@/modules/auth/email-verification.service'
import { updateTenant } from '@/modules/tenants/tenant.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import type { ActionResult } from '@/shared/types/action-result'

const IMPERSONATION_BLOCK_MESSAGE =
  'Estás impersonando este complejo. El mail lo tiene que confirmar el dueño desde su cuenta.'

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Ingresá un email válido' }))

// `requireBillingAdminStaffAction` y no `requireAdminStaffAction`: el dueño moroso
// (`suspended`/`blocked`) tiene que poder confirmar el mail para reactivar (ENS-20).

/** Reenvía el link de confirmación al mail actual. Un link nuevo invalida el anterior. */
export async function resendVerificationEmailAction(): Promise<ActionResult> {
  const auth = await requireBillingAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  if (await getImpersonationSession()) {
    return { success: false, error: IMPERSONATION_BLOCK_MESSAGE }
  }

  const limited = await adminRateLimited(auth.tenant.id)
  if (limited) return { success: false, error: limited }

  const sent = await sendVerificationEmail(auth.user.staffUserId)
  if (sent.ok) return { success: true }
  if (sent.reason === 'already_verified') {
    revalidatePath('/', 'layout')
    return { success: true }
  }
  if (sent.reason === 'rate_limited') {
    return {
      success: false,
      error: 'Ya te mandamos el mail hace poco. Esperá unos minutos y probá de nuevo.',
    }
  }
  return { success: false, error: 'No pudimos mandar el mail. Probá de nuevo en unos minutos.' }
}

/**
 * Corrige el mail de una cuenta que todavía no lo confirmó. Como nadie probó que
 * el viejo sea suyo, no hace falta la doble confirmación de `updateUserEmailAction`:
 * se cambia directo y se manda un link nuevo al mail corregido. Ya confirmado, ese
 * camino sigue siendo el de Ajustes.
 */
export async function changeUnverifiedEmailAction(
  newEmail: string,
): Promise<ActionResult<{ notice?: string }>> {
  const auth = await requireBillingAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  if (await getImpersonationSession()) {
    return { success: false, error: IMPERSONATION_BLOCK_MESSAGE }
  }

  const parsed = emailSchema.safeParse(newEmail)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Email inválido' }
  }
  const email = parsed.data

  const limited = await adminRateLimited(auth.tenant.id)
  if (limited) return { success: false, error: limited }

  const { staffUserId } = auth.user
  const state = await getEmailVerificationState(staffUserId)
  if (!state) return { success: false, error: 'No encontramos tu cuenta.' }
  if (state.verified) {
    return { success: false, error: 'Tu mail ya está confirmado. Cambialo desde Ajustes.' }
  }
  const oldEmail = state.email
  if (email === oldEmail) return { success: false, error: 'Ese ya es tu mail.' }

  if (await isStaffEmailTaken(email, staffUserId)) {
    return { success: false, error: 'Ese mail ya tiene una cuenta en TurnoGol.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(auth.user.id, {
    email,
    email_confirm: true,
  })
  if (error) {
    if (error.code === 'email_exists') {
      return { success: false, error: 'Ese mail ya tiene una cuenta en TurnoGol.' }
    }
    captureException(error, { tags: { flow: 'change_unverified_email' } })
    return { success: false, error: 'No pudimos cambiar el mail. Probá de nuevo en un momento.' }
  }

  // Auth, `staff_users` y `tenants.email` tienen que quedar iguales: si un paso falla,
  // se deshace lo que ya se había aplicado.
  let staffChanged = false
  try {
    staffChanged = await replaceUnverifiedEmail(staffUserId, oldEmail, email)
    if (!staffChanged)
      throw new Error('replaceUnverifiedEmail: la fila no coincide (mail confirmado en el medio)')
    if (auth.tenant.email === oldEmail) await updateTenant(auth.tenant.id, { email })
  } catch (err) {
    captureException(err, { tags: { flow: 'change_unverified_email' } })
    if (staffChanged) {
      try {
        await replaceUnverifiedEmail(staffUserId, email, oldEmail)
      } catch (undoStaffErr) {
        captureException(undoStaffErr, { tags: { flow: 'change_unverified_email_undo' } })
      }
    }
    const { error: undoErr } = await admin.auth.admin.updateUserById(auth.user.id, {
      email: oldEmail,
      email_confirm: true,
    })
    if (undoErr) captureException(undoErr, { tags: { flow: 'change_unverified_email_undo' } })
    return { success: false, error: 'No pudimos cambiar el mail. Probá de nuevo en un momento.' }
  }

  // El JWT de la sesión sigue con el mail viejo hasta refrescarse. Best-effort.
  try {
    await (await createClient()).auth.refreshSession()
  } catch (err) {
    captureException(err, { tags: { flow: 'change_unverified_email_refresh' } })
  }
  // Si el envío falla, el banner sigue ahí con "Reenviar mail".
  let notice: string | undefined
  try {
    const sent = await sendVerificationEmail(staffUserId)
    if (!sent.ok && sent.reason !== 'already_verified') {
      notice =
        sent.reason === 'rate_limited'
          ? 'Cambiamos tu mail. Ya te mandamos un link hace poco: esperá unos minutos y tocá "Reenviar mail".'
          : 'Cambiamos tu mail, pero no pudimos mandar el link. Tocá "Reenviar mail" en unos minutos.'
    }
  } catch (err) {
    captureException(err, { tags: { flow: 'change_unverified_email_send' } })
    notice =
      'Cambiamos tu mail, pero no pudimos mandar el link. Tocá "Reenviar mail" en unos minutos.'
  }

  revalidatePath('/', 'layout')
  return notice ? { success: true, notice } : { success: true }
}
