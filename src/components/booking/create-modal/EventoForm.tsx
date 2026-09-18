'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { toast } from '@/hooks/use-toast'
import { formatArs, formatDateLong } from '@/lib/format'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { priceForRange } from '@/lib/booking/pricing'
import { cn } from '@/lib/utils'
import { ContactField } from './ContactField'
import { ChargeSection } from './ChargeSection'
import { DateRangeFields } from './DateRangeFields'
import { Summary } from './Summary'
import { usePlayerSearch } from './use-player-search'
import { useSlotAvailability } from './use-slot-availability'
import { durationHours, endTimeOptions, toDdMm, weekdayOf, WEEKDAY_NAMES_ES } from './time-options'
import { selectClass } from './styles'
import type { ChargeChoice, DepositMethod, TypeFormProps } from './types'

const EVENT_CHIPS = ['Escuelita', 'Torneo', 'Cumpleaños', 'Clase', 'Otro'] as const

type PriceMode = 'priced' | 'free'
/** "Una vez" crea la reserva del slot clicado; "Cada semana" crea un abonado
 * (mismo camino que Turno fijo) — D1, docs/decisions/2026-09-15-evento-repetible-edicion-y-cobro-parcial.md. */
type RepeatMode = 'once' | 'weekly'

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

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  function handleEndChange(next: string) {
    setTimeEnd(next)
    setManualPriceCents(null)
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
    // El cobro semanal se hace por sesión desde el panel, no al alta: el
    // evento repetible nunca manda depositMethod/depositAmount (ChargeSection
    // queda oculta en este modo).
    if (next === 'weekly') {
      setChargeChoice('none')
      setChargeMethod(null)
      setChargeAmount(null)
    }
  }

  function pickChip(chip: string) {
    if (chip === 'Otro') {
      handleNameChange('')
      nameInputRef.current?.focus()
      return
    }
    handleNameChange(chip)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending || (repeatMode === 'once' && taken)) return
    const trimmedName = name.trim()
    if (!playerId && !trimmedName) {
      setError('Poné el nombre del evento o del responsable.')
      return
    }
    if (priceMissing) {
      setError('Ingresá el precio del evento.')
      return
    }
    if (
      repeatMode === 'once' &&
      chargeChoice !== 'none' &&
      (!chargeMethod || !chargeAmount || chargeAmount <= 0)
    ) {
      setError('Ingresá cuánto cobraste.')
      return
    }

    const trimmedPhone = phone.trim()
    setError(null)

    if (repeatMode === 'weekly') {
      const weeklyData = {
        courtId: slot.courtId,
        ...(playerId ? { playerId } : {}),
        contactName: trimmedName,
        ...(trimmedPhone ? { contactPhone: trimmedPhone } : {}),
        // Único camino con teléfono opcional (D1) — el gate server-side de
        // `createAbonadoSchema` lo exige salvo que venga esta marca.
        viaWeeklyEvent: true,
        dayOfWeek,
        timeStart,
        timeEnd,
        pricePerSession: priceMode === 'free' ? 0 : (effectivePrice ?? 0),
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
          trackConfirmed({ withPlayer: !!playerId })
          const conflicts = result.conflictDates ?? []
          toast({
            title: 'Evento semanal creado',
            description:
              `${result.slotsGenerated ?? 0} fechas` +
              (conflicts.length > 0
                ? ` — Fechas ocupadas: ${conflicts.map(toDdMm).join(', ')}`
                : ''),
            variant: 'success',
          })
          onSuccess()
        } catch (err) {
          Sentry.captureException(err)
          startTransition(() =>
            setError('No pudimos crear el evento semanal. Revisá tu conexión e intentá de nuevo.'),
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
      ...(priceMode === 'priced' && chargeChoice !== 'none' && chargeMethod && chargeAmount
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
          withDeposit: priceMode === 'priced' && chargeChoice !== 'none',
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
          setError('No pudimos agendar el evento. Revisá tu conexión e intentá de nuevo.'),
        )
      }
    })
  }

  const durationLabel =
    repeatMode === 'weekly'
      ? `${durationHours(timeStart, timeEnd)} h · por semana`
      : `${durationHours(timeStart, timeEnd)} h`

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 lg:p-6">
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Repetición
          </h4>
          <SegmentedControl
            className="grid grid-cols-2 gap-1.5"
            aria-label="Repetición del evento"
            value={repeatMode}
            onValueChange={handleRepeatModeChange}
            itemClassName={(active) =>
              cn(
                'h-11 md:h-9 cursor-pointer rounded-lg border text-xs font-semibold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:bg-accent',
              )
            }
            options={[
              { value: 'once', label: 'Una vez' },
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
                className={cn(
                  'h-11 md:h-9 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors',
                  name === chip
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
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
              <p className={cn(selectClass, 'flex items-center text-muted-foreground')}>
                {timeStart}
              </p>
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
              Este turno acaba de ser tomado.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Precio y cobro
          </h4>
          <SegmentedControl
            className="grid grid-cols-2 gap-1.5"
            aria-label="Precio del evento"
            value={priceMode}
            onValueChange={handlePriceModeChange}
            itemClassName={(active) =>
              cn(
                'h-11 md:h-9 cursor-pointer rounded-lg border text-xs font-semibold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:bg-accent',
              )
            }
            options={[
              { value: 'priced', label: 'Tiene precio' },
              { value: 'free', label: 'No se cobra' },
            ]}
          />

          {priceMode === 'priced' &&
            (suggestedPrice == null ? (
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
            ))}

          {repeatMode === 'once' && priceMode === 'priced' && (
            <ChargeSection
              totalCents={effectivePrice ?? 0}
              choice={chargeChoice}
              method={chargeMethod}
              amountCents={chargeAmount}
              onChoiceChange={setChargeChoice}
              onMethodChange={setChargeMethod}
              onAmountChange={setChargeAmount}
            />
          )}

          {repeatMode === 'weekly' && (
            <DateRangeFields
              idPrefix="evento"
              startsOn={startsOn}
              onStartsOnChange={setStartsOn}
              endsOn={endsOn}
              onEndsOnChange={setEndsOn}
              min={slot.date}
              dayOfWeek={dayOfWeek}
            />
          )}
        </section>
      </div>

      <Summary
        courtName={slot.courtName}
        dateLabel={formatDateLong(slot.date)}
        timeStart={timeStart}
        timeEnd={timeEnd}
        durationLabel={durationLabel}
        totalCents={priceMode === 'free' ? null : (effectivePrice ?? 0)}
        collectedCents={chargeChoice !== 'none' ? (chargeAmount ?? 0) : 0}
        primaryLabel={
          repeatMode === 'weekly'
            ? 'Crear evento semanal'
            : priceMode === 'free' || effectivePrice == null
              ? 'Agendar evento'
              : `Agendar evento · ${formatArs(effectivePrice)}`
        }
        onCancel={onClose}
        isPending={isPending}
        disabled={isPending || (repeatMode === 'once' && taken) || priceMissing}
        error={error}
      />
    </form>
  )
}
