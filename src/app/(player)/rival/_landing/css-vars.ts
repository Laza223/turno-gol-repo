import type { CSSProperties } from 'react'

/** Estilo en línea con custom properties (`--i`, `--len`…) y/o propiedades normales. */
export function cssVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties
}

/** Archivo (titulares y cifras) para texto dentro de SVG, donde `var()` no entra como atributo. */
export const DISPLAY_FONT = 'var(--font-archivo), system-ui, sans-serif'
