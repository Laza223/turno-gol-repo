'use client'

import Link from 'next/link'
import { Calendar, ChevronDown, LogOut, Settings } from 'lucide-react'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  firstName: string
  lastName: string
  email: string
  avatarUrl: string | null
  /**
   * Server Action de cierre de sesión, recibida por PROP (nunca importada
   * como valor acá): `@/modules/auth/sign-out.action` es `'use server'` y
   * arrastra el cliente de Supabase, lo que rompe el bundle de browser de
   * Storybook.
   */
  signOutAction: () => Promise<void>
}

// Touch-target 44px (WCAG 2.5.5). `group` habilita el desplazamiento del ícono/label en hover.
const itemClass =
  'group relative flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-[15px] text-portal-ink outline-hidden transition-colors duration-(--dur-2) hover:bg-portal-inner focus-visible:bg-portal-inner focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-portal-green'

const iconClass =
  'h-4 w-4 text-portal-soft transition-colors group-hover:text-portal-green group-focus-visible:text-portal-green'

/**
 * Chip de avatar + nombre con panel desplegable de cuenta (estilo ecommerce).
 * Es la prueba visual de "estás logueado" y la salida hacia las secciones.
 * Portal de vidrio (decisión 2026-11-13): el chip es la píldora interior de la cabecera y el panel
 * es vidrio real (relleno de la hoja, casi opaco: pasa contenido por detrás).
 *
 * `Popover`, no `DropdownMenu`: el panel mezcla links de navegación con el
 * `ThemeToggle` (`role="radiogroup"`), que por ARIA no puede vivir dentro de
 * un `role="menu"` (aria-required-children) — un dropdown de navegación con
 * links tampoco es semánticamente un `menu` de aplicación.
 */
export function AccountMenu({ firstName, lastName, email, avatarUrl, signOutAction }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta de ${firstName}`}
          className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-portal-inner-line bg-portal-inner py-1 pr-3.5 pl-1 text-portal-ink transition-colors duration-(--dur-2) hover:bg-portal-bar-on focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            // Iniciales por CSS (`content: attr()`): no son texto del DOM, así que el nombre
            // accesible "Cuenta de X" contiene todo lo visible (WCAG 2.5.3).
            <span
              aria-hidden
              data-initials={initials(firstName, lastName)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-b from-(--portal-btn-a) to-(--portal-btn-b) text-xs font-semibold text-portal-on-green before:content-[attr(data-initials)]"
            />
          )}
          {/* Entre 768 y 1023 px la píldora no tiene lugar para el nombre: queda el avatar. El nombre
            accesible ("Cuenta de X") no cambia. */}
          <span className="hidden max-w-32 truncate text-[15px] font-semibold lg:block">
            {firstName}
          </span>
          <ChevronDown className="h-4 w-4 text-portal-soft" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        aria-label={`Menú de cuenta de ${firstName}`}
        className={cn(
          'glass-pop w-76 rounded-[28px] border-(--glass-line) bg-transparent font-display bg-linear-to-b from-(--portal-sheet-a) to-(--portal-sheet-b) p-2 text-portal-ink',
          'shadow-[inset_0_1px_0_var(--glass-hi),0_30px_70px_-28px_rgb(2_6_23/.6)] backdrop-blur-[30px] backdrop-saturate-180',
        )}
      >
        <div className="mb-1.5 flex items-center gap-3 rounded-[20px] border border-portal-inner-line bg-portal-inner px-3 py-2.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-(--portal-btn-a) to-(--portal-btn-b) text-sm font-bold text-portal-on-green">
              {initials(firstName, lastName)}
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <p className="mb-1 truncate text-[15px] leading-none font-semibold">
              {firstName} {lastName}
            </p>
            <p className="truncate text-[13px] leading-none text-portal-soft">{email}</p>
          </div>
        </div>

        <Link href="/mis-reservas" className={itemClass}>
          <Calendar className={iconClass} aria-hidden />
          <span className="transition-transform duration-(--dur-2) group-hover:translate-x-0.5">
            Mis reservas
          </span>
        </Link>
        <Link href="/configuracion" className={itemClass}>
          <Settings className={iconClass} aria-hidden />
          <span className="transition-transform duration-(--dur-2) group-hover:translate-x-0.5">
            Cuenta
          </span>
        </Link>

        <div className="my-1.5 h-px bg-portal-inner-line" />
        <div className="px-2 py-1.5">
          <p className="mb-2 text-sm text-portal-soft">Tema</p>
          <ThemeToggle variant="glass" />
        </div>

        <div className="my-1.5 h-px bg-portal-inner-line" />

        <form action={signOutAction}>
          <button type="submit" className={cn(itemClass, 'text-left')}>
            <LogOut className={iconClass} aria-hidden />
            <span className="transition-transform duration-(--dur-2) group-hover:translate-x-0.5">
              Salir
            </span>
          </button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
