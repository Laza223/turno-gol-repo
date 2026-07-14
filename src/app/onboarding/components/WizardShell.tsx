import { Check } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

// Los 4 pasos del wizard (pages/onboarding.md §2). El orden importa: los
// precios del paso Canchas se generan sobre los horarios ya confirmados.
const WIZARD_STEPS = [
  { n: 1, label: 'Tu complejo', hint: 'Nombre y ubicación' },
  { n: 2, label: 'Horarios', hint: 'Cuándo abrís' },
  { n: 3, label: 'Canchas', hint: 'Canchas y precios' },
  { n: 4, label: 'Señas', hint: 'Cobro online' },
] as const

type Props = {
  /** 1..4 = paso visible; 5 = pantalla de cierre (todos completados). */
  currentStep: number
  /** Ancho de la columna de contenido (el paso Canchas necesita más aire). */
  wide?: boolean
  children: React.ReactNode
}

/**
 * Shell del wizard (pages/onboarding.md §3): rail de marca always-dark a la
 * izquierda (continuidad con /register y /login) cuya lista de pasos ES el
 * indicador de progreso en desktop; en mobile, una única barra segmentada.
 * Un indicador por viewport — cierra la deuda MASTER §13.7.
 */
export function WizardShell({ currentStep, wide = false, children }: Props) {
  const pct = Math.round((Math.min(currentStep, 4) / 4) * 100)
  const progressLabel = currentStep > 4 ? '¡Listo!' : `Paso ${currentStep} de 4 · ${pct}%`

  return (
    <div className="grid min-h-dvh lg:grid-cols-[380px_1fr]">
      {/* Rail de marca: superficie always-dark (como el pane de register), no
          vista de tarea — por eso colores literales y no tokens theme-adaptive. */}
      <aside className="sticky top-0 self-start h-dvh relative hidden overflow-hidden bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-emerald-400/5 blur-3xl" />

        <div className="relative">
          <Logo variant="horizontal" textClassName="text-white" />
        </div>

        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 tabular-nums">
            {progressLabel}
          </p>
          <ol className="mt-5 space-y-5">
            {WIZARD_STEPS.map((step) => {
              const done = currentStep > step.n
              const current = currentStep === step.n
              return (
                <li
                  key={step.n}
                  aria-current={current ? 'step' : undefined}
                  className="flex items-start gap-3"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                      done && 'bg-emerald-500/20 text-emerald-400',
                      current && 'bg-emerald-500 text-slate-950',
                      !done && !current && 'border border-slate-700 text-slate-500',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" aria-hidden /> : step.n}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-sm',
                        current ? 'font-semibold text-white' : done ? 'text-slate-300' : 'text-slate-500',
                      )}
                    >
                      {step.label}
                    </span>
                    <span className={cn('block text-xs', current ? 'text-slate-400' : 'text-slate-600')}>
                      {step.hint}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Anti-ansiedad (doc10 §4): cuánto falta y que nada es irreversible. */}
        <p className="relative text-xs leading-relaxed text-slate-400">
          Menos de 5 minutos. Todo se puede cambiar después desde Configuración.
        </p>
      </aside>

      <main className="bg-background">
        {/* Header mobile: el ÚNICO indicador en pantallas chicas. */}
        <header className="border-b border-border px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <Logo variant="horizontal" textClassName="text-foreground" className="[&>span]:text-xl" />
            <p className="text-xs font-medium text-muted-foreground tabular-nums">{progressLabel}</p>
          </div>
          <div className="mt-2.5 flex gap-1" role="presentation">
            {WIZARD_STEPS.map((step) => (
              <div
                key={step.n}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  currentStep >= step.n ? 'bg-emerald-500' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </header>

        <div className="flex justify-center px-4 py-8 md:py-12">
          <div className={cn('w-full', wide ? 'max-w-2xl' : 'max-w-lg')}>{children}</div>
        </div>
      </main>
    </div>
  )
}
