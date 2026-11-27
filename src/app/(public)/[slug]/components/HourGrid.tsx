'use client'

import './ficha.css'
import type { CSSProperties } from 'react'
import type { HourRow } from '@/lib/booking/hour-summary'

const HELD_HELP_ID = 'hora-senando'

const STATE_LABEL = (row: HourRow) =>
  row.state === 'free'
    ? `${row.freeCount} libres`
    : { last: 'Queda 1', only: 'Libre', held: 'Señando', full: 'Completo' }[row.state]

/**
 * Las horas del día en cuadrados, cuatro por fila (`.hgrid` de `ficha.css`). Cada una es un botón
 * con `aria-pressed`: tocarla abre la barra de "Reservar", por eso no es un RadioGroup, cuyas
 * flechas elegirían, y abrirían, sin querer. Debajo de cada hora, cuántas canchas quedan.
 *
 * El color lo da `data-state`: ámbar solo para "Queda 1", la única escasez real; "Señando" con
 * borde punteado y la ayuda visible debajo (no un `title`) porque puede liberarse (decisión v2 D1);
 * "Completo" tachada. Una hora sin lugar se ve y se dice, pero no se puede elegir.
 *
 * `entrada`: con cada día nuevo la grilla se remonta y las horas entran escalonadas a 24 ms
 * (dirección §4.5). Cambiar el tamaño o elegir una hora no las vuelve a escalonar.
 */
export default function HourGrid({
  rows,
  value,
  onChange,
  entrada,
}: {
  rows: HourRow[]
  value: string | null
  onChange: (time: string) => void
  entrada?: string
}) {
  return (
    <div>
      <div
        key={entrada}
        role="group"
        aria-label="Hora"
        data-entrada={entrada ? '' : undefined}
        className="hgrid"
      >
        {rows.map((row, i) => (
          <button
            key={row.time}
            type="button"
            data-hour={row.time}
            data-state={row.state}
            aria-pressed={row.time === value}
            disabled={row.freeCount === 0}
            aria-describedby={row.state === 'held' ? HELD_HELP_ID : undefined}
            onClick={() => onChange(row.time)}
            className="hourb"
            style={{ '--i': Math.min(i, 10) } as CSSProperties}
          >
            <b>{row.time}</b> <span>{STATE_LABEL(row)}</span>
          </button>
        ))}
      </div>
      {rows.some((r) => r.state === 'held') && (
        <p id={HELD_HELP_ID} className="mt-2 text-[13px] leading-5 text-portal-soft">
          Señando: alguien está pagando la seña. Si no confirma en unos minutos, el horario se
          vuelve a liberar.
        </p>
      )}
    </div>
  )
}
