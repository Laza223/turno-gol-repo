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
