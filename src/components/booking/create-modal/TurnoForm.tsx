'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { toast } from '@/hooks/use-toast'
import { formatArs, formatDateLong } from '@/lib/format'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { priceForDateSlot } from '@/lib/booking/pricing'
import { endLabelFromMins, hhmmToMins } from '@/shared/time/operating-day'
import { cn } from '@/lib/utils'
import { ContactField } from './ContactField'
import { ChargeSection } from './ChargeSection'
import { Summary } from './Summary'
import { usePlayerSearch } from './use-player-search'
import { useSlotAvailability } from './use-slot-availability'
import { freeStartTimes } from './time-options'
import { selectClass } from './styles'
import type { ChargeChoice, DepositMethod, TypeFormProps } from './types'

/** Turno — una hora de cancha para alguien: `spontaneous`, 60 min fijo. */
export function TurnoForm({
  slot,
  courtBookings,
  daySlots,
  pricing,
  isSlotPast,
  checkAvailabilityAction,
  searchPlayersAction,
  createBookingAction,
  onClose,
  onSuccess,
  trackConfirmed,
}: TypeFormProps) {
  const [timeStart, setTimeStart] = useState(slot.timeStart)
  const timeEnd = endLabelFromMins(hhmmToMins(timeStart) + 60)

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

  const startOptions = freeStartTimes({ slots: daySlots, courtBookings, isPast: isSlotPast })

  const gridPrice = priceForDateSlot(pricing, slot.date, timeStart)
  const [manualPriceCents, setManualPriceCents] = useState<number | null>(null)
  const [priceEditing, setPriceEditing] = useState(gridPrice == null)
  const effectivePrice = manualPriceCents ?? gridPrice
  const priceMissing = effectivePrice == null

  const [chargeChoice, setChargeChoice] = useState<ChargeChoice>('none')
  const [chargeMethod, setChargeMethod] = useState<DepositMethod | null>(null)
  const [chargeAmount, setChargeAmount] = useState<number | null>(null)

  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  function handleTimeStartChange(next: string) {
    setTimeStart(next)
    setManualPriceCents(null)
    setPriceEditing(priceForDateSlot(pricing, slot.date, next) == null)
    setChargeChoice('none')
    setChargeMethod(null)
    setChargeAmount(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending || taken) return
    const trimmedName = name.trim()
    if (!playerId && !trimmedName) {
      setError('Poné a nombre de quién va el turno.')
      return
    }
    if (priceMissing) {
      setError('Ingresá el precio del turno.')
      return
    }
    if (chargeChoice !== 'none' && (!chargeMethod || !chargeAmount || chargeAmount <= 0)) {
      setError('Ingresá cuánto cobraste.')
      return
    }

    const trimmedPhone = phone.trim()
    const data = {
      courtId: slot.courtId,
      date: slot.date,
      timeStart,
      timeEnd,
      type: 'spontaneous' as const,
      ...(playerId ? { playerId } : { guestName: trimmedName }),
      ...(!playerId && trimmedPhone ? { guestPhone: trimmedPhone } : {}),
      ...(manualPriceCents != null ? { priceOverride: manualPriceCents } : {}),
      ...(chargeChoice !== 'none' && chargeMethod && chargeAmount
        ? {
            depositMethod: chargeMethod,
            depositAmount: chargeAmount,
            depositStatus: 'paid' as const,
          }
        : {}),
      ...(notes.trim() ? { notesInternal: notes.trim() } : {}),
    }

    setError(null)
    startTransition(async () => {
      try {
        const result = await createBookingAction(data)
        if (!result.success) {
          setError(result.error)
          return
        }
        trackConfirmed({ withPlayer: !!playerId, withDeposit: chargeChoice !== 'none' })
        toast({
          title: 'Reserva creada',
          description: `${slot.courtName} · ${timeStart}–${timeEnd}`,
          variant: 'success',
        })
        onSuccess(result.booking)
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos crear la reserva. Revisá tu conexión e intentá de nuevo.')
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
            idBase="turno-contacto"
            nameLabel="¿A nombre de quién?"
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="turno-start">Empieza</Label>
              <select
                id="turno-start"
                className={selectClass}
                value={timeStart}
                onChange={(e) => handleTimeStartChange(e.target.value)}
              >
                {startOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Termina</Label>
              <p className={cn(selectClass, 'flex items-center text-muted-foreground')}>
                hasta {timeEnd} · 1 h
              </p>
            </div>
          </div>
          {taken && (
            <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
              Este turno acaba de ser tomado.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Precio y cobro
          </h4>
          {gridPrice == null ? (
            <div className="space-y-1.5">
              <Label htmlFor="turno-precio">Precio del turno</Label>
              <p className="text-xs text-muted-foreground">Sin precio en la grilla.</p>
              <MoneyInput
                id="turno-precio"
                valueCents={manualPriceCents}
                onValueChange={setManualPriceCents}
                minCents={1}
                required
              />
            </div>
          ) : priceEditing ? (
            <div className="space-y-1.5">
              <Label htmlFor="turno-precio">Precio del turno</Label>
              <MoneyInput
                id="turno-precio"
                valueCents={manualPriceCents ?? gridPrice}
                onValueChange={setManualPriceCents}
                minCents={0}
              />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <span className="font-semibold tabular-nums text-foreground">
                {formatArs(gridPrice)}
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

          {notesOpen ? (
            <div className="space-y-1.5">
              <Label htmlFor="turno-notas">Nota</Label>
              <textarea
                id="turno-notas"
                rows={2}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full resize-none rounded-lg border border-border bg-card px-3.5 py-2 text-base text-foreground md:text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="cursor-pointer text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Agregar nota
            </button>
          )}
        </section>
      </div>

      <Summary
        courtName={slot.courtName}
        dateLabel={formatDateLong(slot.date)}
        timeStart={timeStart}
        timeEnd={timeEnd}
        durationLabel="1 h"
        totalCents={effectivePrice}
        collectedCents={chargeChoice !== 'none' ? (chargeAmount ?? 0) : 0}
        primaryLabel={
          effectivePrice != null ? `Reservar · ${formatArs(effectivePrice)}` : 'Reservar'
        }
        onCancel={onClose}
        isPending={isPending}
        disabled={isPending || taken || priceMissing}
        error={error}
      />
    </form>
  )
}
