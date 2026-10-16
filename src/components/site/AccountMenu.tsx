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
  variant?: 'overlay' | 'solid'
  /**
   * Server Action de cierre de sesión, recibida por PROP (nunca importada
   * como valor acá): `@/modules/auth/sign-out.action` es `'use server'` y
   * arrastra el cliente de Supabase, lo que rompe el bundle de browser de
   * Storybook.
   */
  signOutAction: () => Promise<void>
}

// Ítems planos de 44px en todos los anchos (WCAG 2.5.5): hover y foco cambian el
// fondo, nada se desplaza. El anillo de foco va adentro para que no lo recorte el panel.
const itemClass =
  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-hidden transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
const itemIconClass = 'h-4 w-4 text-muted-foreground'

/**
 * Chip de avatar + nombre con panel desplegable de cuenta (estilo ecommerce).
 * Es la prueba visual de "estás logueado" y la salida hacia las secciones.
 *
 * `Popover`, no `DropdownMenu`: el panel mezcla links de navegación con el
 * `ThemeToggle` (`role="radiogroup"`), que por ARIA no puede vivir dentro de
 * un `role="menu"` (aria-required-children) — un dropdown de navegación con
 * links tampoco es semánticamente un `menu` de aplicación.
 */
export function AccountMenu({
  firstName,
  lastName,
  email,
  avatarUrl,
  variant = 'solid',
  signOutAction,
}: Props) {
  // `solid` es plano: sin ring, sombra ni fondo en reposo; el hover pinta `accent` y el
  // foco es el anillo de la barra (separado con el color de la barra). `-mr-3 pr-2`: el
  // chevron termina a ras del margen, igual que "Ingresar", y el borde no salta al ingresar.
  const chip =
    variant === 'overlay'
      ? 'ring-1 bg-foreground/6 hover:bg-foreground/10 ring-border text-foreground dark:bg-white/15 dark:hover:bg-white/25 dark:ring-white/25 dark:text-white focus-visible:ring-emerald-500 focus-visible:ring-offset-2'
      : '-mr-3 pr-2 md:h-11 text-foreground hover:bg-accent focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:focus-visible:ring-offset-background'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta de ${firstName}`}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors md:h-10 focus-visible:outline-hidden focus-visible:ring-2',
            chip,
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {initials(firstName, lastName)}
            </span>
          )}
          {/* En `solid`, debajo de sm queda el avatar solo (el nombre sigue en el aria-label): con el
              nombre, a 375 px la barra no entra o lo corta con "…". */}
          <span
            className={cn(
              'max-w-32 truncate text-sm font-medium',
              variant === 'solid' && 'hidden sm:block',
            )}
          >
            {firstName}
          </span>
          <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label={`Menú de cuenta de ${firstName}`}
        className="w-72 p-2"
      >
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials(firstName, lastName)}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <p className="truncate text-sm font-semibold text-foreground leading-none mb-1">
              {firstName} {lastName}
            </p>
            <p className="truncate text-[13px] text-muted-foreground leading-none">{email}</p>
          </div>
        </div>
        <div className="my-1.5 h-px bg-border" />

        <Link href="/mis-reservas" className={itemClass}>
          <Calendar className={itemIconClass} aria-hidden />
          Mis reservas
        </Link>
        <Link href="/configuracion" className={itemClass}>
          <Settings className={itemIconClass} aria-hidden />
          Cuenta
        </Link>

        <div className="my-1.5 h-px bg-border" />
        <div className="px-2 py-1.5">
          <p className="mb-2 text-sm text-muted-foreground">Tema</p>
          <ThemeToggle variant="portal" />
        </div>

        <div className="my-1.5 h-px bg-border" />

        <form action={signOutAction}>
          <button type="submit" className={cn(itemClass, 'text-left')}>
            <LogOut className={itemIconClass} aria-hidden />
            Salir
          </button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
