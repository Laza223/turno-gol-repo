'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { toast } from '@/hooks/use-toast'
import { formatDateLong } from '@/lib/format'
import { Label } from '@/components/ui/label'
import type { ChargeLine } from '@/components/admin/SplitPaymentFields'
import { priceForRange } from '@/lib/booking/pricing'
import type { AbonadoBillingMode } from '@/modules/settlements/settlement.types'
import { AbonadoBillingFields, type InitialSettlementMode } from './AbonadoBillingFields'
import { ContactField } from './ContactField'
import { DateRangeFields } from './DateRangeFields'
import { Summary } from './Summary'
import { usePlayerSearch } from './use-player-search'
import { endTimeOptions, weekdayOf, toDdMm, WEEKDAY_NAMES_ES } from './time-options'
import { readOnlyFieldClass, selectClass } from './styles'
import type { TypeFormProps } from './types'

/** Turno fijo — abonado semanal (mismo día y hora, todas las semanas). */
export function TurnoFijoForm({
  slot,
  courtBookings,
  daySlots,
  pricing,
  searchPlayersAction,
  createAbonadoAction,
  onClose,
  onSuccess,
  trackConfirmed,
}: TypeFormProps) {
  const timeStart = slot.timeStart
  const endOptions = endTimeOptions({ slots: daySlots, startTime: timeStart, courtBookings })
  const [timeEnd, setTimeEnd] = useState(endOptions[0]!)

  const dayOfWeek = weekdayOf(slot.date)
  const dayName = WEEKDAY_NAMES_ES[dayOfWeek]

  const {
    name,
    playerId,
    results,
    handleNameChange,
    pickPlayer,
    clear: clearPlayer,
  } = usePlayerSearch({ searchPlayersAction })
  const [phone, setPhone] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const suggestedPrice = priceForRange(pricing, slot.date, timeStart, timeEnd)
  const [manualPriceCents, setManualPriceCents] = useState<number | null>(null)
  const [priceEditing, setPriceEditing] = useState(suggestedPrice == null)
  const effectivePrice = manualPriceCents ?? suggestedPrice
  const priceMissing = effectivePrice == null || effectivePrice <= 0

  const [startsOn, setStartsOn] = useState(slot.date)
  const [endsOn, setEndsOn] = useState('')

  const [billingMode, setBillingMode] = useState<AbonadoBillingMode>('per_session')
  const [agreedAmountCents, setAgreedAmountCents] = useState<number | null>(null)
  const [initialSettlement, setInitialSettlement] = useState<InitialSettlementMode>('later')
  const [packCredits, setPackCredits] = useState(4)
  const [settlementMonth, setSettlementMonth] = useState(() => slot.date.slice(0, 7))
  const [chargeLines, setChargeLines] = useState<ChargeLine[]>([])
  const [settlementKey] = useState(() => crypto.randomUUID())
  const settledSummaryTotal =
    initialSettlement === 'caja'
      ? chargeLines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)
      : (agreedAmountCents ?? 0)

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  function handleEndChange(next: string) {
    setTimeEnd(next)
    setManualPriceCents(null)
    setPriceEditing(priceForRange(pricing, slot.date, timeStart, next) == null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    if (!trimmedName) {
      setError('Ingresá el nombre de contacto.')
      return
    }
    if (billingMode !== 'monthly' && !trimmedPhone) {
      setError('Ingresá un teléfono de contacto.')
      return
    }
    if (billingMode !== 'monthly' && priceMissing) {
      setError('Ingresá el precio por turno.')
      return
    }

    const linesTotal = chargeLines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)
    if (billingMode !== 'per_session' && initialSettlement === 'caja') {
      const hasInvalid = chargeLines.some((l) => !l.amountCents || l.amountCents <= 0)
      if (chargeLines.length === 0 || hasInvalid || linesTotal <= 0) {
        setError('Ingresá el monto cobrado y su medio de pago.')
        return
      }
    }

    const settledAmount = initialSettlement === 'caja' ? linesTotal : (agreedAmountCents ?? 0)

    const data = {
      courtId: slot.courtId,
      ...(playerId ? { playerId } : {}),
      contactName: trimmedName,
      ...(trimmedPhone ? { contactPhone: trimmedPhone } : {}),
      dayOfWeek,
      timeStart,
      timeEnd,
      pricePerSession: billingMode === 'monthly' ? 0 : (effectivePrice ?? 0),
      billingMode,
      agreedAmount: billingMode === 'per_session' ? 0 : settledAmount,
      ...(billingMode !== 'per_session' && initialSettlement !== 'later'
        ? {
            initialSettlement: {
              kind: (billingMode === 'monthly' ? 'monthly' : 'pack') as 'monthly' | 'pack',
              paymentOrigin: initialSettlement as 'caja' | 'already_settled',
              amount: settledAmount,
              ...(billingMode === 'pack'
                ? { creditsTotal: packCredits }
                : { month: settlementMonth }),
              ...(initialSettlement === 'caja'
                ? {
                    charges: chargeLines.map((l) => ({
                      amount: l.amountCents!,
                      method: l.method,
                    })),
                    clientIdempotencyKey: settlementKey,
                  }
                : {}),
            },
          }
        : {}),
      startsOn,
      ...(endsOn ? { endsOn } : {}),
    }

    setError(null)
    startTransition(async () => {
      try {
        const result = await createAbonadoAction(data)
        if (!result.success) {
          // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
          // render antes de que `pending` bajara, con los controles todavía deshabilitados.
          startTransition(() => setError(result.error))
          return
        }
        trackConfirmed({
          withPlayer: !!playerId,
          withDeposit: billingMode !== 'per_session' && initialSettlement === 'caja',
        })
        const conflicts = result.conflictDates ?? []
        toast({
          title: 'Turno fijo creado',
          description:
            `${result.slotsGenerated ?? 0} turnos agendados.` +
            (conflicts.length > 0
              ? ` Se saltearon por estar ocupadas: ${conflicts.map(toDdMm).join(', ')}.`
              : ''),
          variant: 'success',
        })
        onSuccess()
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() =>
          setError('No pudimos crear el turno fijo. Revisá tu conexión e intentá de nuevo.'),
        )
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 lg:space-y-8 lg:p-6">
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quién
          </h4>
          <ContactField
            ref={nameInputRef}
            idBase="fijo-contacto"
            nameLabel="Nombre de contacto"
            name={name}
            playerId={playerId}
            results={results}
            onNameChange={handleNameChange}
            onPickPlayer={pickPlayer}
            onClearPlayer={clearPlayer}
            phone={phone}
            onPhoneChange={setPhone}
            phoneRequired={billingMode !== 'monthly'}
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Horario
          </h4>
          <p className="text-sm font-medium text-foreground">Todos los {dayName}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Empieza</Label>
              <p className={readOnlyFieldClass}>{timeStart}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fijo-end">Hasta</Label>
              <select
                id="fijo-end"
                className={selectClass}
                value={timeEnd}
                onChange={(e) => handleEndChange(e.target.value)}
              >
                {endOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Precio y cobro
          </h4>
          <AbonadoBillingFields
            idPrefix="fijo"
            billingMode={billingMode}
            onBillingModeChange={setBillingMode}
            pricePerSessionCents={manualPriceCents}
            suggestedPriceCents={suggestedPrice}
            priceEditing={priceEditing}
            onPriceEditingChange={setPriceEditing}
            onPricePerSessionChange={setManualPriceCents}
            agreedAmountCents={agreedAmountCents}
            onAgreedAmountChange={setAgreedAmountCents}
            initialSettlement={initialSettlement}
            onInitialSettlementChange={setInitialSettlement}
            packCredits={packCredits}
            onPackCreditsChange={setPackCredits}
            month={settlementMonth}
            onMonthChange={setSettlementMonth}
            baseYearMonth={startsOn.slice(0, 7)}
            chargeLines={chargeLines}
            onChargeLinesChange={setChargeLines}
          />

          <DateRangeFields
            idPrefix="fijo"
            startsOn={startsOn}
            onStartsOnChange={(next) => {
              setStartsOn(next)
              if (next.length >= 7) setSettlementMonth(next.slice(0, 7))
            }}
            endsOn={endsOn}
            onEndsOnChange={setEndsOn}
            min={slot.date}
            dayOfWeek={dayOfWeek}
          />
        </section>
      </div>

      <Summary
        courtName={slot.courtName}
        dateLabel={formatDateLong(slot.date)}
        timeStart={timeStart}
        timeEnd={timeEnd}
        durationLabel={
          billingMode === 'monthly'
            ? 'por mes'
            : billingMode === 'pack'
              ? `pack de ${packCredits} turnos`
              : 'por semana'
        }
        totalCents={billingMode === 'per_session' ? effectivePrice : settledSummaryTotal}
        collectedCents={
          billingMode === 'per_session' || initialSettlement === 'later' ? 0 : settledSummaryTotal
        }
        primaryLabel="Crear turno fijo"
        onCancel={onClose}
        isPending={isPending}
        disabled={isPending || (billingMode !== 'monthly' && priceMissing)}
        error={error}
      />
    </form>
  )
}
