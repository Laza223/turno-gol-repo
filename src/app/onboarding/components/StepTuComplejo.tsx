'use client'

import { useState, useTransition } from 'react'
import { MessageCircle, NotebookPen, Smartphone, Sparkles, ThumbsUp, X } from 'lucide-react'
import { ChoiceCards, type ChoiceOption } from '@/components/ui/choice-cards'
import type { WizardProfileInput } from '@/modules/onboarding/onboarding.schema'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import type { WizardActionResult } from '../actions'
import { useWizardNavigation } from './use-wizard-navigation'
import { StepScreen } from './StepScreen'

type Intake = WizardProfileInput['bookingIntake']
type YesNo = 'yes' | 'no'

const INTAKE_OPTIONS: readonly ChoiceOption<Intake>[] = [
  { value: 'notebook', label: 'En un cuaderno o planilla', icon: <NotebookPen /> },
  { value: 'whatsapp', label: 'Por WhatsApp', icon: <MessageCircle /> },
  { value: 'other_app', label: 'Con otra app', icon: <Smartphone /> },
  { value: 'new', label: 'Recién abro', icon: <Sparkles /> },
]

const YES_NO: readonly ChoiceOption<YesNo>[] = [
  { value: 'yes', label: 'Sí', icon: <ThumbsUp /> },
  { value: 'no', label: 'No', icon: <X /> },
]

type Props = {
  /** Respuestas ya guardadas (revisita). */
  initial?: Partial<{ bookingIntake: Intake; hasFixedTeams: boolean; canteenEnabled: boolean }>
  action: (input: WizardProfileInput) => Promise<WizardActionResult>
  /** "Atrás" desde la primera pantalla. Sin esto vuelve al paso anterior del wizard por ruta. */
  onBack?: () => void
}

const toYesNo = (v: boolean | undefined): YesNo | null =>
  v === undefined ? null : v ? 'yes' : 'no'

/**
 * Tres pantallas de opción, un toque cada una: cómo toma los turnos hoy, si tiene
 * equipos fijos y si tiene buffet. Tocar una opción avanza solo; en la última,
 * guarda. "Siguiente" queda para quien vuelve con una respuesta ya elegida.
 */
export function StepTuComplejo({ initial, action, onBack }: Props) {
  const [screen, setScreen] = useState(0)
  const [intake, setIntake] = useState<Intake | null>(initial?.bookingIntake ?? null)
  const [fixed, setFixed] = useState<YesNo | null>(toYesNo(initial?.hasFixedTeams))
  const [canteen, setCanteen] = useState<YesNo | null>(toYesNo(initial?.canteenEnabled))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const navigate = useWizardNavigation()

  function save(next: { intake: Intake | null; fixed: YesNo | null; canteen: YesNo | null }) {
    if (!next.intake || !next.fixed || !next.canteen) {
      setError('Elegí una opción para seguir.')
      return
    }
    const payload: WizardProfileInput = {
      bookingIntake: next.intake,
      hasFixedTeams: next.fixed === 'yes',
      canteenEnabled: next.canteen === 'yes',
    }
    setError(null)
    startTransition(async () => {
      const result = await action(payload)
      if (!result.success) {
        startTransition(() => setError(result.error))
        return
      }
      navigate(result)
    })
  }

  function advance() {
    if (screen === 0 && !intake) return setError('Elegí una opción para seguir.')
    if (screen === 1 && !fixed) return setError('Elegí una opción para seguir.')
    setError(null)
    if (screen < 2) setScreen(screen + 1)
    else save({ intake, fixed, canteen })
  }

  const back = screen > 0 ? () => setScreen(screen - 1) : onBack
  const backHref = screen === 0 ? stepPath(4) : undefined

  if (screen === 0) {
    return (
      <StepScreen
        title="¿Cómo tomás los turnos hoy?"
        accent="turnos"
        description="Así te decimos por dónde arrancar."
        onNext={advance}
        error={error}
        onBack={back}
        backHref={backHref}
      >
        <ChoiceCards
          aria-label="¿Cómo tomás los turnos hoy?"
          options={INTAKE_OPTIONS}
          value={intake}
          onChange={(v) => {
            setIntake(v)
            setError(null)
            setScreen(1)
          }}
        />
      </StepScreen>
    )
  }

  if (screen === 1) {
    return (
      <StepScreen
        title="¿Tenés equipos que juegan fijo todas las semanas?"
        accent="juegan fijo"
        onNext={advance}
        error={error}
        onBack={back}
        focusHeading
      >
        <ChoiceCards
          aria-label="¿Tenés equipos que juegan fijo todas las semanas?"
          options={YES_NO}
          columns={2}
          value={fixed}
          onChange={(v) => {
            setFixed(v)
            setError(null)
            setScreen(2)
          }}
        />
      </StepScreen>
    )
  }

  return (
    <StepScreen
      title="¿Tenés buffet o kiosco?"
      accent="buffet o kiosco"
      description="Si no, no te lo mostramos."
      nextLabel="Siguiente"
      onNext={advance}
      isPending={isPending}
      error={error}
      onBack={back}
      focusHeading
    >
      <ChoiceCards
        aria-label="¿Tenés buffet o kiosco?"
        options={YES_NO}
        columns={2}
        value={canteen}
        onChange={(v) => {
          setCanteen(v)
          save({ intake, fixed, canteen: v })
        }}
      />
    </StepScreen>
  )
}
