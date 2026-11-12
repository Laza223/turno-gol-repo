'use client'

import { useState, useTransition } from 'react'
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu'
import { cn } from '@/lib/utils'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import type { WizardActionResult } from '../actions'
import { useWizardNavigation } from './use-wizard-navigation'
import { StepScreen } from './StepScreen'

type Props = {
  /** Horas con las que arranca el paso. 08 a 00 si el complejo no tiene otras. */
  initialOpenHour?: number
  initialCloseHour?: number
  action: (input: { openHour: number; closeHour: number }) => Promise<WizardActionResult>
  /** "Atrás" desde la primera pantalla. Sin esto vuelve al paso anterior del wizard por ruta. */
  onBack?: () => void
}

const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** Se abre desde las 05 hasta las 23. */
const OPEN_HOURS = Array.from({ length: 19 }, (_, i) => i + 5)

/** El cierre tiene que ser después de la apertura, o de madrugada (hasta las 04). */
function closeHoursFor(openHour: number): number[] {
  const sameDay = Array.from({ length: 23 - openHour }, (_, i) => openHour + 1 + i)
  return [...sameDay, 0, 1, 2, 3, 4]
}

function closeLabel(hour: number): string {
  if (hour === 0) return '00:00 (medianoche)'
  if (hour <= 4) return `${hh(hour)} (de la madrugada)`
  return hh(hour)
}

/**
 * Una pantalla: dos selects de hora entera. El mismo horario para los 7 días; el
 * que es distinto un día se cambia después en Ajustes. Cerrar de madrugada (01 a 04)
 * es válido y el server lo guarda como cierre pasada la medianoche.
 */
export function StepHorarios({ initialOpenHour = 8, initialCloseHour = 0, action, onBack }: Props) {
  const [openHour, setOpenHour] = useState(initialOpenHour)
  const [closeHour, setCloseHour] = useState(initialCloseHour)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const navigate = useWizardNavigation()

  const closeOptions = closeHoursFor(openHour)
  const openOptions: SelectMenuOption[] = OPEN_HOURS.map((h) => ({
    value: String(h),
    label: hh(h),
  }))
  const closeMenuOptions: SelectMenuOption[] = closeOptions.map((h) => ({
    value: String(h),
    label: closeLabel(h),
  }))

  function changeOpen(value: string) {
    const next = Number(value)
    setError(null)
    setOpenHour(next)
    // Si el cierre elegido deja de ser posible, se acomoda al más cercano.
    if (!closeHoursFor(next).includes(closeHour)) setCloseHour(0)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await action({ openHour, closeHour })
      if (!result.success) {
        startTransition(() => setError(result.error))
        return
      }
      navigate(result)
    })
  }

  return (
    <StepScreen
      title="¿A qué hora abrís y cerrás?"
      accent="abrís y cerrás"
      description="Si un día es distinto, lo cambiás después."
      onNext={submit}
      isPending={isPending}
      error={error}
      onBack={onBack}
      backHref={stepPath(2)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="horarios-open"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Abrís a las
          </label>
          <SelectMenu
            id="horarios-open"
            value={String(openHour)}
            onChange={changeOpen}
            options={openOptions}
          />
        </div>
        <div>
          <label
            htmlFor="horarios-close"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Cerrás a las
          </label>
          <SelectMenu
            id="horarios-close"
            value={String(closeHour)}
            onChange={(v) => {
              setError(null)
              setCloseHour(Number(v))
            }}
            options={closeMenuOptions}
          />
        </div>
      </div>

      <DayStrip openHour={openHour} closeHour={closeHour} />
    </StepScreen>
  )
}

/** Abierto a esa hora (0-23), con el cierre de madrugada (01 a 04) del día operativo. */
function isOpenAt(hour: number, openHour: number, closeHour: number): boolean {
  if (closeHour === 0) return hour >= openHour
  if (closeHour <= 4) return hour >= openHour || hour < closeHour
  return hour >= openHour && hour < closeHour
}

/** El día en 24 tramos: lo abierto en esmeralda. Decorativo; las horas ya las dicen los selects. */
function DayStrip({ openHour, closeHour }: { openHour: number; closeHour: number }) {
  const lateClose = closeHour >= 1 && closeHour <= 4
  return (
    <div className="mt-6" aria-hidden>
      <div className="flex h-8 gap-0.5 overflow-hidden rounded-lg">
        {Array.from({ length: 24 }, (_, hour) => (
          <span
            key={hour}
            className={cn(
              'flex-1 transition-colors duration-200',
              isOpenAt(hour, openHour, closeHour) ? 'bg-emerald-400/80' : 'bg-white/6',
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      {lateClose && <p className="mt-2 text-sm text-emerald-300">Cerrás pasada la medianoche.</p>}
    </div>
  )
}
