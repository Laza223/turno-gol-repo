'use client'

import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useHydrated } from '@/hooks/use-client-value'

const OPTIONS = [
  { value: 'system', label: 'Sistema', Icon: Monitor },
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
] as const

/**
 * Segmented control de tema (Sistema/Claro/Oscuro). Guardia `mounted` porque
 * el tema resuelto solo se conoce client-side: hasta hidratar, render neutro
 * para no romper la hidratación (next-themes).
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useHydrated()

  const current = mounted ? theme : undefined

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la aplicación"
      className="flex w-full gap-1 rounded-xl border border-border/60 bg-muted/20 p-1 overflow-hidden"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={`flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg py-1.5 px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-emerald-500 ${
              active
                ? 'bg-card text-foreground shadow-xs scale-[1.01]'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 transition-all duration-200 ${active ? 'scale-110 text-emerald-500' : 'text-muted-foreground'}`} aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
