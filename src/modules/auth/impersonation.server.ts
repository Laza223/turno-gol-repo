import { cookies } from 'next/headers'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonationCookie,
  type ImpersonationPayload,
} from '@/modules/auth/impersonation'

/**
 * Piezas de impersonación que dependen del request (next/headers + sesión auth).
 * Separadas del módulo crypto puro (`impersonation.ts`) para que workers, audit
 * y tests puedan importar la firma/verificación sin arrastrar next/headers.
 *
 * El resolver completo del contexto staff impersonado (con tenant + admin proxy
 * para los FKs) vive en `staff.guards` / commit de bypass — acá quedan las
 * lecturas de bajo nivel reusadas por las actions y el guard de PIN.
 */

export type ImpersonationSession = {
  systemAdminId: string
  tenantId: string
}

/**
 * Lee y verifica la cookie de impersonación del request. No chequea la sesión
 * auth: solo integridad + expiración de la cookie. Devuelve null si no hay
 * cookie o es inválida.
 */
export function readImpersonationCookie(): ImpersonationPayload | null {
  const raw = cookies().get(IMPERSONATION_COOKIE_NAME)?.value
  if (!raw) return null
  return verifyImpersonationCookie(raw)
}

/**
 * Sesión de impersonación efectiva: requiere cookie válida Y que el usuario
 * logueado sea el MISMO system_admin que la emitió. Es la verificación liviana
 * (sin tocar la DB del tenant) que usan el guard de PIN y `stopImpersonation`.
 */
export async function getImpersonationSession(): Promise<ImpersonationSession | null> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'system_admin') return null

  const payload = readImpersonationCookie()
  if (!payload) return null

  // La cookie debe pertenecer al system_admin de la sesión actual.
  if (payload.systemAdminId !== user.systemAdminId) return null

  return { systemAdminId: payload.systemAdminId, tenantId: payload.tenantId }
}
