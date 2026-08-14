import { z } from 'zod'

/**
 * Locale global de Zod (es-AR).
 *
 * ⚠️ NO SIRVE COMO RED DE SEGURIDAD PARA LOS SCHEMAS DE LA APP. Se creyó que sí
 * (auditoría 2026-08-01 §4.15) y por eso quedaron `.max()`/`.min()` sin mensaje
 * en 6+ formularios, todos mostrando el default en inglés al usuario final
 * ("Too big: expected string to have <=80 characters" — 🔴 QA 2026-08-13).
 *
 * Medido en runtime contra `next dev` (Next 16 + Turbopack), con una sonda que
 * imprimía el mensaje y el estado del config global:
 *
 *   1. `register()` de `instrumentation.ts` CORRE (runtime=nodejs) y esta
 *      función se ejecuta sin tirar.
 *   2. Desde un route handler, `globalThis.__zod_globalConfig.localeError` está
 *      seteado — o sea el config global viajó.
 *   3. Y aun así los mensajes de ESE handler salían en inglés.
 *   4. Llamando a `installZodLocale()` desde un módulo del grafo de la app, los
 *      mismos schemas pasaron a español.
 *
 * Conclusión: `instrumentation.ts` se bundlea en un layer aparte y su copia de
 * zod no es la que usan los schemas de la app; `z.config()` configura la copia
 * del que llama. Por eso todo `.max()`/`.min()` cuyo mensaje pueda llegar a la
 * pantalla lleva mensaje EXPLÍCITO (ver `boundedText` en `primitives.ts`), y
 * este locale queda solo como default de la copia de instrumentación y de los
 * tests (`tests/setup.ts`).
 */
export function installZodLocale(): void {
  z.config(z.locales.es())
}
