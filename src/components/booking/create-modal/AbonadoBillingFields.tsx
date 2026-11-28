'use client'

import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { choiceChipClass, SegmentedControl } from '@/components/ui/segmented-control'
import {
  SplitPaymentFields,
  newChargeLine,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { formatArs } from '@/lib/format'
import { listUpcomingYearMonths } from '@/lib/month-bounds'
import type { AbonadoBillingMode } from '@/modules/settlements/settlement.types'
import { selectClass } from './styles'

export type InitialSettlementMode = 'later' | 'caja' | 'already_settled'

type Props = {
  idPrefix: string
  billingMode: AbonadoBillingMode
  onBillingModeChange: (next: AbonadoBillingMode) => void
  /** Precio por turno (`per_session` y fallback luego del pack). */
  pricePerSessionCents: number | null
  suggestedPriceCents: number | null
  priceEditing: boolean
  onPriceEditingChange: (editing: boolean) => void
  onPricePerSessionChange: (cents: number | null) => void
  /** Monto mensual o total del pack. */
  agreedAmountCents: number | null
  onAgreedAmountChange: (cents: number | null) => void
  /** Si el alta también deja pago/saldado el primer mes o pack. */
  initialSettlement: InitialSettlementMode
  onInitialSettlementChange: (next: InitialSettlementMode) => void
  packCredits: number
  onPackCreditsChange: (n: number) => void
  month: string
  onMonthChange: (ym: string) => void
  baseYearMonth: string
  chargeLines: ChargeLine[]
  onChargeLinesChange: (lines: ChargeLine[]) => void
  /** Para Evento > Cada semana: permite ocultar el costo unitario cuando viene en modo "Sin costo". */
  allowFreeMonthly?: boolean
  /** Mensaje cuando no hay precio sugerido de grilla; pasar `null` para ocultarlo (ej. /abonados/nuevo). */
  emptyPriceHint?: string | null
  /** Etiqueta del campo precio por turno (ej. mantener "Precio por turno (pesos)" en /abonados/nuevo). */
  perSessionLabel?: string
}

const BILLING_MODES: Array<{ value: AbonadoBillingMode; label: string }> = [
  { value: 'per_session', label: 'Por cada turno' },
  { value: 'monthly', label: 'Por mes' },
  { value: 'pack', label: 'Pack de turnos' },
]

const INITIAL_PACK_MODES: Array<{ value: 'caja' | 'already_settled'; label: string }> = [
  { value: 'caja', label: 'Cobrar ahora' },
  { value: 'already_settled', label: 'Ya estaba saldado' },
]

const INITIAL_MONTH_MODES: Array<{ value: InitialSettlementMode; label: string }> = [
  { value: 'later', label: 'Cobrar después' },
  { value: 'caja', label: 'Cobrar ahora' },
  { value: 'already_settled', label: 'Ya estaba saldado' },
]

const PACK_PRESETS = [4, 8] as const

/**
 * Selector unificado de modalidad de pago para Turnos fijos y Eventos semanales:
 * por cada turno, acuerdo mensual (ideal para escuelitas) o pack de N turnos.
 */
export function AbonadoBillingFields({
  idPrefix,
  billingMode,
  onBillingModeChange,
  pricePerSessionCents,
  suggestedPriceCents,
  priceEditing,
  onPriceEditingChange,
  onPricePerSessionChange,
  agreedAmountCents,
  onAgreedAmountChange,
  initialSettlement,
  onInitialSettlementChange,
  packCredits,
  onPackCreditsChange,
  month,
  onMonthChange,
  baseYearMonth,
  chargeLines,
  onChargeLinesChange,
  allowFreeMonthly = true,
  emptyPriceHint = 'Esta cancha no tiene precio cargado para este horario.',
  perSessionLabel = 'Precio por turno',
}: Props) {
  const monthOptions = listUpcomingYearMonths(baseYearMonth, 6)

  function handleModeChange(next: AbonadoBillingMode) {
    onBillingModeChange(next)
    if (next === 'monthly') {
      if (agreedAmountCents == null) {
        onAgreedAmountChange(suggestedPriceCents != null ? suggestedPriceCents * 4 : 0)
      }
      if (initialSettlement === 'caja') {
        const target =
          agreedAmountCents ?? (suggestedPriceCents != null ? suggestedPriceCents * 4 : 0)
        onChargeLinesChange([newChargeLine(target > 0 ? target : null, 'cash')])
      }
    } else if (next === 'pack') {
      const unit = pricePerSessionCents ?? suggestedPriceCents ?? 0
      const total = unit > 0 ? unit * packCredits : null
      onAgreedAmountChange(total)
      if (initialSettlement === 'later') {
        onInitialSettlementChange('caja')
      }
      onChargeLinesChange([newChargeLine(total, 'cash')])
    } else {
      onInitialSettlementChange('later')
    }
  }

  function handlePackCount(nextCount: number) {
    const safe = Math.max(1, Math.min(52, Math.trunc(nextCount) || 1))
    onPackCreditsChange(safe)
    const unit = pricePerSessionCents ?? suggestedPriceCents ?? 0
    if (unit > 0) {
      const nextTotal = unit * safe
      onAgreedAmountChange(nextTotal)
      if (initialSettlement === 'caja') {
        onChargeLinesChange([newChargeLine(nextTotal, chargeLines[0]?.method ?? 'cash')])
      }
    }
  }

  function handleAgreedChange(cents: number | null) {
    onAgreedAmountChange(cents)
    if (initialSettlement === 'caja' && chargeLines.length <= 1) {
      onChargeLinesChange([newChargeLine(cents, chargeLines[0]?.method ?? 'cash')])
    }
  }

  function handleInitialSettlement(next: InitialSettlementMode) {
    onInitialSettlementChange(next)
    if (next === 'caja') {
      onChargeLinesChange([
        newChargeLine(
          agreedAmountCents && agreedAmountCents > 0 ? agreedAmountCents : null,
          chargeLines[0]?.method ?? 'cash',
        ),
      ])
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>¿Cómo paga?</Label>
        <SegmentedControl
          className="grid grid-cols-3 gap-1.5"
          aria-label="¿Cómo paga?"
          value={billingMode}
          onValueChange={handleModeChange}
          itemClassName={choiceChipClass}
          options={BILLING_MODES}
        />
      </div>

      {billingMode === 'per_session' && (
        <div>
          {suggestedPriceCents == null ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-precio`}>{perSessionLabel}</Label>
              {emptyPriceHint && <p className="text-xs text-muted-foreground">{emptyPriceHint}</p>}
              <MoneyInput
                id={`${idPrefix}-precio`}
                valueCents={pricePerSessionCents}
                onValueChange={onPricePerSessionChange}
                minCents={1}
                required
              />
            </div>
          ) : priceEditing ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-precio`}>Precio por turno</Label>
              <MoneyInput
                id={`${idPrefix}-precio`}
                valueCents={pricePerSessionCents ?? suggestedPriceCents}
                onValueChange={onPricePerSessionChange}
                minCents={1}
              />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <span className="font-semibold tabular-nums text-foreground">
                {formatArs(pricePerSessionCents ?? suggestedPriceCents)}
              </span>
              <span className="text-xs text-muted-foreground">por turno</span>
              <button
                type="button"
                onClick={() => onPriceEditingChange(true)}
                className="cursor-pointer text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Cambiar
              </button>
            </p>
          )}
        </div>
      )}

      {billingMode === 'monthly' && (
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-mes-precio`}>
              Precio del mes{' '}
              {allowFreeMonthly && (
                <span className="font-normal text-muted-foreground">(o $ 0 si no se cobra)</span>
              )}
            </Label>
            <MoneyInput
              id={`${idPrefix}-mes-precio`}
              valueCents={agreedAmountCents}
              onValueChange={handleAgreedChange}
              minCents={allowFreeMonthly ? 0 : 1}
              placeholder="Ej: 250000"
            />
            <p className="text-xs text-muted-foreground">
              Cada fecha semanal queda cubierta por el mes y no pide cobro por separado.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>¿Cómo queda este mes?</Label>
            <SegmentedControl
              className="grid grid-cols-3 gap-1.5"
              aria-label="¿Cómo queda este mes?"
              value={initialSettlement}
              onValueChange={handleInitialSettlement}
              itemClassName={choiceChipClass}
              options={INITIAL_MONTH_MODES}
            />
          </div>

          {initialSettlement !== 'later' && (
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-mes-cubre`}>Mes que cubre</Label>
              <select
                id={`${idPrefix}-mes-cubre`}
                value={month}
                onChange={(e) => onMonthChange(e.target.value)}
                className={selectClass}
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {initialSettlement === 'caja' && (
            <div className="space-y-1.5">
              <Label>Cómo entra a Caja hoy</Label>
              <SplitPaymentFields
                idPrefix={`${idPrefix}-mes`}
                lines={chargeLines}
                onChange={onChargeLinesChange}
                maxLines={5}
              />
            </div>
          )}

          {initialSettlement === 'already_settled' && (
            <p className="text-xs text-muted-foreground">
              Los turnos del mes quedan marcados como saldados sin sumar plata a Caja hoy.
            </p>
          )}
        </div>
      )}

      {billingMode === 'pack' && (
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-pack-cantidad`}>Cantidad de turnos</Label>
              <div className="flex items-center gap-1.5">
                {PACK_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handlePackCount(n)}
                    className={choiceChipClass(packCredits === n)}
                  >
                    {n}
                  </button>
                ))}
                <input
                  id={`${idPrefix}-pack-cantidad`}
                  type="number"
                  min={1}
                  max={52}
                  value={packCredits}
                  onChange={(e) => handlePackCount(Number(e.target.value))}
                  className="h-11 w-20 rounded-md border border-input bg-card px-2.5 text-center text-sm tabular-nums md:h-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-pack-total`}>Total del pack</Label>
              <MoneyInput
                id={`${idPrefix}-pack-total`}
                valueCents={agreedAmountCents}
                onValueChange={handleAgreedChange}
                minCents={initialSettlement === 'caja' ? 1 : 0}
                placeholder="Total"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-pack-unitario`}>
              Precio por turno cuando termine el pack
            </Label>
            <MoneyInput
              id={`${idPrefix}-pack-unitario`}
              valueCents={pricePerSessionCents ?? suggestedPriceCents}
              onValueChange={onPricePerSessionChange}
              minCents={1}
            />
          </div>

          <div className="space-y-1.5">
            <Label>¿Cómo registrás el pack?</Label>
            <SegmentedControl
              className="grid grid-cols-2 gap-1.5"
              aria-label="¿Cómo registrás el pack?"
              value={initialSettlement === 'already_settled' ? 'already_settled' : 'caja'}
              onValueChange={(v) => handleInitialSettlement(v)}
              itemClassName={choiceChipClass}
              options={INITIAL_PACK_MODES}
            />
          </div>

          {initialSettlement === 'already_settled' ? (
            <p className="text-xs text-muted-foreground">
              Cubre los próximos {packCredits} turnos como saldados sin sumar plata a Caja hoy. Si
              cancelan un turno con aviso, el crédito pasa al siguiente. Si no vienen, se consume.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Cómo entra a Caja hoy</Label>
              <SplitPaymentFields
                idPrefix={`${idPrefix}-pack`}
                lines={chargeLines}
                onChange={onChargeLinesChange}
                maxLines={5}
              />
              <p className="text-xs text-muted-foreground">
                Si cancelan un turno con aviso, el crédito pasa al siguiente. Si no vienen, se
                consume.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
