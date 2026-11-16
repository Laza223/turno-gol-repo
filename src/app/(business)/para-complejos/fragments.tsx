import { Fragment, type CSSProperties } from 'react'
import { ExampleTag } from './ExampleTag'

/**
 * El fragmento de producto de /para-complejos: la agenda de una noche, DIBUJADA (no es la grilla
 * real del panel). Todo lo que muestra es un EJEMPLO (nombres, horarios y estados) y lo dice.
 * El movimiento (celdas que se encienden por fila, la "Sin cobrar" que late) está en
 * `para-complejos.css` y lo gatilla el `Reveal` que la envuelve.
 */

type Celda = { tipo: 'ok' | 'fix' | 'due'; titulo: string; estado: string } | { tipo: 'free' }

const CANCHAS = ['Cancha 1', 'Cancha 2', 'Cancha 3'] as const

const FILAS: { hora: string; celdas: Celda[] }[] = [
  {
    hora: '19:00',
    celdas: [
      { tipo: 'ok', titulo: 'Reserva online', estado: 'Cobrado' },
      { tipo: 'fix', titulo: 'Fijo del jueves', estado: 'Cobrado' },
      { tipo: 'free' },
    ],
  },
  {
    hora: '20:00',
    celdas: [
      { tipo: 'due', titulo: 'Los del taller', estado: 'Sin cobrar' },
      { tipo: 'ok', titulo: 'Reserva online', estado: 'Cobrado' },
      { tipo: 'fix', titulo: 'Fijo del jueves', estado: 'Cobrado' },
    ],
  },
  {
    hora: '21:00',
    celdas: [
      { tipo: 'ok', titulo: 'Reserva online', estado: 'Cobrado' },
      { tipo: 'free' },
      { tipo: 'ok', titulo: 'Cumple de 10', estado: 'Cobrado' },
    ],
  },
  {
    hora: '22:00',
    celdas: [
      { tipo: 'fix', titulo: 'Fijo del jueves', estado: 'Paga al llegar' },
      { tipo: 'ok', titulo: 'Reserva online', estado: 'Cobrado' },
      { tipo: 'free' },
    ],
  },
]

function Cell({ celda, row }: { celda: Celda; row: number }) {
  const style = { '--r': row } as CSSProperties
  if (celda.tipo === 'free') {
    return (
      <span className="pc-free" style={style}>
        Libre
      </span>
    )
  }
  return (
    <span className={`pc-${celda.tipo}`} style={style}>
      <b>{celda.titulo}</b>
      {celda.tipo === 'due' ? <i>{celda.estado}</i> : celda.estado}
    </span>
  )
}

export function AgendaFragment() {
  return (
    <figure
      role="img"
      aria-label="Ejemplo de la agenda de una noche en el panel. Tres canchas de 19 a 22. Un turno de las 20 quedó sin cobrar y se ve en rojo."
      className="pc-night glass-painted"
    >
      <div aria-hidden>
        <div className="pc-night__bar">
          <b>Hoy, jueves 12</b>
          <span>3 canchas · 1 turno sin cobrar</span>
          <ExampleTag />
        </div>
        <div className="pc-agenda">
          <span className="pc-hd" />
          {CANCHAS.map((c) => (
            <span key={c} className="pc-hd">
              {c}
            </span>
          ))}
          {FILAS.map((f, row) => (
            <Fragment key={f.hora}>
              <span className="pc-t">{f.hora}</span>
              {f.celdas.map((celda, i) => (
                <Cell key={i} celda={celda} row={row} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </figure>
  )
}
