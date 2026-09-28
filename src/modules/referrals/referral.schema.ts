import { z } from 'zod'

/**
 * Alfabeto sin caracteres ambiguos: sin `I`/`L`/`O` (se confunden con `1`/`0`
 * a mano o por teléfono) ni `0`/`1`. 31 símbolos, 8 caracteres de código →
 * 31^8 combinaciones, así que la colisión que `ensureReferralCode` reintenta
 * es un evento de probabilidad despreciable, no el camino esperado.
 *
 * Mismo alfabeto que el CHECK `tenants_referral_code_format` /
 * `staff_users_signup_referral_code_format` de la migración 094 — cambiarlo
 * acá sin la migración deja códigos válidos para Zod que la base rechaza.
 */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const REFERRAL_CODE_LENGTH = 8

// Traducción letra por letra del alfabeto de arriba a una clase de caracteres:
// A-H (sin I), J-K (sin L), M-N (sin O), P-Z, dígitos 2-9 (sin 0/1).
const REFERRAL_CODE_RE = /^[A-HJKMNP-Z2-9]{8}$/

/** Formato del código público de la landing `/r/<CODE>` (mayúsculas, 8 caracteres). */
export const referralCodeSchema = z.string().regex(REFERRAL_CODE_RE, 'Código de referido inválido')

/**
 * Normaliza lo que el super-admin pega en "Asignar referidor" (B2): el código
 * pelado o la URL completa de la landing pública (`https://turnogol.app/r/<CODE>`,
 * con o sin protocolo, con o sin barra final). `null` si el resultado no pasa
 * `referralCodeSchema` — nunca tira, el caller decide el mensaje de error.
 */
export function extractReferralCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const lastSegment = trimmed.split('/').filter(Boolean).pop() ?? trimmed
  const candidate = lastSegment.toUpperCase()
  return referralCodeSchema.safeParse(candidate).success ? candidate : null
}
