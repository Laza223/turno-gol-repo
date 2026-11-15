'use client'

import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useHydrated } from '@/hooks/use-client-value'
import { SegmentedControl } from '@/components/ui/segmented-control'

const OPTIONS = [
  { value: 'system', label: 'Sistema', Icon: Monitor },
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
] as const

type ThemeValue = (typeof OPTIONS)[number]['value']

const GLASS_OPTIONS = OPTIONS.map(({ value, label }) => ({ value, label }))

const isThemeValue = (v: string | undefined): v is ThemeValue => OPTIONS.some((o) => o.value === v)

/**
 * Segmented control de tema (Sistema/Claro/Oscuro). Guardia `mounted` porque
 * el tema resuelto solo se conoce client-side: hasta hidratar, render neutro
 * para no romper la hidratación (next-themes).
 *
 * `glass`: el control segmentado del portal de vidrio (decisión 2026-11-13), con una píldora que
 * se desliza a la opción elegida. Lo usan el menú de la cuenta (cromo, F1) y `/configuracion` (F6).
 * `portal` sigue igual: lo usa el cajón del panel en el celu.
 */
export default function ThemeToggle({
  variant = 'panel',
}: {
  variant?: 'panel' | 'portal' | 'glass'
}) {
  const portal = variant === 'portal'
  const { theme, setTheme } = useTheme()
  const mounted = useHydrated()

  const current = mounted ? theme : undefined

  if (variant === 'glass') {
    return (
      <SegmentedControl
        variant="glass"
        aria-label="Tema de la aplicación"
        value={isThemeValue(current) ? current : undefined}
        onValueChange={setTheme}
        options={GLASS_OPTIONS}
        className="w-full"
      />
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la aplicación"
      className={
        portal
          ? 'flex w-full gap-1 rounded-xl border border-border p-1'
          : 'flex w-full gap-1 rounded-xl border border-border/60 bg-muted/20 p-1 overflow-hidden'
      }
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
            className={
              portal
                ? // Portal (La Reserva): plano, 44 px, 14 px y un solo estado activo (relleno `accent`
                  // + semibold, sin borde verde: el verde es solo del foco); sin íconos, sin sombra ni escala; foco inset con `primary`.
                  `flex min-h-11 flex-1 items-center justify-center rounded-lg border px-1 text-sm whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                    active
                      ? 'border-transparent bg-accent font-semibold text-foreground'
                      : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
                  }`
                : `flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg py-1.5 px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-emerald-500 ${
                    active
                      ? 'bg-card text-foreground shadow-xs scale-[1.01]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`
            }
          >
            {!portal && (
              <Icon
                className={`h-3.5 w-3.5 shrink-0 transition-all duration-200 ${active ? 'scale-110 text-emerald-500' : 'text-muted-foreground'}`}
                aria-hidden
              />
            )}
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
