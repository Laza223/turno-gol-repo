import s from './landing.module.css'
import { cssVars, DISPLAY_FONT } from './css-vars'
import { StatusChip } from './StatusChip'

// Cada círculo viaja de (x0, y0) a (x1, y1) en coordenadas de diseño (600 de ancho).
const DOTS = [
  { team: 'pe', x0: 110, y0: 110, x1: 60, y1: 190 },
  { team: 'sp', x0: 180, y0: 250, x1: 125, y1: 115 },
  { team: 'pe', x0: 250, y0: 90, x1: 125, y1: 265 },
  { team: 'sp', x0: 330, y0: 200, x1: 205, y1: 135 },
  { team: 'pe', x0: 400, y0: 300, x1: 205, y1: 245 },
  { team: 'sp', x0: 470, y0: 110, x1: 70, y1: 410 },
  { team: 'pe', x0: 150, y0: 310, x1: 120, y1: 410 },
  { team: 'sp', x0: 290, y0: 320, x1: 170, y1: 410 },
  { team: 'pe', x0: 380, y0: 80, x1: 220, y1: 410 },
  { team: 'sp', x0: 510, y0: 250, x1: 270, y1: 410 },
] as const

/** 3. Grupo no es club: el picado se ordena en club (escena fijada) y después lo que tiene el grupo. */
export function GrupoClubSection() {
  return (
    <>
      <section
        className={`${s.gc} ${s.scene} ${s.pin}`}
        id="grupo-club"
        data-scene="pin"
        data-hook="grupo-club"
        style={cssVars({ '--len': '300svh' })}
        aria-labelledby="gc-h"
      >
        <div className={`${s.stage} ${s.wrap}`}>
          <div className={s.split}>
            <div>
              <h2 className={s.display} id="gc-h" style={{ fontSize: 'clamp(34px,4.4vw,64px)' }}>
                <span className={s.one}>
                  El fijo es para <span className={s.acc}>jugar.</span>
                </span>{' '}
                <span className={s.two}>El club, para competir.</span>
              </h2>
              <div className={s.cols}>
                <div className={`${s.col} ${s.groupC}`}>
                  <h3>El grupo</h3>
                  <p>
                    El fijo de los miércoles, pecheras contra sin pechera. Muy pronto, cada picado
                    va a sumar a tus partidos jugados, y nada más: sin tabla, sin goles, sin figura.
                  </p>
                </div>
                <div className={`${s.col} ${s.clubC}`}>
                  <h3>
                    El club <StatusChip piece="club" />
                  </h3>
                  <p>
                    Un equipo serio que vive en TurnoGol: nombre, escudo, plantel, títulos y
                    antigüedad. Juega contra otros clubes, y esos partidos sí cuentan.
                  </p>
                </div>
              </div>
            </div>
            <div className={`${s.board} ${s.rivalPizarra}`}>
              <div className={s.gfield}>
                <svg className={s.chalkSvg} viewBox="0 0 600 440" aria-hidden="true">
                  <rect x="20" y="20" width="560" height="340" rx="6" />
                  <line x1="300" y1="20" x2="300" y2="360" />
                  <circle cx="300" cy="190" r="48" />
                  <path d="M20 110H92V270H20M580 110H508V270H580" />
                  <line x1="40" y1="410" x2="300" y2="410" strokeDasharray="2 8" />
                </svg>
                {DOTS.map((dot, i) => (
                  <span
                    key={i}
                    className={`${s.gdot} ${dot.team === 'pe' ? s.pe : s.sp}`}
                    style={cssVars({
                      '--i': i,
                      '--x0': dot.x0,
                      '--y0': dot.y0,
                      '--x1': dot.x1,
                      '--y1': dot.y1,
                    })}
                    aria-hidden="true"
                  />
                ))}
                <svg className={s.crest} viewBox="0 0 100 116" aria-hidden="true">
                  <path
                    d="M50 4 92 18v38c0 28-18 46-42 56C26 102 8 84 8 56V18Z"
                    fill="#065f46"
                    stroke="#f8fafc"
                    strokeWidth="4"
                  />
                  <path d="M8 52 92 30v18L8 70Z" fill="#f8fafc" />
                  <text
                    x="50"
                    y="96"
                    textAnchor="middle"
                    style={{ fontFamily: DISPLAY_FONT }}
                    fontWeight="900"
                    fontStyle="italic"
                    fontSize="22"
                    fill="#f8fafc"
                  >
                    DP
                  </text>
                </svg>
                <svg className={s.rivalGhost} viewBox="0 0 100 116" aria-hidden="true">
                  <path
                    d="M50 4 92 18v38c0 28-18 46-42 56C26 102 8 84 8 56V18Z"
                    fill="none"
                    stroke="#f8fafc"
                    strokeWidth="3"
                    strokeDasharray="6 6"
                  />
                </svg>
                <span className={s.benchL}>Suplentes</span>
              </div>
              <p
                className={s.boardLegend}
                style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}
              >
                Ejemplo: el grupo de los miércoles funda Los Mismos de Siempre y sale a jugar contra
                otro club.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className={`${s.after} ${s.wrap}`}
        aria-label="Lo que ya tiene y lo que va a tener el grupo"
      >
        <div className={s.twoCol} style={{ alignItems: 'start' }}>
          <div data-reveal="">
            <h3 className={s.display} style={{ fontSize: 28 }}>
              El grupo, hoy y lo que viene
            </h3>
            <ul className={s.chalkList} style={{ marginTop: 18 }}>
              <li>
                <b>La convocatoria</b> <StatusChip piece="groupMatch" />
                <br />
                El partido del grupo, con su link.
              </li>
              <li>
                <b>La formación</b> <StatusChip piece="formation" />
                <br />
                Cada uno toca su puesto y los huecos salen al tablón: &quot;Faltan 2: un defensor y
                un delantero&quot;.
              </li>
              <li>
                <b>Pan y queso</b> <StatusChip piece="panYQueso" />
                <br />
                Equipos parejos para el picado, sin mostrar el nivel de nadie.
              </li>
            </ul>
          </div>
          <div data-reveal="" style={cssVars({ '--rd': '90ms' })}>
            <p className={s.closer}>
              ¿Tu grupo juega en serio? Que tus partidos cuenten:{' '}
              <span className={s.acc}>armá tu club.</span>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
