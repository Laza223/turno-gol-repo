'use client'

import { useRef, useState } from 'react'
import { cssVars } from './css-vars'
import s from './landing.module.css'
import { HERO_PLAYERS, HOLE_POSITION, PlayerDot, SeJuegaChip } from './pitch'

/**
 * La pizarra del hero. "Voy" es v1 real (contador, cupo, "¡Estamos los N!"), pero la demo no guarda
 * nada ni toca la base: es estado local. Sin JavaScript queda la pizarra quieta con "Falta 1".
 */
export function VoyDemo() {
  const [joined, setJoined] = useState(false)
  const holeRef = useRef<HTMLButtonElement>(null)

  function join() {
    if (!joined) setJoined(true)
  }

  function reset() {
    setJoined(false)
    holeRef.current?.focus()
  }

  return (
    <div className={`${s.heroBoard} ${s.rivalPizarra}`}>
      <div className={s.boardHead}>
        <div>
          <p className={s.boardMeta}>Ejemplo · Miércoles 21:00 · Fútbol 5</p>
          <p className={joined ? `${s.boardCount} ${s.pulse}` : s.boardCount} aria-live="polite">
            {joined ? (
              <>
                ¡Estamos los 10!
                <SeJuegaChip />
              </>
            ) : (
              'Falta 1'
            )}
          </p>
        </div>
      </div>
      <div className={s.field}>
        <svg className={s.chalkSvg} viewBox="0 0 600 380" aria-hidden="true">
          <rect className={s.draw} pathLength={1} x="20" y="20" width="560" height="340" rx="6" />
          <line
            className={s.draw}
            pathLength={1}
            x1="300"
            y1="20"
            x2="300"
            y2="360"
            style={cssVars({ '--dd': '300ms' })}
          />
          <circle
            className={s.draw}
            pathLength={1}
            cx="300"
            cy="190"
            r="42"
            style={cssVars({ '--dd': '420ms' })}
          />
          <circle className={s.dot} cx="300" cy="190" r="3" />
          <path
            className={s.draw}
            pathLength={1}
            d="M20 110H92V270H20"
            style={cssVars({ '--dd': '520ms' })}
          />
          <path
            className={s.draw}
            pathLength={1}
            d="M580 110H508V270H580"
            style={cssVars({ '--dd': '520ms' })}
          />
          <path
            className={s.draw}
            pathLength={1}
            d="M20 160H8V220H20M580 160H592V220H580"
            style={cssVars({ '--dd': '600ms' })}
          />
          <path
            className={s.arrow}
            d="M226 116C280 64 334 66 372 112"
            stroke="#6ee7b7"
            strokeOpacity={0.9}
            strokeDasharray="6 7"
          />
        </svg>
        {HERO_PLAYERS.map((player, i) => (
          <PlayerDot key={player.initial} player={player} index={i} />
        ))}
        <button
          ref={holeRef}
          type="button"
          className={joined ? `${s.hole} ${s.joined}` : s.hole}
          style={HOLE_POSITION}
          aria-pressed={joined}
          aria-label="Voy: sumarme al partido de ejemplo"
          onClick={join}
        >
          <span className={s.in}>{joined ? 'Vos' : 'Voy'}</span>
        </button>
      </div>
      <p className="sr-only">Ejemplo de partido de Fútbol 5: 9 confirmados, falta 1.</p>
      <div className={s.legendRow}>
        <p className={s.boardLegend}>
          Ejemplo. Hoy tocás Voy y entrás. Muy pronto, además, elegís tu puesto en la cancha.
        </p>
        {joined && (
          <button type="button" className={s.reset} onClick={reset}>
            Reiniciar
          </button>
        )}
      </div>
    </div>
  )
}
