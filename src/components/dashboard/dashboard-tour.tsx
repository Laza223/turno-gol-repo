'use client'

import { useState, useTransition } from 'react'
import { Coachmark, type CoachmarkProps } from '@/components/ui/coachmark'
import { useCoachmarkTour } from '@/hooks/use-coachmark-tour'

const STEPS: { targetId: string; text: string; placement?: CoachmarkProps['placement'] }[] = [
  {
    targetId: 'tour-grilla',
    text: 'Abrí la grilla desde acá para cargar y ver los turnos del día.',
  },
  {
    targetId: 'tour-checklist',
    text: 'Completá estos pasos para dejar tu complejo 100% listo.',
    // Arriba del header: debajo arrancan los ítems pendientes del propio
    // checklist (incluido el botón que el paso 3 va a señalar) y el globo
    // los taparía.
    placement: 'top',
  },
  {
    targetId: 'tour-share-link',
    text: 'Compartí este link y tus jugadores reservan solos.',
  },
]

interface DashboardTourProps {
  /**
   * Server Action que persiste "tour visto" (`admin_tour_seen_at`). Llega
   * por PROP, nunca se importa como valor de `./actions` acá (mismo motivo
   * que `OnboardingChecklist`: `./actions` es `'use server'` y arrastra
   * drizzle/postgres + `node:async_hooks`, lo que rompe el bundle de browser
   * de Storybook).
   */
  action: () => Promise<{ success: boolean }>
}

/**
 * Tour de primera visita al dashboard admin: 3 coachmarks NO bloqueantes en
 * secuencia (MASTER §7.1, máx. uno visible a la vez). Se muestra una sola
 * vez — la page solo monta este componente cuando `admin_tour_seen_at` no
 * está seteado — y al terminar (último "Entendido" u "Omitir recorrido")
 * persiste la marca best-effort: si la Server Action falla, el tour igual se
 * cierra localmente (no tiene sentido repetirlo por un error transitorio de
 * red/rate-limit).
 */
export function DashboardTour({ action }: DashboardTourProps) {
  const [done, setDone] = useState(false)
  const [, startTransition] = useTransition()

  function finish() {
    setDone(true)
    startTransition(async () => {
      try {
        await action()
      } catch {
        // best-effort: el tour ya se cerró localmente aunque no se persista.
      }
    })
  }

  const tour = useCoachmarkTour(STEPS, { onFinish: finish })

  if (done || !tour.active || !tour.current) return null

  const isLastStep = tour.index === tour.total - 1

  return (
    <Coachmark
      key={tour.current.targetId}
      targetId={tour.current.targetId}
      text={tour.current.text}
      placement={STEPS[tour.index]?.placement}
      stepLabel={`${tour.index + 1} de ${tour.total}`}
      dismissLabel={isLastStep ? 'Entendido' : 'Siguiente'}
      onDismiss={tour.next}
      onSkip={tour.skip}
      skipLabel="Omitir recorrido"
    />
  )
}
