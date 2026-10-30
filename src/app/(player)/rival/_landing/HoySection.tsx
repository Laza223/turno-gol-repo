import { cssVars } from './css-vars'
import s from './landing.module.css'
import { PlayerDot, SeJuegaChip } from './pitch'
import { HOLE_POSITION, HOY_PLAYERS } from './pitch-players'
import { StatusChip } from './StatusChip'
import { TablonTabs } from './TablonTabs'

const STEPS = [
  {
    title: 'Armás el partido',
    text: 'Complejo, día, hora, formato y nivel: Tranqui, Parejo o Picante. Si la cancha ya está reservada en TurnoGol, el partido lo dice.',
  },
  {
    title: 'Pasás el link al grupo',
    text: 'Por WhatsApp, como siempre. El link muestra el partido y cuántos faltan.',
  },
  {
    title: 'Cada uno toca Voy',
    text: 'El cupo es de verdad: cuando se llena, se llena. El que llega tarde va al banco y entra solo si alguien se baja. Bajarse es un toque, sin drama. Y el fijo de la semana se repite sin armarlo de cero.',
  },
  {
    title: '¿Falta 1? Al tablón.',
    text: 'Publicás el mismo partido y se suma gente de afuera. Vos aceptás a cada uno, y recién ahí ve tu WhatsApp.',
  },
] as const

/** 1. Hoy ya se juega: la jugada se arma con el scroll (escena fijada) y después el tablón. */
export function HoySection() {
  return (
    <>
      <section
        className={`${s.hoy} ${s.scene} ${s.pin}`}
        id="hoy"
        data-scene="pin"
        data-hook="hoy"
        style={cssVars({ '--len': '420svh' })}
        aria-labelledby="hoy-h"
      >
        <div className={`${s.stage} ${s.wrap}`}>
          <div className={s.split}>
            <div>
              <div className={s.head}>
                <StatusChip piece="groupMatch" />
                <h2 className={s.display} id="hoy-h">
                  Chau, encuesta del <span className={s.acc}>grupo.</span>
                </h2>
              </div>
              <ol className={s.steps}>
                {STEPS.map((step) => (
                  <li key={step.title} data-hoy-step="">
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </li>
                ))}
              </ol>
              <div className={s.ticks} aria-hidden="true">
                {STEPS.map((step) => (
                  <i key={step.title} data-hoy-tick="" />
                ))}
              </div>
            </div>
            <div className={`${s.board} ${s.rivalPizarra}`}>
              <div className={s.boardHead}>
                <div>
                  <p className={s.boardMeta}>Ejemplo · Miércoles 21:00 · Fútbol 5</p>
                  <p className={s.boardCount} data-hoy-count="">
                    <span data-count-text="">¡Estamos los 10!</span>
                    <SeJuegaChip />
                  </p>
                </div>
              </div>
              <div className={s.field}>
                <svg className={s.chalkSvg} viewBox="0 0 600 380" aria-hidden="true">
                  <rect
                    className={s.draw}
                    pathLength={1}
                    x="20"
                    y="20"
                    width="560"
                    height="340"
                    rx="6"
                  />
                  <line className={s.draw} pathLength={1} x1="300" y1="20" x2="300" y2="360" />
                  <circle className={s.draw} pathLength={1} cx="300" cy="190" r="42" />
                  <path className={s.draw} pathLength={1} d="M20 110H92V270H20" />
                  <path className={s.draw} pathLength={1} d="M580 110H508V270H580" />
                </svg>
                <div className={s.matchCard}>
                  <b>Miércoles 21:00 · Fútbol 5</b>
                  Nivel Parejo
                  <br />
                  <span className={s.seal}>✓ Reservada en TurnoGol</span>
                </div>
                <div className={s.linkBubble}>
                  Link del partido
                  <br />
                  <u>Faltan 9 · Tocá Voy</u>
                </div>
                <div className={s.postCard}>En el tablón: Falta 1</div>
                {HOY_PLAYERS.map((player, i) => (
                  <PlayerDot key={player.initial} player={player} index={i} scene />
                ))}
                <span className={s.hole} style={HOLE_POSITION} aria-hidden="true">
                  <span className={s.in}>+1</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* El tablón (después de la escena) */}
      <section className={`${s.after} ${s.wrap}`} id="tablon" aria-labelledby="tablon-h">
        <TablonTabs />
      </section>
    </>
  )
}
