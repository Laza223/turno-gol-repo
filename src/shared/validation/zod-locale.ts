import { z } from 'zod'

/**
 * Locale global de Zod: red de seguridad para los campos que NO tienen mensaje
 * custom (hoy en inglés por default — 🔴 auditoría 2026-08-01 §4.15). Un mensaje
 * explícito en un schema (`.min(2, 'Mínimo 2 caracteres')`) sigue ganando: esto
 * solo cubre lo que hoy queda mudo, como `tenant.schema.ts` city/province.
 */
export function installZodLocale(): void {
  z.config(z.locales.es())
}
