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
import { DateRangeFields } from './DateRangeFields'
import { Summary } from './Summary'
import { usePlayerSearch } from './use-player-search'
import { endTimeOptions, weekdayOf, toDdMm, WEEKDAY_NAMES_ES } from './time-options'
import { selectClass } from './styles'
import type { TypeFormProps } from './types'

const paymentChipClass = (active: boolean) =>
  cn(
    'h-11 md:h-9 cursor-pointer rounded-lg border text-xs font-semibold transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card hover:bg-accent',
  )

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
  const [paymentMethod, setPaymentMethod] = useState<'' | 'cash' | 'transfer'>('')

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
    if (!trimmedPhone) {
      setError('Ingresá un teléfono de contacto.')
      return
    }
    if (priceMissing) {
      setError('Ingresá el precio por turno.')
      return
    }

    const data = {
      courtId: slot.courtId,
      ...(playerId ? { playerId } : {}),
      contactName: trimmedName,
      contactPhone: trimmedPhone,
      dayOfWeek,
      timeStart,
      timeEnd,
      pricePerSession: effectivePrice!,
      startsOn,
      ...(endsOn ? { endsOn } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
    }

    setError(null)
    startTransition(async () => {
      try {
        const result = await createAbonadoAction(data)
        if (!result.success) {
          setError(result.error)
          return
        }
        trackConfirmed({ withPlayer: !!playerId })
        const conflicts = result.conflictDates ?? []
        toast({
          title: 'Turno fijo creado',
          description:
            `${result.slotsGenerated ?? 0} turnos agendados` +
            (conflicts.length > 0 ? ` — Fechas ocupadas: ${conflicts.map(toDdMm).join(', ')}` : ''),
          variant: 'success',
        })
        onSuccess()
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos crear el turno fijo. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 lg:p-6">
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
            phoneRequired
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
              <p className={cn(selectClass, 'flex items-center text-muted-foreground')}>
                {timeStart}
              </p>
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
          {suggestedPrice == null ? (
            <div className="space-y-1.5">
              <Label htmlFor="fijo-precio">Precio por turno</Label>
              <p className="text-xs text-muted-foreground">Sin tarifa configurada en la grilla.</p>
              <MoneyInput
                id="fijo-precio"
                valueCents={manualPriceCents}
                onValueChange={setManualPriceCents}
                minCents={1}
                required
              />
            </div>
          ) : priceEditing ? (
            <div className="space-y-1.5">
              <Label htmlFor="fijo-precio">Precio por turno</Label>
              <MoneyInput
                id="fijo-precio"
                valueCents={manualPriceCents ?? suggestedPrice}
                onValueChange={setManualPriceCents}
                minCents={1}
              />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm">
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

          <DateRangeFields
            idPrefix="fijo"
            startsOn={startsOn}
            onStartsOnChange={setStartsOn}
            endsOn={endsOn}
            onEndsOnChange={setEndsOn}
            min={slot.date}
            dayOfWeek={dayOfWeek}
          />

          <div className="space-y-1.5">
            <Label htmlFor="fijo-pago">
              ¿Cómo paga? <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <SegmentedControl<'' | 'cash' | 'transfer'>
              className="grid grid-cols-2 gap-1.5"
              aria-label="¿Cómo paga?"
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              itemClassName={paymentChipClass}
              options={[
                { value: 'cash', label: 'Efectivo' },
                { value: 'transfer', label: 'Transferencia' },
              ]}
            />
          </div>
        </section>
      </div>

      <Summary
        courtName={slot.courtName}
        dateLabel={formatDateLong(slot.date)}
        timeStart={timeStart}
        timeEnd={timeEnd}
        durationLabel="por semana"
        totalCents={effectivePrice}
        collectedCents={0}
        primaryLabel="Crear turno fijo"
        onCancel={onClose}
        isPending={isPending}
        disabled={isPending || priceMissing}
        error={error}
      />
    </form>
  )
}
