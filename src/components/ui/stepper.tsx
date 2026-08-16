'use client'

import { Check } from 'lucide-react'
import { m } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Lista de pasos de un flujo multi-paso, donde la lista MISMA es el indicador de
 * progreso (check = hecho, punto lleno = actual, número = pendiente). Estaba
 * hardcodeada dentro de `WizardShell`; acá queda disponible para cualquier flujo.
 *
 * Semántica: `<ol>` + `aria-current="step"` en el actual. El estado no se comunica
 * solo con color (MASTER §1.4): el tilde y el número son la señal, el color acompaña.
 *
 * Usa `motion` (el tilde hace scale-in al completarse, plan de refactor §F):
 * MASTER §5.1 lo autoriza SOLO para el onboarding, no para superficies de tarea
 * diaria. Hoy este componente es exclusivo del wizard (único importer:
 * `WizardChrome`) — si algún día se reusa en una pantalla de uso diario, ESA es
 * la señal para separar la versión animada de una versión CSS-only.
 */
export interface StepperStep {
  /** 1-based. Es el número que se muestra mientras el paso está pendiente. */
  n: number
  label: string
  /** Segunda línea opcional: qué se hace en ese paso. */
  hint?: string
}

export interface StepperProps {
  steps: readonly StepperStep[]
  /** Paso actual (1-based). Un valor mayor al último marca todo como completado. */
  current: number
  /**
   * `on-dark` para superficies de marca always-dark (el rail del wizard), donde
   * los tokens theme-adaptive no aplican porque el fondo no sigue al tema.
   */
  tone?: 'default' | 'on-dark'
  className?: string
}

const TONE = {
  default: {
    done: 'bg-primary/15 text-primary',
    current: 'bg-primary text-primary-foreground',
    pending: 'border border-border text-muted-foreground',
    labelCurrent: 'font-semibold text-foreground',
    labelDone: 'text-foreground/80',
    labelPending: 'text-muted-foreground',
    // Sin `/70`: aplicar opacidad sobre un token ya calibrado lo saca de AA
    // (medido por axe: 3.09:1 con #778395 sobre #e2e7ee). En el tono claro la
    // jerarquía la lleva el label —peso y color—, no el hint.
    hintCurrent: 'text-muted-foreground',
    hintOther: 'text-muted-foreground',
  },
  // Medido sobre slate-950 (#020617), que es la base del rail. El wizard traía
  // slate-500/slate-600 acá: 4.2:1 y 2.6:1 — abajo del 4.5:1 que pide AA para
  // texto chico. Nadie lo había visto porque axe no mide contraste sobre un
  // gradiente. La jerarquía la dan el peso y el tamaño, no la luminosidad.
  'on-dark': {
    done: 'bg-emerald-500/20 text-emerald-400',
    current: 'bg-emerald-500 text-slate-950',
    pending: 'border border-slate-600 text-slate-400',
    labelCurrent: 'font-semibold text-white',
    labelDone: 'text-slate-300', // 11.7:1
    labelPending: 'text-slate-400', // 7.5:1
    hintCurrent: 'text-slate-300',
    hintOther: 'text-slate-400',
  },
} as const

export function Stepper({ steps, current, tone = 'default', className }: StepperProps) {
  const t = TONE[tone]

  return (
    <ol className={cn('space-y-5', className)}>
      {steps.map((step) => {
        const done = current > step.n
        const isCurrent = current === step.n

        return (
          <li
            key={step.n}
            aria-current={isCurrent ? 'step' : undefined}
            className="flex items-start gap-3"
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                done && t.done,
                isCurrent && t.current,
                !done && !isCurrent && t.pending,
              )}
            >
              {done ? (
                <m.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17, duration: 0.3 }}
                  className="flex"
                >
                  <Check className="h-4 w-4" aria-hidden />
                </m.span>
              ) : (
                step.n
              )}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-sm',
                  isCurrent ? t.labelCurrent : done ? t.labelDone : t.labelPending,
                )}
              >
                {step.label}
                {/* El estado también se lee, no solo se ve (MASTER §1.4). */}
                {done && <span className="sr-only"> (completado)</span>}
              </span>
              {step.hint ? (
                <span className={cn('block text-xs', isCurrent ? t.hintCurrent : t.hintOther)}>
                  {step.hint}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
