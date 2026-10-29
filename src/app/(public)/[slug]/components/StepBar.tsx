import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export const RESERVE_STEPS = 3

/**
 * La barra del paso: "Volver" (solo desde el 2), "Paso N de 3" y tres segmentos. Debajo de lg es
 * pegajosa justo bajo la barra de TurnoGol (80 px: `py-3` + pill de `h-14`), con fondo opaco para
 * tapar lo que pasa por debajo y sangrada hasta el borde de la pantalla. La fila tiene alto fijo
 * aun sin el botón, así que no salta al pasar del paso 1 al 2. Los segmentos son spans, no
 * `SegmentedProgress`: ese importa `motion`, que DESIGN.md deja solo para /onboarding.
 */
export default function StepBar({ step, onBack }: { step: number; onBack?: () => void }) {
  return (
    <div className="sticky top-20 z-10 -mx-4 bg-background px-4 pb-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:px-0">
      <div className="flex min-h-11 items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1 text-base font-semibold text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronLeft className="size-5" aria-hidden />
            Volver
          </button>
        ) : (
          <span />
        )}
        <p className="text-sm font-semibold tabular-nums text-muted-foreground">
          Paso {step} de {RESERVE_STEPS}
        </p>
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {Array.from({ length: RESERVE_STEPS }, (_, i) => (
          <span
            key={i}
            className={cn('h-1.5 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-input')}
          />
        ))}
      </div>
    </div>
  )
}
