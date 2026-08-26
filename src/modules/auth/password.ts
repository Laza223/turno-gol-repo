import { z } from 'zod'

/**
 * Política de contraseña (spec §6.3): mínimo 8 caracteres, SIN requisitos de
 * complejidad (largo > símbolos; NIST + demografía del dueño de complejo). Este
 * valor ESPEJA `minimum_password_length` de Supabase (supabase/config.toml +
 * dashboard prod). Si cambia uno, cambiar el otro.
 *
 * Y no era cierto hasta el 2026-08-26: producción estaba en 6, el default de
 * fábrica. La regla real es la MÁS FLOJA de las dos para cualquier camino que
 * no pase por este schema (un reseteo, o el SuperAdmin cambiando una clave).
 *
 * Cómo verificar que siguen espejados, sin crear un usuario — la sonda usa 5
 * caracteres a propósito: con 6 u 8 un mínimo bajo la dejaría pasar y crearía
 * la cuenta, mientras que con 5 las dos salidas posibles son un rechazo y el
 * mensaje delata el valor configurado:
 *
 * ```
 * curl -s -X POST "https://<ref>.supabase.co/auth/v1/signup"  *   -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" -H "Content-Type: application/json"  *   -d '{"email":"sonda@turnogol.invalid","password":"aB3xQ"}'
 * -> 422 {"error_code":"weak_password","msg":"Password should be at least 8 characters."}
 * ```
 */
export const MIN_PASSWORD_LENGTH = 8

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
