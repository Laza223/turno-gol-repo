'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ThemeToggle from '@/components/theme/ThemeToggle'

/**
 * Switch de tema para el header admin. Botón compacto (icono = tema activo)
 * que abre un dropdown glass con el `ThemeToggle` (Sistema/Claro/Oscuro)
 * reutilizado del portal. Guard `mounted`: el tema resuelto solo se conoce
 * client-side (next-themes).
 */
export function AdminThemeMenu() {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const Icon = !mounted
    ? Sun
    : theme === 'system'
      ? Monitor
      : resolvedTheme === 'dark'
        ? Moon
        : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Cambiar tema"
          className="inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-card hover:text-foreground hover:border-emerald-500/30 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 p-2">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tema
        </p>
        <ThemeToggle />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
