'use client'

import { Label } from '@/components/ui/label'
import DatePicker from '@/components/ui/date-picker'

/**
 * "Desde/Hasta" del alta semanal — compartido por Turno fijo y Evento
 * "Cada semana": dos `DatePicker` acotados al mismo día de la semana que el
 * slot de origen (`allowedDayOfWeek`), para que el rango no pueda salirse
 * del día que ya fijó la hora de inicio. "Hasta" es opcional (sin ella el
 * abonado no tiene fecha de fin).
 */
export function DateRangeFields({
  idPrefix,
  startsOn,
  onStartsOnChange,
  endsOn,
  onEndsOnChange,
  min,
  dayOfWeek,
}: {
  idPrefix: string
  startsOn: string
  onStartsOnChange: (v: string) => void
  endsOn: string
  onEndsOnChange: (v: string) => void
  min: string
  dayOfWeek: number
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-desde`}>Desde</Label>
        <DatePicker
          id={`${idPrefix}-desde`}
          value={startsOn}
          onChange={(v) => v && onStartsOnChange(v)}
          min={min}
          allowedDayOfWeek={dayOfWeek}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-hasta`}>
          Hasta <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <DatePicker
          id={`${idPrefix}-hasta`}
          value={endsOn}
          onChange={onEndsOnChange}
          min={startsOn}
          allowedDayOfWeek={dayOfWeek}
        />
      </div>
    </div>
  )
}
