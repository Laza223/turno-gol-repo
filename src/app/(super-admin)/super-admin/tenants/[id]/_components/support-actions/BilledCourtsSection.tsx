'use client'

import { useState } from 'react'
import { formatArs } from '@/lib/format'
import {
  buildPriceBreakdown,
  canQuoteCourtCount,
  MAX_CATALOG_COURTS,
  type PriceBreakdown,
} from '@/modules/billing/pricing'
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
  /** Plus EFECTIVO por mes que se factura hoy (0 si no hay). No depende de las canchas. */
  plusMonthlyCents?: number
  pending: boolean
  run: RunAction
  action: SupportAction
  nextCatalogPrice?: PriceBreakdown | null
  applyCatalogPrice?: SupportAction
  saveLargeQuote?: SupportAction
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
  plusMonthlyCents = 0,
  pending,
  run,
  action,
  nextCatalogPrice,
  applyCatalogPrice,
  saveLargeQuote,
}: Props) {
  const maxCourts =
    pricing?.quotedCourtCount ?? (pricing?.byCourtCount ? MAX_CATALOG_COURTS : MAX_BILLED_COURTS)
  const floor = Math.max(1, onlineCourts)
  const [target, setTarget] = useState(currentBilledCourts ?? floor)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [catalogConfirm, setCatalogConfirm] = useState(false)
  const [quotePesos, setQuotePesos] = useState('')
  const quoteCents = Math.round(Number(quotePesos) * 100)

  const hasSubscription = currentBilledCourts !== null && billingCycle !== null
  const cycle: BillingCycle = billingCycle ?? 'monthly'

  const monthlyFor = (courts: number): number | null =>
    pricing && Number.isInteger(courts) && courts >= 1 && canQuoteCourtCount(courts, pricing)
      ? buildPriceBreakdown({ billedCourts: courts, cycle, plusMonthlyCents, ...pricing })
          .monthlyEffectiveCents
      : null

  const currentMonthly = monthlyFor(currentBilledCourts ?? 0)
  const targetValid = Number.isInteger(target) && target >= floor && target <= maxCourts
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
              max={maxCourts}
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
                  : pricing.byCourtCount
                    ? 'Para 8 canchas o más, cotizá por WhatsApp.'
                    : `Máximo ${maxCourts} canchas.`}
            </p>
          )}

          {nextCatalogPrice && applyCatalogPrice && (
            <>
              <button
                type="button"
                className={primaryBtn}
                disabled={pending}
                onClick={() => setCatalogConfirm(true)}
              >
                Aplicar tarifa de lista
              </button>
              <ConfirmDialog
                open={catalogConfirm}
                onOpenChange={setCatalogConfirm}
                title="Aplicar tarifa de lista"
                description={`Próximo débito: ${formatArs(nextCatalogPrice.chargePerCycleCents)} por ${nextCatalogPrice.cycle === 'annual' ? 'año' : 'mes'}${nextCatalogPrice.plusMonthlyListCents ? ', con asistente' : ''}.`}
                confirmLabel="Confirmar importe"
                cancelLabel="Volver"
                onConfirm={async () => {
                  run(
                    () =>
                      applyCatalogPrice({
                        tenantId,
                        amountCents: nextCatalogPrice.chargePerCycleCents,
                      }),
                    setFeedback,
                  )
                }}
              />
            </>
          )}
          {saveLargeQuote && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                run(() => saveLargeQuote({ tenantId, monthlyCents: quoteCents }), setFeedback)
              }}
            >
              <label className="grid gap-1 text-sm">
                Cotización mensual acordada para {onlineCourts} canchas (ARS)
                <input
                  className={inputCls}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quotePesos}
                  onChange={(event) => setQuotePesos(event.target.value)}
                />
              </label>
              <button type="submit" className={primaryBtn} disabled={pending || !(quoteCents > 0)}>
                Guardar cotización
              </button>
            </form>
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
