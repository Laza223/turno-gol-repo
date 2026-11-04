import Link from 'next/link'
import { cn } from '@/lib/utils'

const tabClass = (active: boolean) =>
  cn(
    'flex min-h-11 flex-1 items-center justify-center rounded-full py-2 text-center text-sm font-semibold transition-colors duration-150',
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-muted text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
  )

/** La píldora segmentada Tablón · Mis partidos (misma receta que Próximos · Historial de Mis reservas). */
export function RivalTabs({ current }: { current: 'tablon' | 'mis-partidos' }) {
  return (
    <nav
      aria-label="Secciones de RIVAL"
      className="flex gap-1 rounded-full border border-border bg-card p-1 shadow-xs lg:max-w-sm"
    >
      <Link
        href="/rival"
        aria-current={current === 'tablon' ? 'page' : undefined}
        className={tabClass(current === 'tablon')}
      >
        Tablón
      </Link>
      <Link
        href="/rival/mis-partidos"
        aria-current={current === 'mis-partidos' ? 'page' : undefined}
        className={tabClass(current === 'mis-partidos')}
      >
        Mis partidos
      </Link>
    </nav>
  )
}
