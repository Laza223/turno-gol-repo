'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import {
  LazyMotion,
  animate,
  m,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from 'motion/react'
import { X } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-client-value'
import { cn } from '@/lib/utils'

/** Arrastre: `domMax` llega en diferido, recién cuando se monta una hoja (dirección §4.2). */
const loadDragFeatures = () => import('./motion-drag-features').then((mod) => mod.default)

/** Resorte "hoja" de la dirección (§4.3): rigidez 320, amortiguación 32, masa 1. */
const SPRING_HOJA = { type: 'spring', stiffness: 320, damping: 32, mass: 1 } as const

type GlassSheetContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
  'asChild' | 'title'
> & {
  /** Título visible de la hoja (y su nombre accesible). */
  title: React.ReactNode
}

/**
 * Hoja de abajo del portal de vidrio, sobre el `Sheet` de `sheet.tsx` (Radix Dialog: foco
 * atrapado, Esc, scroll bloqueado y el foco vuelve al botón que la abrió). Se usa como
 * `<Sheet open onOpenChange><GlassSheetContent title="…">…</GlassSheetContent></Sheet>`.
 *
 * - En el celu sube desde abajo con el resorte hoja y se arrastra desde la manija o la cabecera
 *   (no desde el cuerpo, que scrollea). Se cierra si se arrastra más de un tercio de su alto o si
 *   se suelta con velocidad hacia abajo; si no, vuelve a su lugar con el mismo resorte.
 * - Desde `md` es un panel centrado, sin arrastre.
 * - Con "reducir movimiento": fundido de 150 ms y sin arrastre (globals.css).
 * - Mientras está abierta, la barra de abajo baja y sale (`[data-glass-sheet]` en globals.css).
 *
 * Archivo aparte de `sheet.tsx` a propósito: el panel importa `sheet.tsx` y no tiene que cargar
 * nada de `motion`.
 */
const GlassSheetContent = React.forwardRef<HTMLDivElement, GlassSheetContentProps>(
  ({ title, className, children, ...props }, ref) => {
    const reduce = useReducedMotion()
    const mobile = useMediaQuery('(width < 48rem)', false)
    const canDrag = mobile && !reduce
    const controls = useDragControls()
    const y = useMotionValue(0)
    const sheetRef = React.useRef<HTMLDivElement | null>(null)
    const closeRef = React.useRef<HTMLButtonElement>(null)

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        sheetRef.current = node
        // Este componente sobrevive al cierre (Radix solo desmonta lo de adentro del portal): si
        // se cerró arrastrando, `y` quedó donde la soltaron. Cada apertura arranca en su lugar.
        if (node) y.set(0)
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref, y],
    )

    return (
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="glass-sheet-backdrop" />
        <LazyMotion features={loadDragFeatures} strict>
          <SheetPrimitive.Content asChild aria-describedby={undefined} {...props}>
            <m.div
              ref={setRefs}
              data-glass-sheet
              className={cn('glass-sheet', className)}
              style={{ y }}
              drag={canDrag ? 'y' : false}
              dragControls={controls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 1 }}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                const height = sheetRef.current?.offsetHeight ?? 0
                if (info.offset.y > height / 3 || info.velocity.y > 600) {
                  // Cierra el mismo botón que se ve: Radix devuelve el foco al disparador.
                  closeRef.current?.click()
                } else {
                  animate(y, 0, SPRING_HOJA)
                }
              }}
            >
              <div
                className="glass-sheet__grab"
                onPointerDown={(e) => {
                  if (canDrag) controls.start(e)
                }}
              >
                <div className="flex items-center justify-between gap-3 pb-1">
                  <SheetPrimitive.Title className="text-2xl leading-tight font-bold tracking-[-0.025em] text-portal-ink [font-stretch:104%]">
                    {title}
                  </SheetPrimitive.Title>
                  <SheetPrimitive.Close
                    ref={closeRef}
                    aria-label="Cerrar"
                    // El botón no arrastra: si no, tocarlo empezaría un arrastre.
                    onPointerDown={(e) => e.stopPropagation()}
                    className="grid size-11 shrink-0 place-items-center rounded-full border border-portal-inner-line bg-portal-inner text-portal-ink transition-[scale] duration-(--dur-1) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green active:scale-[.96] motion-reduce:active:scale-100"
                  >
                    <X className="size-5" aria-hidden />
                  </SheetPrimitive.Close>
                </div>
              </div>
              <div className="glass-sheet__body">{children}</div>
            </m.div>
          </SheetPrimitive.Content>
        </LazyMotion>
      </SheetPrimitive.Portal>
    )
  },
)
GlassSheetContent.displayName = 'GlassSheetContent'

export { GlassSheetContent }
