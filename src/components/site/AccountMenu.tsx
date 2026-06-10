'use client'

import Link from 'next/link'
import { Calendar, ChevronDown, LogOut, Settings } from 'lucide-react'
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
const itemClass = 'min-h-11 cursor-pointer gap-2 md:min-h-9'

/**
 * Chip de avatar + nombre con menú desplegable de cuenta (estilo ecommerce).
 * Es la prueba visual de "estás logueado" y la salida hacia las secciones.
 */
export function AccountMenu({ firstName, lastName, email, avatarUrl, variant = 'solid' }: Props) {
  const chip =
    variant === 'overlay'
      ? 'bg-white/15 hover:bg-white/25 ring-white/25 text-white'
      : 'bg-white hover:bg-slate-50 ring-slate-200 text-slate-700'

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

      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-semibold text-slate-900">
            {firstName} {lastName}
          </p>
          <p className="truncate text-xs text-slate-500">{email}</p>
        </div>
        <div className="my-1 h-px bg-slate-100" />

        <DropdownMenuItem asChild>
          <Link href="/mis-reservas" className={itemClass}>
            <Calendar className="h-4 w-4 text-slate-500" aria-hidden />
            Mis reservas
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracion" className={itemClass}>
            <Settings className="h-4 w-4 text-slate-500" aria-hidden />
            Cuenta
          </Link>
        </DropdownMenuItem>

        <div className="my-1 h-px bg-slate-100" />

        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className={cn(itemClass, 'w-full text-left')}>
              <LogOut className="h-4 w-4 text-slate-500" aria-hidden />
              Salir
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
