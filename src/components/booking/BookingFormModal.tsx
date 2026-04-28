'use client'

import { useRef, useState, useTransition } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { createBookingAction } from '@/app/(admin)/reservas/actions'
import type { BookingRow } from '@/modules/bookings/booking.types'

type Slot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  durationMins: 60 | 120
}

type Props = {
  slot: Slot
  open: boolean
  onClose: () => void
  onSuccess: (booking: BookingRow) => void
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function BookingFormModal({ slot, open, onClose, onSuccess }: Props) {
  const [duration, setDuration] = useState<60 | 120>(slot.durationMins)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const timeEnd = minsToTime(timeToMins(slot.timeStart) + duration)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const guestName = fd.get('guestName') as string
    const guestPhone = fd.get('guestPhone') as string
    const notesInternal = fd.get('notesInternal') as string

    const data = {
      courtId: slot.courtId,
      date: slot.date,
      timeStart: slot.timeStart,
      timeEnd,
      durationMins: duration,
      type: 'spontaneous' as const,
      ...(guestName ? { guestName: guestName.trim(), guestPhone: guestPhone.trim() } : {}),
      ...(notesInternal ? { notesInternal: notesInternal.trim() } : {}),
    }

    setError(null)
    startTransition(async () => {
      const result = await createBookingAction(data)
      if (result.success) {
        formRef.current?.reset()
        setDuration(slot.durationMins)
        onSuccess(result.booking)
      } else {
        setError(result.error)
      }
    })
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setError(null)
      setDuration(slot.durationMins)
      onClose()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-lg shadow-xl p-6 focus:outline-none">
          <Dialog.Title className="text-base font-semibold text-foreground mb-1">
            Nueva reserva
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            {slot.courtName} · {slot.date} · {slot.timeStart}–{timeEnd}
          </Dialog.Description>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Duración</label>
              <div className="flex gap-2">
                {([60, 120] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`flex-1 py-1.5 rounded border text-sm font-medium transition-colors duration-100 ${
                      duration === d
                        ? 'bg-sky-700 text-white border-sky-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="guestName"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Nombre del invitado <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="guestName"
                name="guestName"
                type="text"
                maxLength={200}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div>
              <label
                htmlFor="guestPhone"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Teléfono <span className="text-muted-foreground">(requerido si hay nombre)</span>
              </label>
              <input
                id="guestPhone"
                name="guestPhone"
                type="text"
                maxLength={50}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
                placeholder="Ej: 11-1234-5678"
              />
            </div>

            <div>
              <label
                htmlFor="notesInternal"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Notas internas <span className="text-muted-foreground">(opcional)</span>
              </label>
              <textarea
                id="notesInternal"
                name="notesInternal"
                maxLength={1000}
                rows={2}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 resize-none"
                placeholder="Solo visible para el staff"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors duration-100"
                >
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-sky-700 rounded-md hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-100"
              >
                {isPending ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
