import Link from 'next/link'
import type { CSSProperties } from 'react'
import '@/components/world/portal-app.css'

/**
 * Tablón · Mis partidos: el control segmentado hecho de links de Mis reservas (`.pa-seg`), con la
 * píldora que se desliza (`.segmented-pill`, un solo elemento que se traslada por `--i`). Son dos
 * rutas, no un estado de la página.
 */
export function RivalTabs({ current }: { current: 'tablon' | 'mis-partidos' }) {
  return (
    <nav aria-label="Secciones de RIVAL" className="pa-seg glass-painted rv-rise md:max-w-sm">
      <span
        aria-hidden
        className="segmented-pill"
        style={{ '--i': current === 'tablon' ? 0 : 1, '--n': 2 } as CSSProperties}
      />
      <Link href="/rival" aria-current={current === 'tablon' ? 'page' : undefined}>
        Tablón
      </Link>
      <Link
        href="/rival/mis-partidos"
        aria-current={current === 'mis-partidos' ? 'page' : undefined}
      >
        Mis partidos
      </Link>
    </nav>
  )
}
