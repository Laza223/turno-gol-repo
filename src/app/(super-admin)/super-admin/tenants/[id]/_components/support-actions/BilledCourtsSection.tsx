'use client'

import { useState } from 'react'
import { formatArs } from '@/lib/format'
import { buildPriceBreakdown } from '@/modules/billing/pricing'
import type { BillingCycle } from '@/modules/billing/billing.types'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import {
  inputCls,
  primaryBtn,
  type BilledCourtsPricing,
  type Feedback,
  type RunAction,
  type SupportAction,
} from './constants'

/** Mismo tope que valida `changeBilledCourtsInputSchema` server-side. */
const MAX_BILLED_COURTS = 200

type Props = {
  tenantId: string
  /** Canchas por las que se le factura hoy. `null` = sin fila de suscripción. */
  currentBilledCourts: number | null
  /** Ciclo del cobro vigente. `null` = sin fila de suscripción. */
  billingCycle: BillingCycle | null
  /**
   * Canchas con `status='online'`: el piso duro. El server rechaza bajar de
   * acá con `DOWNGRADE_BLOCKED`, así que la UI no deja ni intentarlo.
   */
  onlineCourts: number
  /** `null` si el plan de la suscripción es una banda legacy sin precio lineal. */
  pricing: BilledCourtsPricing | null
  pending: boolean
  run: RunAction
  action: SupportAction
}

/**
 * Corrige por cuántas canchas se le factura a un complejo. Aplica YA y sin
 * cobrar nada: es soporte arreglando un número mal cargado, no el dueño
 * pidiendo un cambio (ese camino agenda para el próximo ciclo, P4).
 *
 * Reemplaza a `ChangePlanSection`: ya no hay plan que elegir.
 */
export function BilledCourtsSection({
  tenantId,
  currentBilledCourts,
  billingCycle,
  onlineCourts,
  pricing,
  pending,
  run,
  action,
}: Props) {
  const floor = Math.max(1, onlineCourts)
  const [target, setTarget] = useState(currentBilledCourts ?? floor)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const hasSubscription = currentBilledCourts !== null && billingCycle !== null
  const cycle: BillingCycle = billingCycle ?? 'monthly'

  const monthlyFor = (courts: number): number | null =>
    pricing && Number.isInteger(courts) && courts >= 1
      ? buildPriceBreakdown({ billedCourts: courts, cycle, ...pricing }).monthlyEffectiveCents
      : null

  const currentMonthly = monthlyFor(currentBilledCourts ?? 0)
  const targetValid = Number.isInteger(target) && target >= floor && target <= MAX_BILLED_COURTS
  const targetMonthly = targetValid ? monthlyFor(target) : null
  const changed = targetValid && target !== currentBilledCourts

  return (
    <SectionCard
      title="Corregir canchas facturadas"
      description="Ajusta por cuántas canchas se factura, sin cobro ni proración. Si hay suscripción MP activa, actualiza el monto recurrente."
    >
      {!hasSubscription ? (
        <p className="text-sm text-muted-foreground">
          El complejo no tiene suscripción registrada — no aplica.
        </p>
      ) : !pricing ? (
        <p className="text-sm text-muted-foreground">
          La suscripción apunta a un plan sin precio por cancha cargado. Corregí el catálogo antes
          de tocar la facturación.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="billed-courts" className="text-sm font-medium text-foreground">
              Canchas facturadas
            </label>
            <input
              id="billed-courts"
              type="number"
              min={floor}
              max={MAX_BILLED_COURTS}
              value={target}
              // Campo vacío o a medio tipear = NaN, nunca 0: `Number('')` es 0 y
              // se leería como "por debajo de las canchas online".
              onChange={(e) =>
                setTarget(e.target.value === '' ? Number.NaN : Number(e.target.value))
              }
              className={`${inputCls} w-24 tabular-nums`}
            />
            <button
              type="button"
              disabled={pending || !changed}
              onClick={() => setConfirmOpen(true)}
              className={primaryBtn}
            >
              Corregir canchas
            </button>
          </div>

          <p className="text-sm text-muted-foreground">
            Hoy: {currentBilledCourts} cancha{currentBilledCourts === 1 ? '' : 's'}
            {currentMonthly !== null && ` · ${formatArs(currentMonthly)}/mes`}
            {targetMonthly !== null && changed && (
              <>
                {' → queda en '}
                <span className="font-medium text-foreground">{formatArs(targetMonthly)}/mes</span>
              </>
            )}
          </p>

          {!targetValid && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {!Number.isInteger(target)
                ? 'Ingresá una cantidad entera de canchas.'
                : target < floor
                  ? `El complejo tiene ${onlineCourts} cancha${onlineCourts === 1 ? '' : 's'} online: no se puede facturar por menos de ${floor}.`
                  : `Máximo ${MAX_BILLED_COURTS} canchas.`}
            </p>
          )}

          <FeedbackText feedback={feedback} />
        </div>
      )}

      {hasSubscription && pricing && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Corregir canchas facturadas"
          consequences={[
            `De ${currentBilledCourts} cancha${currentBilledCourts === 1 ? '' : 's'}${currentMonthly !== null ? ` (${formatArs(currentMonthly)}/mes)` : ''} a ${target} cancha${target === 1 ? '' : 's'}${targetMonthly !== null ? ` (${formatArs(targetMonthly)}/mes)` : ''}.`,
            'Aplica en el acto y no genera ningún cobro: no hay proración.',
            'Si hay suscripción MP activa, el monto recurrente se actualiza para el próximo ciclo.',
          ]}
          confirmLabel="Confirmar cambio"
          cancelLabel="Cancelar"
          onConfirm={async () => {
            run(() => action({ tenantId, billedCourts: target }), setFeedback)
          }}
        />
      )}
    </SectionCard>
  )
}
