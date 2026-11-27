'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Plus, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { formatArs, formatDateLong } from '@/lib/format'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { choiceChipClass, SegmentedControl } from '@/components/ui/segmented-control'
import {
  SplitPaymentFields,
  newChargeLine,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { priceForRange } from '@/lib/booking/pricing'
import { addDays } from '@/lib/booking/grid-cells'
import type { AbonadoBillingMode } from '@/modules/settlements/settlement.types'
import { AbonadoBillingFields, type InitialSettlementMode } from './AbonadoBillingFields'
import { ContactField } from './ContactField'
import { ChargeSection } from './ChargeSection'
import { DateRangeFields } from './DateRangeFields'
import { Summary } from './Summary'
import { usePlayerSearch } from './use-player-search'
import { useSlotAvailability } from './use-slot-availability'
import { durationHours, endTimeOptions, toDdMm, weekdayOf, WEEKDAY_NAMES_ES } from './time-options'
import { readOnlyFieldClass, selectClass } from './styles'
import type { ChargeChoice, DepositMethod, TypeFormProps } from './types'

const EVENT_CHIPS = ['Escuelita', 'Torneo', 'Cumpleaños', 'Clase', 'Otro'] as const

type PriceMode = 'priced' | 'free'
type RepeatMode = 'once' | 'dates' | 'weekly'
type MultiDatePaymentMode = 'unpaid' | 'caja' | 'already_settled'

/** Evento — varias horas cobrables (escuelita, torneo, cumpleaños): `spontaneous`, N horas. */
export function EventoForm({
  slot,
  courtBookings,
  daySlots,
  pricing,
  checkAvailabilityAction,
  searchPlayersAction,
  createBookingAction,
  createAbonadoAction,
  createMultiDateEventAction,
  onClose,
  onSuccess,
  trackConfirmed,
}: TypeFormProps) {
  const timeStart = slot.timeStart
  const endOptions = endTimeOptions({ slots: daySlots, startTime: timeStart, courtBookings })
  const [timeEnd, setTimeEnd] = useState(endOptions[1] ?? endOptions[0]!)

  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once')
  const dayOfWeek = weekdayOf(slot.date)
  const dayName = WEEKDAY_NAMES_ES[dayOfWeek]
  const [startsOn, setStartsOn] = useState(slot.date)
  const [endsOn, setEndsOn] = useState('')

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

  const taken = useSlotAvailability({
    checkAvailabilityAction,
    slot: { courtId: slot.courtId, date: slot.date, timeStart },
  })

  const [priceMode, setPriceMode] = useState<PriceMode>('priced')
  const suggestedPrice = priceForRange(pricing, slot.date, timeStart, timeEnd)
  const [manualPriceCents, setManualPriceCents] = useState<number | null>(null)
  const [priceEditing, setPriceEditing] = useState(suggestedPrice == null)
  const effectivePrice = priceMode === 'free' ? 0 : (manualPriceCents ?? suggestedPrice)
  const priceMissing = priceMode === 'priced' && effectivePrice == null

  const [chargeChoice, setChargeChoice] = useState<ChargeChoice>('none')
  const [chargeMethod, setChargeMethod] = useState<DepositMethod | null>(null)
  const [chargeAmount, setChargeAmount] = useState<number | null>(null)

  // Modo "Varias fechas"
  const [multiDates, setMultiDates] = useState<string[]>(() => [slot.date])
  const [dateToAdd, setDateToAdd] = useState('')
  const [multiTotalOverride, setMultiTotalOverride] = useState<number | null>(null)
  const [multiPaymentMode, setMultiPaymentMode] = useState<MultiDatePaymentMode>('unpaid')
  const [multiChargeLines, setMultiChargeLines] = useState<ChargeLine[]>([])
  const [multiKey] = useState(() => crypto.randomUUID())

  // Modo "Cada semana" (acuerdo recurrente / escuelita)
  const [weeklyBillingMode, setWeeklyBillingMode] = useState<AbonadoBillingMode>('per_session')
  const [weeklyAgreedCents, setWeeklyAgreedCents] = useState<number | null>(null)
  const [weeklyInitialSettlement, setWeeklyInitialSettlement] =
    useState<InitialSettlementMode>('later')
  const [weeklyPackCredits, setWeeklyPackCredits] = useState(4)
  const [weeklyMonth, setWeeklyMonth] = useState(() => slot.date.slice(0, 7))
  const [weeklyChargeLines, setWeeklyChargeLines] = useState<ChargeLine[]>([])
  const [weeklyKey] = useState(() => crypto.randomUUID())

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const multiDefaultTotal = multiDates.reduce((sum, d) => {
    const p = priceForRange(pricing, d, timeStart, timeEnd)
    return sum + (p ?? 0)
  }, 0)
  const effectiveMultiTotal = priceMode === 'free' ? 0 : (multiTotalOverride ?? multiDefaultTotal)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  function handleEndChange(next: string) {
    setTimeEnd(next)
    setManualPriceCents(null)
    setMultiTotalOverride(null)
    setPriceEditing(priceForRange(pricing, slot.date, timeStart, next) == null)
    setChargeChoice('none')
    setChargeMethod(null)
    setChargeAmount(null)
  }

  function handlePriceModeChange(next: PriceMode) {
    setPriceMode(next)
    if (next === 'free') {
      setChargeChoice('none')
      setChargeMethod(null)
      setChargeAmount(null)
    }
  }

  function handleRepeatModeChange(next: RepeatMode) {
    setRepeatMode(next)
    setError(null)
    if (next !== 'once') {
      setChargeChoice('none')
      setChargeMethod(null)
      setChargeAmount(null)
    }
    if (next === 'dates' && multiPaymentMode === 'caja') {
      setMultiChargeLines([
        newChargeLine(effectiveMultiTotal > 0 ? effectiveMultiTotal : null, 'cash'),
      ])
    }
  }

  function addMultiDate(dateStr: string) {
    if (!dateStr || multiDates.includes(dateStr) || multiDates.length >= 15) return
    const next = [...multiDates, dateStr].sort()
    setMultiDates(next)
    setDateToAdd('')
  }

  function removeMultiDate(dateStr: string) {
    if (multiDates.length <= 1) return
    setMultiDates(multiDates.filter((d) => d !== dateStr))
  }

  function pickChip(chip: string) {
    if (chip === 'Otro') {
      handleNameChange('')
      nameInputRef.current?.focus()
      return
    }
    handleNameChange(chip)
    if (chip === 'Escuelita' && repeatMode === 'weekly') {
      setWeeklyBillingMode('monthly')
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending || (repeatMode === 'once' && taken)) return
    const trimmedName = name.trim()
    if (!playerId && !trimmedName) {
      setError('Poné el nombre del evento o del responsable.')
      return
    }
    if (repeatMode === 'once' && priceMissing) {
      setError('Ingresá el precio del evento.')
      return
    }
    if (
      repeatMode === 'once' &&
      (chargeChoice === 'partial' || chargeChoice === 'full') &&
      (!chargeMethod || !chargeAmount || chargeAmount <= 0)
    ) {
      setError('Ingresá cuánto cobraste.')
      return
    }

    const trimmedPhone = phone.trim()
    setError(null)

    if (repeatMode === 'dates') {
      if (!createMultiDateEventAction) {
        setError('Esta pantalla no admite crear eventos de varias fechas.')
        return
      }
      const linesTotal = multiChargeLines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)
      if (multiPaymentMode === 'caja') {
        const hasInvalid = multiChargeLines.some((l) => !l.amountCents || l.amountCents <= 0)
        if (multiChargeLines.length === 0 || hasInvalid || linesTotal <= 0) {
          setError('Ingresá el monto cobrado y su método de pago.')
          return
        }
      }
      const totalToSave = multiPaymentMode === 'caja' ? linesTotal : effectiveMultiTotal

      startTransition(async () => {
        try {
          const result = await createMultiDateEventAction({
            courtId: slot.courtId,
            dates: multiDates,
            timeStart,
            timeEnd,
            ...(playerId ? { playerId } : { guestName: trimmedName }),
            ...(!playerId && trimmedPhone ? { guestPhone: trimmedPhone } : {}),
            totalAmount: totalToSave,
            paymentMode: multiPaymentMode,
            ...(multiPaymentMode === 'caja'
              ? {
                  charges: multiChargeLines.map((l) => ({
                    amount: l.amountCents!,
                    method: l.method,
                  })),
                  clientIdempotencyKey: multiKey,
                }
              : {}),
          })
          if (!result.success) {
            startTransition(() => setError(result.error))
            return
          }
          trackConfirmed({
            withPlayer: !!playerId,
            withDeposit: multiPaymentMode === 'caja',
          })
          toast({
            title: `${multiDates.length} fechas agendadas`,
            description:
              multiPaymentMode === 'caja'
                ? `Cobro registrado por ${formatArs(totalToSave)}.`
                : multiPaymentMode === 'already_settled'
                  ? 'Marcadas como saldadas sin movimiento en Caja.'
                  : `${slot.courtName} · ${timeStart}–${timeEnd}`,
            variant: 'success',
          })
          onSuccess(result.bookings[0])
        } catch (err) {
          Sentry.captureException(err)
          startTransition(() =>
            setError('No pudimos guardar el evento. Revisá tu internet y probá de nuevo.'),
          )
        }
      })
      return
    }

    if (repeatMode === 'weekly') {
      const linesTotal = weeklyChargeLines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)
      if (weeklyBillingMode !== 'per_session' && weeklyInitialSettlement === 'caja') {
        const hasInvalid = weeklyChargeLines.some((l) => !l.amountCents || l.amountCents <= 0)
        if (weeklyChargeLines.length === 0 || hasInvalid || linesTotal <= 0) {
          setError('Ingresá el monto cobrado y su método de pago.')
          return
        }
      }
      const sessionPrice =
        weeklyBillingMode === 'monthly' ? 0 : priceMode === 'free' ? 0 : (effectivePrice ?? 0)
      const weeklyAmount =
        weeklyInitialSettlement === 'caja' ? linesTotal : (weeklyAgreedCents ?? 0)

      const weeklyData = {
        courtId: slot.courtId,
        ...(playerId ? { playerId } : {}),
        contactName: trimmedName,
        ...(trimmedPhone ? { contactPhone: trimmedPhone } : {}),
        viaWeeklyEvent: true,
        dayOfWeek,
        timeStart,
        timeEnd,
        pricePerSession: sessionPrice,
        billingMode: weeklyBillingMode,
        agreedAmount: weeklyBillingMode === 'per_session' ? 0 : weeklyAmount,
        ...(weeklyBillingMode !== 'per_session' && weeklyInitialSettlement !== 'later'
          ? {
              initialSettlement: {
                kind: (weeklyBillingMode === 'monthly' ? 'monthly' : 'pack') as 'monthly' | 'pack',
                paymentOrigin: weeklyInitialSettlement as 'caja' | 'already_settled',
                amount: weeklyAmount,
                ...(weeklyBillingMode === 'pack'
                  ? { creditsTotal: weeklyPackCredits }
                  : { month: weeklyMonth }),
                ...(weeklyInitialSettlement === 'caja'
                  ? {
                      charges: weeklyChargeLines.map((l) => ({
                        amount: l.amountCents!,
                        method: l.method,
                      })),
                      clientIdempotencyKey: weeklyKey,
                    }
                  : {}),
              },
            }
          : {}),
        startsOn,
        ...(endsOn ? { endsOn } : {}),
      }

      startTransition(async () => {
        try {
          const result = await createAbonadoAction(weeklyData)
          if (!result.success) {
            // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
            // render antes de que `pending` bajara, con los controles todavía deshabilitados.
            startTransition(() => setError(result.error))
            return
          }
          trackConfirmed({
            withPlayer: !!playerId,
            withDeposit: weeklyBillingMode !== 'per_session' && weeklyInitialSettlement === 'caja',
          })
          const conflicts = result.conflictDates ?? []
          toast({
            title: 'Evento semanal creado',
            description:
              `${result.slotsGenerated ?? 0} fechas agendadas.` +
              (conflicts.length > 0
                ? ` Se saltearon por estar ocupadas: ${conflicts.map(toDdMm).join(', ')}.`
                : ''),
            variant: 'success',
          })
          onSuccess()
        } catch (err) {
          Sentry.captureException(err)
          startTransition(() =>
            setError('No pudimos crear el evento semanal. Revisá tu internet y probá de nuevo.'),
          )
        }
      })
      return
    }

    const data = {
      courtId: slot.courtId,
      date: slot.date,
      timeStart,
      timeEnd,
      type: 'spontaneous' as const,
      ...(playerId ? { playerId } : { guestName: trimmedName }),
      ...(!playerId && trimmedPhone ? { guestPhone: trimmedPhone } : {}),
      ...(priceMode === 'free'
        ? { priceOverride: 0 }
        : manualPriceCents != null
          ? { priceOverride: manualPriceCents }
          : {}),
      ...(priceMode === 'priced' && chargeChoice === 'already_settled'
        ? { markAlreadySettled: true }
        : priceMode === 'priced' &&
            (chargeChoice === 'partial' || chargeChoice === 'full') &&
            chargeMethod &&
            chargeAmount
          ? {
              depositMethod: chargeMethod,
              depositAmount: chargeAmount,
              depositStatus: 'paid' as const,
            }
          : {}),
    }

    startTransition(async () => {
      try {
        const result = await createBookingAction(data)
        if (!result.success) {
          startTransition(() => setError(result.error))
          return
        }
        trackConfirmed({
          withPlayer: !!playerId,
          withDeposit:
            priceMode === 'priced' && (chargeChoice === 'partial' || chargeChoice === 'full'),
        })
        toast({
          title: 'Evento agendado',
          description: `${slot.courtName} · ${timeStart}–${timeEnd}`,
          variant: 'success',
        })
        onSuccess(result.booking)
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() =>
          setError('No pudimos guardar el evento. Revisá tu internet y probá de nuevo.'),
        )
      }
    })
  }

  const durationLabel =
    repeatMode === 'weekly'
      ? weeklyBillingMode === 'monthly'
        ? `${durationHours(timeStart, timeEnd)} h · mensual`
        : weeklyBillingMode === 'pack'
          ? `${durationHours(timeStart, timeEnd)} h · pack ${weeklyPackCredits}`
          : `${durationHours(timeStart, timeEnd)} h · por semana`
      : repeatMode === 'dates'
        ? `${durationHours(timeStart, timeEnd)} h · ${multiDates.length} fechas`
        : `${durationHours(timeStart, timeEnd)} h`

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 lg:space-y-8 lg:p-6">
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Repetición
          </h4>
          <SegmentedControl
            className="grid grid-cols-3 gap-1.5"
            aria-label="Repetición del evento"
            value={repeatMode}
            onValueChange={handleRepeatModeChange}
            itemClassName={choiceChipClass}
            options={[
              { value: 'once', label: 'Una vez' },
              { value: 'dates', label: 'Varias fechas' },
              { value: 'weekly', label: 'Cada semana' },
            ]}
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quién
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => pickChip(chip)}
                // El mismo chip que "Repetición" y "Precio": un solo lenguaje de
                // "elegido" en todo el modal.
                className={choiceChipClass(name === chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <ContactField
            ref={nameInputRef}
            idBase="evento-contacto"
            nameLabel="Nombre del evento o responsable"
            namePlaceholder="Ej: Escuelita de los sábados"
            name={name}
            playerId={playerId}
            results={results}
            onNameChange={handleNameChange}
            onPickPlayer={pickPlayer}
            onClearPlayer={clearPlayer}
            phone={phone}
            onPhoneChange={setPhone}
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Horario
          </h4>
          {repeatMode === 'weekly' && (
            <p className="text-sm font-medium text-foreground">Todos los {dayName}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Empieza</Label>
              <p className={readOnlyFieldClass}>{timeStart}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evento-end">Hasta</Label>
              <select
                id="evento-end"
                className={selectClass}
                value={timeEnd}
                onChange={(e) => handleEndChange(e.target.value)}
              >
                {endOptions.map((t) => (
                  <option key={t} value={t}>
                    {t} · {durationHours(timeStart, t)} h
                  </option>
                ))}
              </select>
            </div>
          </div>
          {repeatMode === 'once' && taken && (
            <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
              Ese horario ya se ocupó. Elegí otro para seguir.
            </p>
          )}
          {repeatMode === 'dates' && (
            <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-wrap gap-1.5">
                {multiDates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground tabular-nums"
                  >
                    {toDdMm(d)}
                    {multiDates.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Quitar ${d}`}
                        onClick={() => removeMultiDate(d)}
                        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  min={slot.date}
                  value={dateToAdd}
                  onChange={(e) => {
                    if (e.target.value) addMultiDate(e.target.value)
                  }}
                  aria-label="Agregar fecha"
                  className="h-9 rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                />
                <button
                  type="button"
                  onClick={() => addMultiDate(addDays(multiDates[multiDates.length - 1]!, 7))}
                  disabled={multiDates.length >= 15}
                  className={choiceChipClass(false)}
                >
                  <Plus className="mr-1 inline h-3 w-3" />1 semana
                </button>
                <button
                  type="button"
                  onClick={() => addMultiDate(addDays(multiDates[multiDates.length - 1]!, 1))}
                  disabled={multiDates.length >= 15}
                  className={choiceChipClass(false)}
                >
                  <Plus className="mr-1 inline h-3 w-3" />1 día
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Precio y cobro
          </h4>
          {(repeatMode === 'once' ||
            repeatMode === 'dates' ||
            weeklyBillingMode === 'per_session') && (
            <SegmentedControl
              className="grid grid-cols-2 gap-1.5"
              aria-label="Precio del evento"
              value={priceMode}
              onValueChange={handlePriceModeChange}
              itemClassName={choiceChipClass}
              options={[
                { value: 'priced', label: 'Tiene precio' },
                { value: 'free', label: 'Sin costo' },
              ]}
            />
          )}

          {repeatMode === 'once' && priceMode === 'priced' && (
            <>
              {suggestedPrice == null ? (
                <div className="space-y-1.5">
                  <Label htmlFor="evento-precio">Precio del evento</Label>
                  <p className="text-xs text-muted-foreground">
                    Sin tarifa configurada en la grilla.
                  </p>
                  <MoneyInput
                    id="evento-precio"
                    valueCents={manualPriceCents}
                    onValueChange={setManualPriceCents}
                    minCents={1}
                    required
                  />
                </div>
              ) : priceEditing ? (
                <div className="space-y-1.5">
                  <Label htmlFor="evento-precio">Precio del evento</Label>
                  <MoneyInput
                    id="evento-precio"
                    valueCents={manualPriceCents ?? suggestedPrice}
                    onValueChange={setManualPriceCents}
                    minCents={0}
                  />
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Tarifa de la grilla:</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatArs(suggestedPrice)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPriceEditing(true)}
                    className="cursor-pointer text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Cambiar
                  </button>
                </p>
              )}

              <ChargeSection
                totalCents={effectivePrice ?? 0}
                choice={chargeChoice}
                method={chargeMethod}
                amountCents={chargeAmount}
                onChoiceChange={setChargeChoice}
                onMethodChange={setChargeMethod}
                onAmountChange={setChargeAmount}
              />
            </>
          )}

          {repeatMode === 'dates' && (
            <div className="space-y-3">
              {priceMode === 'priced' && (
                <div className="space-y-1.5">
                  <Label htmlFor="evento-multi-total">
                    Total por las {multiDates.length} fechas
                  </Label>
                  <MoneyInput
                    id="evento-multi-total"
                    valueCents={effectiveMultiTotal}
                    onValueChange={(next) => {
                      setMultiTotalOverride(next)
                      if (multiPaymentMode === 'caja' && multiChargeLines.length <= 1) {
                        setMultiChargeLines([
                          newChargeLine(next, multiChargeLines[0]?.method ?? 'cash'),
                        ])
                      }
                    }}
                    minCents={0}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>¿Cómo queda el pago de estas fechas?</Label>
                <SegmentedControl<MultiDatePaymentMode>
                  className="grid grid-cols-3 gap-1.5"
                  aria-label="Pago de varias fechas"
                  value={multiPaymentMode}
                  onValueChange={(next) => {
                    setMultiPaymentMode(next)
                    if (next === 'caja') {
                      setMultiChargeLines([
                        newChargeLine(
                          effectiveMultiTotal > 0 ? effectiveMultiTotal : null,
                          multiChargeLines[0]?.method ?? 'cash',
                        ),
                      ])
                    }
                  }}
                  itemClassName={choiceChipClass}
                  options={[
                    { value: 'unpaid', label: 'Por cobrar' },
                    { value: 'caja', label: 'Cobrar ahora' },
                    { value: 'already_settled', label: 'Ya saldado' },
                  ]}
                />
              </div>

              {multiPaymentMode === 'caja' && (
                <SplitPaymentFields
                  idPrefix="evento-varias"
                  lines={multiChargeLines}
                  onChange={setMultiChargeLines}
                  maxLines={5}
                />
              )}
              {multiPaymentMode === 'already_settled' && (
                <p className="text-xs text-muted-foreground">
                  Todas las fechas elegidas quedan saldadas sin sumar plata en Caja hoy.
                </p>
              )}
            </div>
          )}

          {repeatMode === 'weekly' && (
            <>
              <AbonadoBillingFields
                idPrefix="evento-semanal"
                billingMode={weeklyBillingMode}
                onBillingModeChange={setWeeklyBillingMode}
                pricePerSessionCents={priceMode === 'free' ? 0 : manualPriceCents}
                suggestedPriceCents={priceMode === 'free' ? 0 : suggestedPrice}
                priceEditing={priceEditing}
                onPriceEditingChange={setPriceEditing}
                onPricePerSessionChange={setManualPriceCents}
                agreedAmountCents={weeklyAgreedCents}
                onAgreedAmountChange={setWeeklyAgreedCents}
                initialSettlement={weeklyInitialSettlement}
                onInitialSettlementChange={setWeeklyInitialSettlement}
                packCredits={weeklyPackCredits}
                onPackCreditsChange={setWeeklyPackCredits}
                month={weeklyMonth}
                onMonthChange={setWeeklyMonth}
                baseYearMonth={startsOn.slice(0, 7)}
                chargeLines={weeklyChargeLines}
                onChargeLinesChange={setWeeklyChargeLines}
              />
              <DateRangeFields
                idPrefix="evento"
                startsOn={startsOn}
                onStartsOnChange={(next) => {
                  setStartsOn(next)
                  if (next.length >= 7) setWeeklyMonth(next.slice(0, 7))
                }}
                endsOn={endsOn}
                onEndsOnChange={setEndsOn}
                min={slot.date}
                dayOfWeek={dayOfWeek}
              />
            </>
          )}
        </section>
      </div>

      <Summary
        courtName={slot.courtName}
        dateLabel={
          repeatMode === 'dates' ? `${multiDates.length} fechas` : formatDateLong(slot.date)
        }
        timeStart={timeStart}
        timeEnd={timeEnd}
        durationLabel={durationLabel}
        totalCents={
          repeatMode === 'dates'
            ? effectiveMultiTotal
            : repeatMode === 'weekly'
              ? weeklyBillingMode === 'per_session'
                ? priceMode === 'free'
                  ? null
                  : (effectivePrice ?? 0)
                : weeklyInitialSettlement === 'caja'
                  ? weeklyChargeLines.reduce((s, l) => s + (l.amountCents ?? 0), 0)
                  : (weeklyAgreedCents ?? 0)
              : priceMode === 'free'
                ? null
                : (effectivePrice ?? 0)
        }
        collectedCents={
          repeatMode === 'dates'
            ? multiPaymentMode === 'caja'
              ? multiChargeLines.reduce((s, l) => s + (l.amountCents ?? 0), 0)
              : multiPaymentMode === 'already_settled'
                ? effectiveMultiTotal
                : 0
            : repeatMode === 'weekly'
              ? weeklyBillingMode !== 'per_session' && weeklyInitialSettlement === 'caja'
                ? weeklyChargeLines.reduce((s, l) => s + (l.amountCents ?? 0), 0)
                : weeklyBillingMode !== 'per_session' &&
                    weeklyInitialSettlement === 'already_settled'
                  ? (weeklyAgreedCents ?? 0)
                  : 0
              : chargeChoice === 'already_settled'
                ? (effectivePrice ?? 0)
                : chargeChoice === 'partial' || chargeChoice === 'full'
                  ? (chargeAmount ?? 0)
                  : 0
        }
        primaryLabel={
          repeatMode === 'weekly'
            ? 'Crear evento semanal'
            : repeatMode === 'dates'
              ? `Agendar ${multiDates.length} fechas`
              : priceMode === 'free' || effectivePrice == null
                ? 'Agendar evento'
                : `Agendar evento · ${formatArs(effectivePrice)}`
        }
        onCancel={onClose}
        isPending={isPending}
        disabled={
          isPending ||
          (repeatMode === 'once' && (taken || priceMissing)) ||
          (repeatMode === 'weekly' &&
            weeklyBillingMode !== 'monthly' &&
            priceMode !== 'free' &&
            priceMissing)
        }
        error={error}
      />
    </form>
  )
}
