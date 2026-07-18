'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CoachmarkProps {
  /** Valor de `data-tour-id` del elemento ancla (ya presente en el DOM). */
  targetId: string
  /** Copy del globo. ≤90 caracteres, voseo, verbo primero (MASTER §7.1/7.4). */
  text: string
  onDismiss: () => void
  dismissLabel?: string
  /** Chico, en muted, ej. "1 de 3". Se omite si no se pasa. */
  stepLabel?: string
  onSkip?: () => void
  skipLabel?: string
  /**
   * Lado del target donde se ubica el globo. `top` evita tapar contenido que
   * vive inmediatamente DEBAJO del ancla (ej. los ítems pendientes cuando el
   * ancla es el header del checklist).
   */
  placement?: 'bottom' | 'top'
}

type Position = { top: number; left: number }

const VIEWPORT_MARGIN = 12
const CARD_GAP = 8
const FALLBACK_WIDTH = 260

// El render en servidor nunca ejecuta layout effects; el warning de React
// ("useLayoutEffect does nothing on the server") es ruido acá porque el
// componente retorna null hasta que el efecto mide el target — no hay
// mismatch de hidratación posible. El guard lo evita igual (patrón
// isomórfico estándar, usado por varias libs de UI).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Coachmark anclado a un elemento por `[data-tour-id]` (MASTER §7.3): globo
 * `bg-card border shadow-lg rounded-lg p-3 max-w-[260px]` + flecha + botón
 * ghost "Entendido". SIN foco atrapado (`role="status"`, no `dialog`): se
 * puede ignorar y seguir usando el resto de la pantalla (regla §7.1: nunca
 * bloquear el input del usuario).
 *
 * Portal manual a `document.body` en vez de Radix Popover: el ancla es un
 * nodo AJENO al componente (no un trigger-hijo que este mismo controle),
 * justo el caso que Popover no cubre sin un trigger propio.
 *
 * Si el target no existe en el DOM, no renderiza nada — el padre
 * (`useCoachmarkTour`) es quien decide saltear al siguiente paso.
 */
export function Coachmark({
  targetId,
  text,
  onDismiss,
  dismissLabel = 'Entendido',
  stepLabel,
  onSkip,
  skipLabel = 'Omitir recorrido',
  placement = 'bottom',
}: CoachmarkProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  useIsomorphicLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tour-id="${targetId}"]`)
    if (!target) {
      setPosition(null)
      return
    }

    function recompute() {
      if (!target) return
      const rect = target.getBoundingClientRect()
      const cardWidth = cardRef.current?.offsetWidth ?? FALLBACK_WIDTH
      const rawLeft = rect.left + window.scrollX
      const minLeft = window.scrollX + VIEWPORT_MARGIN
      const maxLeft = window.scrollX + window.innerWidth - cardWidth - VIEWPORT_MARGIN
      setPosition({
        // `top`: el wrapper lleva `-translate-y-full`, así que alcanza con
        // anclar al borde superior del target — CSS resta la altura propia
        // del globo sin tener que medirla.
        top:
          placement === 'top'
            ? rect.top + window.scrollY - CARD_GAP
            : rect.bottom + window.scrollY + CARD_GAP,
        left: Math.max(minLeft, Math.min(rawLeft, maxLeft)),
      })
    }

    recompute()
    window.addEventListener('resize', recompute, { passive: true })
    window.addEventListener('scroll', recompute, { passive: true })
    const observer = new ResizeObserver(recompute)
    observer.observe(target)

    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute)
      observer.disconnect()
    }
  }, [targetId, placement])

  if (!position) return null

  return createPortal(
    <div
      className={cn('absolute z-50', placement === 'top' && '-translate-y-full')}
      style={{ top: position.top, left: position.left }}
    >
      <div className="relative">
        {/* Flecha: cuadrado rotado 45° con solo dos bordes visibles,
            apuntando hacia el target (arriba o abajo de la card según
            placement). */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute left-6 h-3 w-3 rotate-45 border-border bg-card',
            placement === 'top'
              ? '-bottom-[7px] border-b border-r'
              : '-top-[7px] border-l border-t',
          )}
        />
        <div
          ref={cardRef}
          role="status"
          aria-live="polite"
          className={cn(
            'max-w-[260px] rounded-lg border border-border bg-card p-3 shadow-lg',
            'animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none',
          )}
        >
          {stepLabel && <p className="mb-1 text-xs text-muted-foreground">{stepLabel}</p>}
          <p className="text-sm text-foreground">{text}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            {onSkip ? (
              <button
                type="button"
                onClick={onSkip}
                className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {skipLabel}
              </button>
            ) : (
              <span />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-auto px-2 py-1 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-500 dark:hover:text-emerald-400"
            >
              {dismissLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
