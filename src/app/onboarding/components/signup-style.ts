/**
 * Piezas visuales del alta (La Previa). Archivo sin `'use client'`: lo usan pasos de
 * cliente y páginas de servidor (resumen, listo).
 */

/** Marco siempre oscuro: los tokens resuelven en oscuro también con el tema claro, y el borde de campo llega a 3:1. */
export const SIGNUP_FRAME_CLASS =
  'signup-frame dark dark-surface relative isolate min-h-dvh overflow-x-clip text-foreground [--input:215.4_16.3%_50%]'

/** Titular de cada pregunta: Archivo negra itálica. */
export const SIGNUP_TITLE_CLASS =
  'font-display text-[28px] font-black italic leading-[1.1] tracking-tight text-white focus:outline-hidden md:text-3xl'

/** Tramo en degradé: el `padding-right` de `.hero-accent-text` (para la itálica) dejaba un hueco antes del "?". */
export const SIGNUP_ACCENT_CLASS = 'hero-accent-text -mr-[0.12em]'

/** Campo de 48 px con el vidrio de ingreso. */
export const SIGNUP_INPUT_CLASS =
  'h-12 md:h-12 bg-white/4 text-base md:text-sm placeholder:text-muted-foreground'

/** Botón principal y secundarios del alta: 48 px. */
export const SIGNUP_BUTTON_CLASS = 'h-12 md:h-12 text-base'

/** Parte el título en el tramo con degradé (la primera aparición de `accent`). */
export function splitAccent(title: string, accent: string | undefined) {
  const at = accent ? title.indexOf(accent) : -1
  if (!accent || at < 0) return { before: title, accent: null, after: '' }
  return {
    before: title.slice(0, at),
    accent,
    after: title.slice(at + accent.length),
  }
}
