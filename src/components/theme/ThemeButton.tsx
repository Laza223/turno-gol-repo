'use client'

import { useEffect, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Color de la barra del navegador en cada tema (dirección §5.9): el fondo del portal. */
const THEME_COLOR = { dark: '#020617', light: '#f3f6f3' } as const

/**
 * El botón de tema del portal de vidrio, arriba a la derecha (decisión 2026-11-13). Pasa de claro
 * a oscuro y de oscuro a claro sobre el tema que se está viendo; "Sistema" sigue en el control de
 * Cuenta y del menú.
 *
 * El tema nuevo se abre en círculo desde el botón: transición de vista sobre la raíz con un
 * `clip-path` de 420 ms (dirección §4.5, Cromo). Sin soporte o con "reducir movimiento", cambia
 * directo.
 *
 * El ícono y el nombre salen de la clase `.dark` que next-themes pone antes de pintar, así que
 * el HTML del servidor ya dice lo correcto sin esperar a hidratar. Mientras está montado, la barra
 * del navegador (`theme-color`) acompaña al tema.
 */
export function ThemeButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    if (resolvedTheme !== 'dark' && resolvedTheme !== 'light') return
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    const before = metas.map((m) => m.content)
    for (const m of metas) m.content = THEME_COLOR[resolvedTheme]
    return () => metas.forEach((m, i) => (m.content = before[i] ?? m.content))
  }, [resolvedTheme])

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    const apply = () => {
      flushSync(() => setTheme(next))
      // next-themes aplica la clase en un efecto: acá va en el mismo cuadro que la captura.
      document.documentElement.classList.toggle('dark', next === 'dark')
      document.documentElement.style.colorScheme = next
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof document.startViewTransition !== 'function') {
      apply()
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    // Mientras dura, la cabecera y la barra de abajo no llevan su nombre de transición (globals.css):
    // se abren con el círculo junto con el resto de la pantalla.
    const root = document.documentElement
    root.dataset.themeSwap = ''
    const transition = document.startViewTransition(apply)
    transition.finished.finally(() => delete root.dataset.themeSwap).catch(() => {})
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 420,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
      .catch(() => {})
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-portal-ink transition-[scale,background-color] duration-(--dur-1) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green active:scale-[.96] motion-reduce:active:scale-100',
        className,
      )}
    >
      <Moon className="hidden size-5 dark:block" aria-hidden />
      <Sun className="block size-5 dark:hidden" aria-hidden />
      <span className="sr-only hidden dark:inline">Cambiar a tema claro</span>
      <span className="sr-only dark:hidden">Cambiar a tema oscuro</span>
    </button>
  )
}
