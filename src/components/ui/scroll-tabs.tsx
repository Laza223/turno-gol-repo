'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type ScrollTab = { href: string; label: string }

type Props = {
  tabs: ScrollTab[]
  /** href del tab activo (comparación exacta). */
  activeHref: string
  ariaLabel: string
  className?: string
}

/**
 * Tab bar de links con scroll horizontal propio en mobile (receta
 * QuickFilters/WeekStrip): los tabs nunca desbordan la página a 360px
 * (MASTER §12 "sin scroll horizontal a 375px") y mantienen touch de 44px
 * (§10) vía min-h-11 md:min-h-9.
 *
 * Navega SIEMPRE con `next/link`. Hasta acá el default era `<a>` nativo y solo
 * Grilla y Clientes pedían el opt-in `clientNav`, así que las 15 tabs de Caja,
 * Configuración y Torneos recargaban el documento entero en cada click: el
 * layout de `(admin)` volvía a correr completo (1 llamada de red a Supabase
 * Auth + hasta 14 round trips a Postgres, con la base en otra región que la
 * función) y encima se re-descargaba y re-hidrataba todo el bundle. Eso es el
 * grueso de los ">5s entre vistas" que reportó el dueño.
 *
 * El opt-in se eliminó en vez de agregarse a los tres call-sites que faltaban:
 * los cinco consumidores quieren lo mismo, y un default que se paga caro cuando
 * te olvidás de un prop vuelve a romperse en el sexto.
 */
export function ScrollTabs({ tabs, activeHref, ariaLabel, className }: Props) {
  const navRef = useRef<HTMLElement>(null)

  // MEJORA-UX QA (mobile 375px): con 7+ tabs la tira desborda y el navegador
  // la monta siempre con scrollLeft=0 — si el tab activo es de los últimos
  // (ej. "Avisos"), arranca fuera de vista sin que la tira misma lo indique
  // (el h2 de la card sí lo dice, pero un usuario que solo mira la tira no lo
  // sabe). `inline: 'nearest'` no mueve nada si ya está visible.
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeHref])

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-border scrollbar-none [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map(({ href, label }) => {
        const active = href === activeHref
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors duration-150 md:min-h-9',
              // `text-emerald-700` (el idiom "correcto" en el resto del repo)
              // mide 4.41:1 sobre `bg-background` — donde vive este tab bar
              // de verdad (SettingsPage lo renderiza fuera de cualquier
              // `.card-premium`, ver reservas/page.tsx), no sobre una card
              // blanca. `emerald-800` da 6.18:1 ahí y sigue leyéndose "marca".
              active
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-400'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
