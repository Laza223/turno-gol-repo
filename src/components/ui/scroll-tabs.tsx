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
 * (§10) vía min-h-11 md:min-h-9. Usa <a> nativo a propósito: las páginas
 * que lo consumen (settings) navegan con full reload, igual que antes.
 */
export function ScrollTabs({ tabs, activeHref, ariaLabel, className }: Props) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map(({ href, label }) => {
        const active = href === activeHref
        return (
          <a
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
          </a>
        )
      })}
    </nav>
  )
}
