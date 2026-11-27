'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ThemeButton } from '@/components/theme/ThemeButton'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'
import { usePortalSession } from '@/components/site/PortalSessionProvider'

/** Pasados `px` de scroll. Cambia una sola vez al cruzar el umbral, como en `PortalHeader`. */
function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const check = () => setPast(window.scrollY > px)
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [px])
  return past
}

// Rutas absolutas: el header se comparte con /precios y el blog, donde los anchors sueltos no existen.
const LINKS = [
  { href: '/para-complejos#features', label: 'Funciones', current: '/para-complejos' },
  { href: '/precios', label: 'Precios', current: '/precios' },
  { href: '/blog', label: 'Blog', current: '/blog' },
] as const

// Touch-target 44px (WCAG 2.5.5), como los ítems del menú de la cuenta (`AccountMenu`).
const itemClass =
  'flex min-h-11 w-full items-center rounded-2xl px-3 py-2 text-[15px] font-semibold text-portal-ink outline-hidden transition-colors duration-(--dur-2) hover:bg-portal-inner focus-visible:bg-portal-inner focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-portal-green'

/**
 * Cabecera de las páginas para complejos (para-complejos, precios, blog, comparativas, referidos).
 * Portal de vidrio (F8, decisión de Lazar del 2026-11-16): la misma píldora de vidrio que
 * `PortalHeader` (clases `.portal-top*`), con los links del dueño y no los del jugador:
 * Funciones, Precios y Blog, Ingresar → /login (password) y Empezar gratis → /register.
 *
 * - Desde 1024 px los links van al centro de la píldora. Más angosto no entran junto al tema,
 *   Ingresar y Empezar gratis, y se agrupan en el menú.
 * - En el celu no entran logo, Empezar gratis, tema y menú: el tema va adentro del menú, con el
 *   mismo control que el menú de la cuenta.
 * - `Popover` y no `DropdownMenu`: el control del tema es un `radiogroup`, que por ARIA no puede
 *   vivir dentro de un `role="menu"` (mismo criterio que `AccountMenu`).
 */
export default function BusinessHeader() {
  // Sesión de complejo (staff o superadmin). Sin provider alrededor, el default del contexto da
  // null y el header queda como el de un visitante (stories y tests).
  //
  // Por qué acá: estas son las páginas donde aterriza un dueño de complejo, y su link "Ingresar"
  // → /login era el botón que apretaba alguien que YA tenía la sesión abierta.
  const { staffPanelPath } = usePortalSession()
  const pathname = usePathname() ?? ''
  const condensed = useScrolledPast(8)
  const [menuOpen, setMenuOpen] = useState(false)
  const panelHref = staffPanelPath ?? '/login'
  const panelLabel = staffPanelPath ? 'Ir a mi panel' : 'Ingresar'

  return (
    <header
      data-variant="overlay"
      data-condensed={condensed ? '' : undefined}
      className="portal-top"
    >
      <div className="portal-top__bar" data-align="start">
        <span aria-hidden className="portal-top__bg glass" />
        <span aria-hidden className="portal-top__bg portal-top__bg--on" />
        <Link
          href="/"
          aria-label="TurnoGol, inicio"
          className="portal-top__logo inline-flex min-h-11 shrink-0 items-center rounded-full"
        >
          <Logo variant="horizontal" />
        </Link>
        <nav aria-label="Principal" className="portal-top__nav hidden lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={
                pathname === l.current || pathname.startsWith(`${l.current}/`) ? 'page' : undefined
              }
              className="portal-top__link"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="portal-top__r">
          <ThemeButton className="portal-top__theme glass hidden sm:grid md:border-transparent md:bg-transparent md:bg-none md:shadow-none md:backdrop-filter-none md:hover:bg-portal-inner" />
          <Link href={panelHref} className="portal-top__in hidden lg:inline-flex">
            {panelLabel}
          </Link>
          <Link
            href="/register"
            className={cn(
              buttonVariants({ variant: 'pill', size: 'pill-sm' }),
              'whitespace-nowrap',
            )}
          >
            <span className="sm:hidden">30 días gratis</span>
            <span className="hidden sm:inline">Probar 30 días gratis</span>
          </Link>

          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger
              aria-label="Abrir menú"
              className="glass grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-portal-ink transition-colors duration-(--dur-2) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green md:border-transparent md:bg-transparent md:bg-none md:shadow-none md:backdrop-filter-none md:hover:bg-portal-inner lg:hidden"
            >
              <Menu className="size-5" aria-hidden />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              aria-label="Menú"
              className={cn(
                'glass-pop w-64 rounded-[28px] border-(--glass-line) bg-transparent font-display bg-linear-to-b from-(--portal-sheet-a) to-(--portal-sheet-b) p-2 text-portal-ink',
                'shadow-[inset_0_1px_0_var(--glass-hi),0_30px_70px_-28px_rgb(2_6_23/.6)] backdrop-blur-[30px] backdrop-saturate-180',
              )}
            >
              <nav aria-label="Principal">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={itemClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}
                <Link href={panelHref} className={itemClass} onClick={() => setMenuOpen(false)}>
                  {panelLabel}
                </Link>
              </nav>
              <div className="sm:hidden">
                <div className="my-1.5 h-px bg-portal-inner-line" />
                <div className="px-2 py-1.5">
                  <p className="mb-2 text-sm text-portal-soft">Tema</p>
                  <ThemeToggle variant="glass" />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  )
}
