'use client'

import { m } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Barra de progreso. Existe porque el repo tenía la misma barra hecha a mano en
 * dos lugares (el rail del wizard y la checklist del dashboard), cada una con su
 * propio gradiente y su propia duración.
 *
 * A11y: sin `label` el componente es DECORATIVO (`aria-hidden`). Es el caso normal
 * en el onboarding, donde el texto "Paso 2 de 4 · 50%" ya dice lo mismo y MASTER §7
 * pide un solo indicador por viewport — dos anuncios del mismo dato es ruido para
 * quien usa lector de pantalla, no accesibilidad.
 */
export interface ProgressProps {
  /** 0..100. Se recorta al rango: un cálculo que se pasa no rompe el layout. */
  value: number
  /** Nombre accesible. Si falta, la barra se marca decorativa. */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

const TRACK_SIZE = {
  sm: 'h-1',
  md: 'h-2',
} as const

export function Progress({ value, label, size = 'md', className }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, Math.round(value)))
  const a11y = label
    ? {
        role: 'progressbar' as const,
        'aria-valuenow': pct,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-label': label,
      }
    : { 'aria-hidden': true }

  return (
    <div
      {...a11y}
      className={cn('w-full overflow-hidden rounded-full bg-muted', TRACK_SIZE[size], className)}
    >
      <div
        // bg-primary y no emerald-500 literal: el token ya está calibrado a
        // emerald-700 en light y emerald-500 en dark (MASTER §2.4), así que la
        // barra contrasta contra el track en los dos temas sin tabla aparte.
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * Progreso en segmentos discretos: un tramo por paso, en vez de un porcentaje
 * continuo. Es la forma correcta cuando los pasos son contables y el usuario
 * puede nombrarlos ("me falta el de canchas") — el wizard en mobile.
 *
 * Cada segmento que pasa a "hecho" crece desde la izquierda con resorte (plan
 * de refactor §F, "barra de progreso con spring"): usa `motion`, autorizado
 * SOLO para el onboarding (MASTER §5.1) — único importer hoy es `WizardChrome`.
 * `reducedMotion="user"` del `MotionConfig` del wizard ya cubre
 * `prefers-reduced-motion`, no hace falta repetirlo acá con clases `motion-reduce:`.
 */
export interface SegmentedProgressProps {
  total: number
  /** Cuántos segmentos van pintados (incluye el actual). */
  completed: number
  label?: string
  className?: string
}

export function SegmentedProgress({ total, completed, label, className }: SegmentedProgressProps) {
  const done = Math.min(total, Math.max(0, completed))
  const a11y = label
    ? {
        role: 'progressbar' as const,
        'aria-valuenow': done,
        'aria-valuemin': 0,
        'aria-valuemax': total,
        'aria-label': label,
      }
    : { 'aria-hidden': true }

  return (
    <div {...a11y} className={cn('flex gap-1', className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          {i < done && (
            <m.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              style={{ transformOrigin: 'left' }}
              className="block h-full rounded-full bg-primary"
            />
          )}
        </span>
      ))}
    </div>
  )
}
