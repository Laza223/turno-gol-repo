import Link from 'next/link'
import { ArmarCta, type LandingEntry } from './ArmarCta'
import { cssVars } from './css-vars'
import s from './landing.module.css'
import { StatusChip } from './StatusChip'

const ARMALO = ['A', 'R', 'M', 'A', 'L', 'O'] as const

/**
 * 10. Temporada Cero: el borrador limpia la pizarra (escena fijada) y la banda ARMALO (de paso).
 */
export function TemporadaCeroSection({ entry }: { entry: LandingEntry }) {
  return (
    <>
      <section
        className={`${s.tz} ${s.scene} ${s.pin}`}
        id="temporada-cero"
        data-scene="pin"
        data-hook="temporada-cero"
        style={cssVars({ '--len': '220svh' })}
        aria-labelledby="tz-h"
      >
        <div className={`${s.stage} ${s.wrap}`}>
          <StatusChip piece="seasonZero" className={s.selfStart} />
          <div className={`${s.board} ${s.rivalPizarra}`}>
            <svg className={s.chalkSvg} viewBox="0 0 600 360" aria-hidden="true">
              <g className={s.ghostPlay}>
                <path d="M60 280C140 200 200 260 260 170S380 90 470 120" />
                <path d="m458 106 14 14-18 6" />
                <path d="M90 90l20 20m0-20-20 20M200 300l20 20m0-20-20 20M380 250l20 20m0-20-20 20" />
                <circle cx="160" cy="130" r="14" />
                <circle cx="330" cy="70" r="14" />
                <circle cx="520" cy="250" r="14" />
                <path d="M300 300c40-30 90-30 130 0" strokeDasharray="6 8" />
              </g>
            </svg>
            <h2 className={`${s.display} ${s.title}`} id="tz-h">
              Temporada <span className={s.acc}>Cero.</span>
            </h2>
            <div className={s.eraserMove} aria-hidden="true">
              <span className={s.eraser} />
            </div>
            <span className={s.stamp} aria-hidden="true">
              FUNDADOR
            </span>
          </div>
          <p className={s.lede} style={{ marginTop: 16 }}>
            Los primeros clubes se fundan en la Temporada Cero, y los que la jueguen quedan como
            Fundadores. La primera temporada pasa una sola vez.
          </p>
          <p style={{ marginTop: 10, fontWeight: 600 }}>
            Mientras tanto, armá el partido de esta semana.
          </p>
        </div>
      </section>

      <ArmarCta
        entry={entry}
        className={`${s.armalo} ${s.scene}`}
        sceneView
        ariaLabel="Armá el partido de esta semana"
      >
        <span className={s.top} aria-hidden="true">
          <span>Armá el partido de esta semana</span>
          <svg viewBox="0 0 24 24">
            <path d="M5 19 19 5M8 5h11v11" />
          </svg>
        </span>
        <span className={s.word} aria-hidden="true">
          {ARMALO.map((letter, i) => (
            <span key={i} style={cssVars({ '--i': i })}>
              {letter}
            </span>
          ))}
        </span>
      </ArmarCta>
      <p className={s.afterArmalo}>
        <Link className={s.link} href="/rival/tablon">
          Mirá el tablón
        </Link>
      </p>
    </>
  )
}
