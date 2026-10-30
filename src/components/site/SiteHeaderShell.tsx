import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

type Props = {
  /** `fixed` flota sobre el hero (home, para-complejos); `sticky` acompaña el scroll del portal. */
  position?: 'fixed' | 'sticky'
  /** Destino del logo. */
  homeHref?: string
  /** Lado derecho del pill: links y CTA de cada contexto. */
  children?: ReactNode
}

/**
 * Cabecera única de TurnoGol: el pill flotante del home (`.overlay-nav`, que se
 * adapta a claro/oscuro) con el logotipo a la izquierda. Portal, para-complejos,
 * login/registro y onboarding la usan; lo único que cambia entre contextos son
 * los links y el CTA que van en `children`. No armar otro header con otro logo.
 */
export function SiteHeaderShell({ position = 'fixed', homeHref = '/', children }: Props) {
  return (
    <header
      className={cn(
        'top-0 z-50 w-full px-3 pt-[calc(12px+env(safe-area-inset-top))] sm:px-6 sm:pt-[calc(18px+env(safe-area-inset-top))]',
        position === 'fixed' ? 'fixed' : 'sticky pb-2',
      )}
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="overlay-nav flex items-center justify-between gap-2 rounded-full py-2 pl-4 pr-2 sm:gap-6 sm:py-3 sm:pl-6 sm:pr-3.5">
          <Link
            href={homeHref}
            aria-label="TurnoGol — inicio"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo variant="horizontal" />
          </Link>
          {children ? <div className="flex items-center gap-1 sm:gap-1.5">{children}</div> : null}
        </div>
      </div>
    </header>
  )
}
