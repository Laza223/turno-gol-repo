import { z } from 'zod'

/**
 * Política de contraseña (spec §6.3): mínimo 8 caracteres, SIN requisitos de
 * complejidad (largo > símbolos; NIST + demografía del dueño de complejo). Este
 * valor ESPEJA `minimum_password_length` de Supabase (supabase/config.toml +
 * dashboard prod). Si cambia uno, cambiar el otro.
 */
export const MIN_PASSWORD_LENGTH = 8

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)

/**
 * Contraseña temporal legible para dictar por teléfono o pasar por WhatsApp
 * (≥8, sin ambigüedad). La usan el reset de soporte y el alta asistida, las dos
 * con `force_password_change`: sirve para un solo ingreso. Web Crypto y no
 * `node:crypto`, para que este módulo siga siendo importable desde cualquier lado.
 */
export function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return `TG-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}
