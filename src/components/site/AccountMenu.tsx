'use client'

import Link from 'next/link'
import { Calendar, ChevronDown, LogOut, Settings } from 'lucide-react'
import ThemeToggle from '@/components/theme/ThemeToggle'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  firstName: string
  lastName: string
  email: string
  avatarUrl: string | null
  variant?: 'overlay' | 'solid'
}

// Touch-target 44px en mobile (WCAG 2.5.5), 36px en desktop.
const itemClass = 'min-h-11 gap-2.5 md:min-h-9 w-full flex items-center transition-all duration-200'

/**
 * Chip de avatar + nombre con menú desplegable de cuenta (estilo ecommerce).
 * Es la prueba visual de "estás logueado" y la salida hacia las secciones.
 */
export function AccountMenu({ firstName, lastName, email, avatarUrl, variant = 'solid' }: Props) {
  const chip =
    variant === 'overlay'
      ? 'bg-white/15 hover:bg-white/25 ring-white/25 text-white'
      : 'bg-card hover:bg-accent ring-border text-foreground'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta de ${firstName}`}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 ring-1 transition-colors md:h-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
            chip,
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
              {initials(firstName, lastName)}
            </span>
          )}
          <span className="max-w-[8rem] truncate text-sm font-medium">{firstName}</span>
          <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-2">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/20 border border-border/40 mb-1.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-emerald-500/10" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm">
              {initials(firstName, lastName)}
            </span>
          )}
          <div className="flex flex-col min-w-0">
            <p className="truncate text-sm font-semibold text-foreground leading-none mb-1">
              {firstName} {lastName}
            </p>
            <p className="truncate text-xs text-muted-foreground leading-none">{email}</p>
          </div>
        </div>

        <DropdownMenuItem asChild>
          <Link href="/mis-reservas" className={itemClass}>
            <Calendar className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 group-focus:text-emerald-500 transition-colors" aria-hidden />
            <span className="group-hover:translate-x-0.5 transition-transform duration-200">Mis reservas</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracion" className={itemClass}>
            <Settings className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 group-focus:text-emerald-500 transition-colors" aria-hidden />
            <span className="group-hover:translate-x-0.5 transition-transform duration-200">Cuenta</span>
          </Link>
        </DropdownMenuItem>

        <div className="my-1.5 h-px bg-border" />
        <div className="px-2 py-1.5">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tema</p>
          <ThemeToggle />
        </div>

        <div className="my-1.5 h-px bg-border" />

        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className={cn(itemClass, 'w-full text-left')}>
              <LogOut className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 group-focus:text-emerald-500 transition-colors" aria-hidden />
              <span className="group-hover:translate-x-0.5 transition-transform duration-200">Salir</span>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
