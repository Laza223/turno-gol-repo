import Image from 'next/image'
import Link from 'next/link'
import { cssVars } from './css-vars'
import s from './landing.module.css'
import { StatusChip } from './StatusChip'

const TRAITS = [
  ['Leyenda de la cancha.', 'La gana el que más juega ahí. Premia la constancia, no el talento.'],
  ['Complejo de la zona.', 'Cada mes, el complejo con más vida RIVAL.'],
  ['Sede oficial RIVAL.', 'El sticker en la puerta, con QR.'],
  ['Hora RIVAL.', 'El complejo publica partidos de la casa con la Corona en juego.'],
] as const

// Las cuatro canchas de las esquinas; la del medio es la ventana con la foto.
const CORNER_COURTS = [
  { x: 30, y: 20, cx: 150, cy: 80 },
  { x: 330, y: 20, cx: 450, cy: 80 },
  { x: 30, y: 260, cx: 150, cy: 320 },
  { x: 330, y: 260, cx: 450, cy: 320 },
] as const

/** 8. Tu cancha: la foto se abre en el círculo central (escena fijada) y después los rasgos. */
export function TuCanchaSection() {
  return (
    <>
      <section
        className={`${s.tc} ${s.scene} ${s.pin}`}
        id="tu-cancha"
        data-scene="pin"
        data-hook="tu-cancha"
        style={cssVars({ '--len': '260svh' })}
        aria-labelledby="tc-h"
      >
        <div className={`${s.stage} ${s.wrap}`}>
          <StatusChip piece="stadium" className={s.selfStart} />
          <h2 className={s.display} id="tc-h" style={{ marginTop: 10 }}>
            Tu cancha, tu <span className={s.acc}>estadio.</span>
          </h2>
          <p className={s.lede} style={{ marginTop: 12 }}>
            Cada complejo TurnoGol tiene su página RIVAL: la Corona en juego, los clásicos que se
            juegan ahí y sus leyendas.
          </p>
          <div className={`${s.board} ${s.rivalPizarra}`}>
            <svg className={s.chalkSvg} viewBox="0 0 600 400" aria-hidden="true">
              <g className={s.others}>
                {CORNER_COURTS.map((c) => (
                  <g key={`${c.x}-${c.y}`}>
                    <rect x={c.x} y={c.y} width="240" height="120" rx="4" />
                    <line x1={c.cx} y1={c.y} x2={c.cx} y2={c.y + 120} />
                    <circle cx={c.cx} cy={c.cy} r="22" />
                  </g>
                ))}
                <rect x="180" y="140" width="240" height="120" rx="4" />
                <line x1="300" y1="140" x2="300" y2="260" />
              </g>
            </svg>
            <div className={s.window}>
              <Image
                src="/bg-hero-2.webp"
                alt="Foto de ejemplo: una cancha de fútbol 5 iluminada de noche"
                width={1200}
                height={800}
                sizes="(min-width: 1024px) 450px, 50vw"
                loading="lazy"
              />
            </div>
            <span className={s.sticker}>Sede oficial RIVAL</span>
            <p style={{ position: 'absolute', left: 14, bottom: 12, zIndex: 3 }}>
              <span className={s.ej} style={{ background: 'rgba(2,6,23,.7)' }}>
                Ejemplo
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className={`${s.after} ${s.wrap}`} aria-label="Lo que tiene tu cancha">
        <div className={s.tcAfter}>
          <ul className={s.chalkList} data-reveal="">
            {TRAITS.map(([title, text]) => (
              <li key={title}>
                <b>{title}</b> {text}
              </li>
            ))}
          </ul>
          <div data-reveal="" style={cssVars({ '--rd': '90ms', display: 'grid', gap: 18 })}>
            <div className={s.glass}>
              <h3>
                Pedí tu cancha <StatusChip piece="requestCourt" />
              </h3>
              <p>¿Jugás en un complejo sin TurnoGol? Pedilo, y le llevamos tu pedido.</p>
            </div>
            <p style={{ color: 'var(--ink-2)' }}>
              ¿Tenés un complejo?{' '}
              <Link className={s.link} href="/para-complejos">
                Conocé TurnoGol para complejos
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
