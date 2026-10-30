import type { ReactNode } from 'react'
import { cssVars, DISPLAY_FONT } from './css-vars'
import s from './landing.module.css'
import { StatusChip } from './StatusChip'

const CHALK = '#f8fafc'

// Las piezas dibujadas que van adentro del párrafo (palabras-imagen), de "Los Mismos de Siempre".
const PIC_SHIELD = (
  <svg viewBox="0 0 24 28" aria-hidden="true">
    <path
      d="M12 1 23 5v9c0 7-5 11-11 13C6 25 1 21 1 14V5Z"
      fill="#065f46"
      stroke={CHALK}
      strokeWidth="1.6"
    />
  </svg>
)
const PIC_SHIRT = (
  <svg viewBox="0 0 28 26" aria-hidden="true">
    <path d="M9 1 1 6l3 6 3-1v14h14V11l3 1 3-6-8-5c-1 3-3 4-5 4S10 4 9 1Z" fill={CHALK} />
    <text
      x="14"
      y="21"
      textAnchor="middle"
      style={{ fontFamily: DISPLAY_FONT }}
      fontWeight="900"
      fontStyle="italic"
      fontSize="10"
      fill="#020617"
    >
      10
    </text>
  </svg>
)
const PIC_SQUAD = (
  <svg viewBox="0 0 46 24" aria-hidden="true">
    <g fill="none" stroke={CHALK} strokeOpacity=".8" strokeWidth="2">
      <circle cx="8" cy="12" r="6.5" />
      <circle cx="23" cy="12" r="6.5" />
      <circle cx="38" cy="12" r="6.5" />
    </g>
  </svg>
)
const PIC_STAR = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 1.5 15 8l7 .7-5.3 4.8 1.6 7L12 16.8 5.7 20.5l1.6-7L2 8.7 9 8Z"
      fill="var(--gold)"
    />
  </svg>
)

type Segment = { text: string } | { pic: ReactNode; wide?: boolean }

const PARAGRAPH: readonly Segment[] = [
  { text: 'Fundá tu club con nombre y escudo ' },
  { pic: PIC_SHIELD },
  { text: ', camiseta con tu número ' },
  { pic: PIC_SHIRT },
  { text: ' y un plantel que acepta la invitación ' },
  { pic: PIC_SQUAD, wide: true },
  { text: '. Cada título suma una estrella arriba del escudo ' },
  { pic: PIC_STAR },
  { text: '.' },
]

/** Parte el párrafo en palabras (y piezas) con su índice: el scroll las va prendiendo una a una. */
function splitWords(segments: readonly Segment[]): { nodes: ReactNode[]; count: number } {
  const nodes: ReactNode[] = []
  let index = 0
  segments.forEach((seg, k) => {
    if ('pic' in seg) {
      nodes.push(
        <span
          key={`p${k}`}
          className={`${s.pic} ${s.w}`}
          style={cssVars({ '--i': index++, ...(seg.wide ? { width: '1.9em' } : {}) })}
        >
          {seg.pic}
        </span>,
      )
      return
    }
    seg.text.split(/(\s+)/).forEach((part, j) => {
      if (!part) return
      if (/^\s+$/.test(part)) {
        nodes.push(part)
        return
      }
      nodes.push(
        <span key={`t${k}-${j}`} className={s.w} style={cssVars({ '--i': index++ })}>
          {part}
        </span>,
      )
    })
  })
  return { nodes, count: index }
}

const WORDS = splitWords(PARAGRAPH)

const TRAITS = [
  ['El nombre.', 'La IA te propone nombres con humor de potrero, y vos elegís.'],
  ['El escudo y la camiseta.', 'El escudo se arma de piezas.'],
  ['El plantel.', 'Entra quien acepta la invitación. Un club por jugador.'],
  ['Los dorsales.', 'El 10 se pelea.'],
  [
    'El mercado de pases.',
    'Se cambia de club solo en las ventanas de cada temporada. Cada fichaje sale con su tarjeta: "Es oficial".',
  ],
  ['El palmarés.', 'Una estrella arriba del escudo por cada título.'],
  ['La hinchada.', 'Cualquiera puede seguir a tu club.'],
  ['La historia.', 'La escribe la IA con los datos reales, sin nombrar a nadie.'],
] as const

const EXAMPLE_NAMES = [
  'Los Mismos de Siempre',
  'Deportivo Rejunte',
  'Deportivo Después Te Transfiero',
  'La Banda del Rulo',
  'Villa Resaca',
] as const

/** 4. Fundá tu club: el escudo se pinta y el párrafo se lee con el scroll (escena fijada). */
export function FundaClubSection() {
  return (
    <>
      <section
        className={`${s.fc} ${s.scene} ${s.pin}`}
        id="club"
        data-scene="pin"
        style={cssVars({ '--len': '260svh' })}
        aria-labelledby="fc-h"
      >
        <div className={`${s.stage} ${s.wrap}`}>
          <StatusChip piece="club" className={s.selfStart} />
          <h2 className={s.display} id="fc-h" style={{ marginTop: 10 }}>
            Fundá tu <span className={s.acc}>club.</span>
          </h2>
          <div className={s.grid} style={{ flex: '1 1 auto' }}>
            <div className={s.shield}>
              <svg viewBox="0 0 200 250" aria-hidden="true">
                <path
                  className={s.shPiece}
                  style={cssVars({ '--k': 3 })}
                  d="M100 6 108 22 126 24 113 36 116 54 100 46 84 54 87 36 74 24 92 22Z"
                  fill="var(--gold)"
                />
                <path
                  className={s.shPiece}
                  style={cssVars({ '--k': 0 })}
                  d="M100 62 184 86v66c0 46-36 76-84 92-48-16-84-46-84-92V86Z"
                  fill="#065f46"
                />
                <path
                  className={s.shPiece}
                  style={cssVars({ '--k': 1 })}
                  d="M16 140 184 104v32L16 172Z"
                  fill={CHALK}
                />
                <text
                  className={s.shPiece}
                  style={cssVars({ '--k': 2, fontFamily: DISPLAY_FONT })}
                  x="100"
                  y="216"
                  textAnchor="middle"
                  fontWeight="900"
                  fontStyle="italic"
                  fontSize="44"
                  fill={CHALK}
                >
                  DP
                </text>
                <path
                  className={`${s.shOut} ${s.draw}`}
                  pathLength={1}
                  d="M100 62 184 86v66c0 46-36 76-84 92-48-16-84-46-84-92V86Z"
                  fill="none"
                  stroke={CHALK}
                  strokeOpacity=".8"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
              </svg>
              <p style={{ textAlign: 'center', marginTop: 8 }}>
                <span className={s.ej}>Ejemplo · Los Mismos de Siempre</span>
              </p>
            </div>
            <p className={s.words} style={cssVars({ '--n': WORDS.count })}>
              {WORDS.nodes}
            </p>
          </div>
        </div>
      </section>

      <section className={`${s.after} ${s.wrap}`} aria-label="Lo que tiene un club">
        <ul className={`${s.chalkList} ${s.twoCol}`} data-reveal="">
          {TRAITS.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b> {text}
            </li>
          ))}
        </ul>
        <div data-reveal="" style={{ marginTop: 32 }}>
          <span className={s.ej}>Ejemplo · nombres que podría tirar la IA</span>
          <ul className={s.names}>
            {EXAMPLE_NAMES.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
