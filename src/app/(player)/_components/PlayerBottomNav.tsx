'use client'

import { Calendar, Settings, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/mis-reservas', label: 'Reservas', Icon: Calendar },
  { href: '/perfil', label: 'Perfil', Icon: User },
  { href: '/configuracion', label: 'Cuenta', Icon: Settings },
]

export function PlayerBottomNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Navegación del jugador" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-10 pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors duration-150 ${
              active ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
