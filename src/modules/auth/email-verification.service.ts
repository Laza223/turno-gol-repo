import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorkerSql } from '@/shared/db/client'
import { enforce } from '@/shared/rate-limit/apply'
import { getEmailProvider } from '@/modules/notifications/email.provider'
import { appLink } from '@/modules/notifications/templates/app-link'
import { escapeHtml } from '@/modules/notifications/templates/html-escape'

/** El link del mail vale 48 horas y se usa una sola vez. */
const TOKEN_TTL_HOURS = 48

const EMAIL_NOT_VERIFIED_MESSAGE = 'Confirmá tu mail para activar el plan.'
export const INVITE_NOT_VERIFIED_MESSAGE = 'Confirmá tu mail para invitar a tu equipo.'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * `staff_users` es global: pool worker (mismo criterio que `getOrCreateStaffUser`).
 * En la base queda solo el sha256 del token; el crudo viaja únicamente en el mail.
 */
async function issueToken(staffUserId: string): Promise<{ token: string; email: string } | null> {
  const token = randomBytes(32).toString('base64url')
  const rows = await getWorkerSql()<{ email: string }[]>`
    UPDATE staff_users
    SET email_verify_token_hash = ${hashToken(token)}, email_verify_sent_at = now()
    WHERE id = ${staffUserId} AND email_verified_at IS NULL
    RETURNING email
  `
  return rows[0] ? { token, email: rows[0].email } : null
}

/**
 * Quien prueba el mail con Google reclama la cuenta: si estaba sin verificar, la contraseña
 * con la que se creó (quizá la puso un tercero que ocupó el mail) deja de valer y el mail
 * queda verificado. `true` = la cuenta estaba sin verificar y se reclamó; el caller cierra las
 * otras sesiones. Cuenta ya verificada o inexistente: `false`, sin tocar nada.
 */
export async function claimUnverifiedAccountWithGoogle(
  staffUserId: string,
  authUserId: string,
): Promise<boolean> {
  const rows = await getWorkerSql()<{ id: string }[]>`
    UPDATE staff_users
    SET email_verified_at = now(), email_verify_token_hash = NULL
    WHERE id = ${staffUserId} AND email_verified_at IS NULL
    RETURNING id
  `
  if (!rows[0]) return false
  const { error } = await createAdminClient().auth.admin.updateUserById(authUserId, {
    password: randomBytes(32).toString('base64url'),
  })
  if (error) throw new Error(`No se pudo invalidar la contraseña: ${error.message}`)
  return true
}

export type SendVerificationResult =
  { ok: true } | { ok: false; reason: 'already_verified' | 'rate_limited' | 'send_failed' }

/**
 * Genera un token nuevo (el anterior deja de valer) y manda el mail. Un fallo del
 * envío no revierte nada: el dueño puede pedir el reenvío desde el banner.
 */
export async function sendVerificationEmail(staffUserId: string): Promise<SendVerificationResult> {
  const rl = await enforce('authEmailVerify', staffUserId)
  if (!rl.ok) return { ok: false, reason: 'rate_limited' }

  const issued = await issueToken(staffUserId)
  if (!issued) return { ok: false, reason: 'already_verified' }

  const url = appLink(`/api/auth/verify-email?token=${issued.token}`)
  const subject = 'Confirmá tu mail en TurnoGol'
  const intro = 'Confirmá tu mail para activar el plan cuando quieras.'
  try {
    await getEmailProvider().send({
      to: issued.email,
      subject,
      html: `<html lang="es"><body><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">Confirmar mi mail</a></p><p>El link vale 48 horas. Si no creaste una cuenta en TurnoGol, ignorá este mail.</p></body></html>`,
      text: `${intro}\n\nConfirmar mi mail: ${url}\n\nEl link vale 48 horas. Si no creaste una cuenta en TurnoGol, ignorá este mail.`,
    })
  } catch {
    return { ok: false, reason: 'send_failed' }
  }
  return { ok: true }
}

export type ConsumeVerificationResult = { ok: true } | { ok: false; reason: 'invalid' | 'expired' }

/**
 * Valida y consume el token en un solo UPDATE: dos clicks simultáneos no pueden
 * ganar los dos. `invalid` cubre token inexistente y ya usado (el hash se borra).
 */
export async function consumeVerificationToken(token: string): Promise<ConsumeVerificationResult> {
  const hash = hashToken(token)
  const sql = getWorkerSql()
  const done = await sql<{ id: string }[]>`
    UPDATE staff_users
    SET email_verified_at = now(), email_verify_token_hash = NULL
    WHERE email_verify_token_hash = ${hash}
      AND email_verify_sent_at > now() - make_interval(hours => ${TOKEN_TTL_HOURS})
    RETURNING id
  `
  if (done.length > 0) return { ok: true }
  const stale = await sql<{ id: string }[]>`
    SELECT id FROM staff_users WHERE email_verify_token_hash = ${hash} LIMIT 1
  `
  return { ok: false, reason: stale.length > 0 ? 'expired' : 'invalid' }
}

/** Mail actual de `staff_users` (el del JWT puede estar viejo tras un cambio) y si está probado. */
export async function getEmailVerificationState(
  staffUserId: string,
): Promise<{ email: string; verified: boolean } | null> {
  const rows = await getWorkerSql()<{ email: string; verified: boolean }[]>`
    SELECT email, (email_verified_at IS NOT NULL) AS verified
    FROM staff_users WHERE id = ${staffUserId} LIMIT 1
  `
  return rows[0] ?? null
}

/**
 * Guard de lo que queda limitado hasta verificar el mail: activar el plan pago,
 * subir canchas facturadas e invitar al equipo. Server-side, nunca solo en la UI.
 */
export async function requireVerifiedOwnerEmail(
  staffUserId: string,
  message: string = EMAIL_NOT_VERIFIED_MESSAGE,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await getEmailVerificationState(staffUserId)
  return state?.verified ? { ok: true } : { ok: false, error: message }
}

/**
 * Cambia el mail de una cuenta NO verificada e invalida el token anterior.
 * Solo toca `staff_users`; Auth y `tenants.email` los resuelve el caller.
 */
export async function replaceUnverifiedEmail(
  staffUserId: string,
  oldEmail: string,
  newEmail: string,
): Promise<boolean> {
  const rows = await getWorkerSql()<{ id: string }[]>`
    UPDATE staff_users
    SET email = ${newEmail}, email_verify_token_hash = NULL
    WHERE id = ${staffUserId} AND email = ${oldEmail} AND email_verified_at IS NULL
    RETURNING id
  `
  return rows.length > 0
}
