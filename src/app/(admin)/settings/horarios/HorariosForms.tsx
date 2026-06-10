'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  addClosedDateAction,
  removeClosedDateAction,
  updateHorariosAction,
  type HorariosActionResult,
} from './actions'

const INITIAL: HorariosActionResult = { success: true }

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
}
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

type OpeningHours = Record<string, { open: string; close: string }>

/** Form de horarios de apertura (#19): consume el HorariosActionResult. */
export function HorariosForm({ hours }: { hours: OpeningHours }) {
  const [state, formAction] = useFormState(updateHorariosAction, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-3">
      <div className="grid grid-cols-[8rem_1fr_1fr] items-center gap-x-4 gap-y-3">
        <div />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Apertura</p>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cierre</p>
        {DAYS.map((day) => (
          <div key={day} className="contents">
            <Label className="text-sm text-slate-700">{DAY_LABELS[day]}</Label>
            <Input
              name={`${day}_open`}
              type="time"
              defaultValue={hours[day]?.open ?? '08:00'}
              className="h-10 w-32"
            />
            <Input
              name={`${day}_close`}
              type="time"
              defaultValue={hours[day]?.close ?? '00:00'}
              className="h-10 w-32"
            />
          </div>
        ))}
      </div>
      <div className="pt-2">
        <SubmitButton className="bg-emerald-600 hover:bg-emerald-500">Guardar horarios</SubmitButton>
      </div>
      <div aria-live="polite" className="min-h-[1.25rem]">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700">Horarios guardados.</p>
        )}
      </div>
    </form>
  )
}

/** Form para agregar un día cerrado (#19). */
export function AddClosedDateForm({ minDate }: { minDate: string }) {
  const [state, formAction] = useFormState(addClosedDateAction, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="closedDate">Agregar día cerrado</Label>
          <Input id="closedDate" name="date" type="date" className="h-10 w-48" min={minDate} />
        </div>
        <SubmitButton variant="outline" pendingLabel="Agregando…" className="h-10">
          Agregar
        </SubmitButton>
      </div>
      <div aria-live="polite" className="min-h-[1.25rem]">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700">Día agregado.</p>
        )}
      </div>
    </form>
  )
}

/** Form inline por fila para quitar un día cerrado (#19). */
export function RemoveClosedDateForm({ date }: { date: string }) {
  const [state, formAction] = useFormState(removeClosedDateAction, INITIAL)

  return (
    <form action={formAction} className="text-right">
      <input type="hidden" name="date" value={date} />
      <SubmitButton
        variant="ghost"
        size="sm"
        pendingLabel="Quitando…"
        className="text-red-600 hover:text-red-700"
      >
        Quitar
      </SubmitButton>
      {!state.success && (
        <p role="alert" className="text-xs text-red-600">{state.error}</p>
      )}
    </form>
  )
}
