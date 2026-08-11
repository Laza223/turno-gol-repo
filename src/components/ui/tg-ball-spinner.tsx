import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

interface TgBallSpinnerProps extends ComponentPropsWithoutRef<'div'> {
  /** Tamaño del spinner. `xs` (16px) es la variante inline para botones: rebote corto. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Label de accesibilidad. */
  label?: string
  /** Texto debajo del spinner (ej. "Cargando reservas…"). */
  text?: string
}

const SIZE_MAP = {
  xs: { ball: 'h-4 w-4', text: 'text-xs', tg: 'text-[7px]' },
  sm: { ball: 'h-8 w-8', text: 'text-xs', tg: 'text-[7px]' },
  md: { ball: 'h-12 w-12', text: 'text-sm', tg: 'text-[10px]' },
  lg: { ball: 'h-16 w-16', text: 'text-base', tg: 'text-sm' },
} as const

/**
 * Spinner branded de TurnoGol: pelotita de fútbol SVG con el monograma "TG"
 * en el centro. Rebota suavemente (bounce) y rota sobre su eje.
 *
 * Usa CSS puro — sin JS, sin requestAnimationFrame. El bounce y rotation
 * se combinan con `animation-composition: accumulate` para que ambas
 * animaciones corran simultáneamente sin conflicto.
 *
 * Performance: SVG inline (no raster), animaciones en `transform` (GPU-composited),
 * `will-change: transform` para promover al compositor. Se desactiva
 * automáticamente con `prefers-reduced-motion: reduce`.
 */
export function TgBallSpinner({
  size = 'md',
  label = 'Cargando…',
  text,
  className,
  ...rest
}: TgBallSpinnerProps) {
  const s = SIZE_MAP[size]
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('flex flex-col items-center justify-center gap-3', className)}
      {...rest}
    >
      <div
        className={cn('tg-ball-spinner', size === 'xs' && 'tg-ball-spinner-xs', s.ball)}
        aria-hidden="true"
      >
        {/* Pelota de fútbol SVG — pentágonos estilizados + monograma TG */}
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full drop-shadow-lg"
        >
          {/* Cuerpo de la pelota */}
          <circle
            cx="32"
            cy="32"
            r="30"
            fill="white"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-emerald-600 dark:text-emerald-400"
          />
          {/* Patrón de pentágonos de fútbol — simplificado y estilizado */}
          <g className="text-emerald-600/20 dark:text-emerald-400/20" fill="currentColor">
            {/* Pentágono central (arriba) */}
            <polygon points="32,8 38,16 35,24 29,24 26,16" />
            {/* Pentágonos laterales */}
            <polygon points="52,22 54,32 48,38 42,34 44,24" />
            {/* Pentágonos inferiores */}
            <polygon points="44,46 38,50 32,56 26,50 20,46 24,40 40,40" />
          </g>
          {/* Líneas de costura */}
          <g
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
            className="text-emerald-700/25 dark:text-emerald-300/25"
          >
            <line x1="32" y1="8" x2="32" y2="2" />
            <line x1="38" y1="16" x2="48" y2="10" />
            <line x1="26" y1="16" x2="16" y2="10" />
            <line x1="52" y1="22" x2="58" y2="18" />
            <line x1="12" y1="22" x2="6" y2="18" />
            <line x1="54" y1="32" x2="62" y2="32" />
            <line x1="10" y1="32" x2="2" y2="32" />
            <line x1="48" y1="38" x2="56" y2="46" />
            <line x1="16" y1="38" x2="8" y2="46" />
            <line x1="44" y1="46" x2="50" y2="54" />
            <line x1="20" y1="46" x2="14" y2="54" />
            <line x1="32" y1="56" x2="32" y2="62" />
          </g>
          {/* Monograma TG — centrado, bold, italic */}
          <text
            x="32"
            y="36"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-emerald-700 dark:fill-emerald-300"
            fontFamily="var(--font-display), system-ui, sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="14"
            letterSpacing="-0.5"
          >
            TG
          </text>
        </svg>
      </div>
      {text && (
        <p className={cn('font-medium text-muted-foreground animate-pulse', s.text)}>{text}</p>
      )}
    </div>
  )
}
