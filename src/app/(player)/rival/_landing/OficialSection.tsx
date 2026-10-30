import { cssVars } from './css-vars'
import s from './landing.module.css'
import { StatusChip } from './StatusChip'

const SHIELD_PATH = 'M50 4 92 18v38c0 28-18 46-42 56C26 102 8 84 8 56V18Z'

const TRAITS = [
  ['La cartelera de la zona.', 'Los partidos que se vienen, con los dos escudos.'],
  ['La tabla.', 'Por zona, formato y división. Aparece el club que quiere.'],
  ['Divisiones y temporadas.', 'Ascensos, descensos y "¡Zafamos!".'],
  ['Clásicos.', 'Cuando dos clubes se cruzan seguido, nace el clásico, con su historial.'],
  [
    'La Corona del complejo.',
    'Un club la tiene y cualquiera lo desafía. Si le ganás, te la llevás.',
  ],
  ['Desafío y revancha.', 'En un toque, por WhatsApp.'],
  [
    '¿Volverían a jugar?',
    'Después del partido, cada equipo dice sí o no del rival. Lo bueno se ve; lo malo no se le muestra a otros jugadores.',
  ],
  ['El álbum de la zona.', 'Cada club que enfrentás, a tu álbum.'],
] as const

/** 5. El partido oficial: la Corona viaja de un club a otro (escena fijada) y después los rasgos. */
export function OficialSection() {
  return (
    <>
      <section
        className={`${s.po} ${s.scene} ${s.pin}`}
        id="oficial"
        data-scene="pin"
        data-hook="oficial"
        style={cssVars({ '--len': '280svh' })}
        aria-labelledby="po-h"
      >
        <div className={`${s.stage} ${s.wrap}`}>
          <StatusChip piece="officialMatch" className={s.selfStart} />
          <h2 className={s.display} id="po-h" style={{ marginTop: 10 }}>
            Club contra club. Esto <span className={s.acc}>cuenta.</span>
          </h2>
          <p className={s.lede} style={{ marginTop: 12 }}>
            El partido oficial es entre dos clubes, con turno en un complejo TurnoGol. Al final, los
            dos capitanes confirman el resultado en un toque, o lo confirma el encargado. Si no
            coinciden, no cuenta.
          </p>
          <div className={`${s.board} ${s.rivalPizarra}`} style={{ marginTop: 18 }}>
            <p style={{ position: 'absolute', left: 14, top: 12 }}>
              <span className={s.ej}>Ejemplo</span>
            </p>
            <div className={s.score}>
              <svg className={s.chalkSvg} viewBox="0 0 600 340" aria-hidden="true">
                <path
                  className={`${s.arc} ${s.draw}`}
                  pathLength={1}
                  d="M110 132Q300 -68 490 132"
                  strokeDasharray="1"
                />
              </svg>
              <div className={s.team} style={{ left: '18.3%' }}>
                <svg viewBox="0 0 100 116" aria-hidden="true">
                  <path d={SHIELD_PATH} fill="#065f46" stroke="#f8fafc" strokeWidth="4" />
                  <path d="M8 52 92 30v18L8 70Z" fill="#f8fafc" />
                </svg>
                <p>Los Mismos de Siempre</p>
              </div>
              <div className={s.result} aria-hidden="true">
                <span>3</span>
                <span style={{ opacity: 0.5 }}>–</span>
                <span className={s.digit}>
                  <span className={s.roll}>
                    <span>3</span>
                    <span>4</span>
                  </span>
                </span>
              </div>
              <div className={s.team} style={{ left: '81.7%' }}>
                <svg viewBox="0 0 100 116" aria-hidden="true">
                  <path d={SHIELD_PATH} fill="#334155" stroke="#f8fafc" strokeWidth="4" />
                  <path d="M50 4v108" stroke="#f8fafc" strokeWidth="10" />
                </svg>
                <p>Deportivo Rejunte</p>
              </div>
              <div className={s.crown} aria-hidden="true">
                <svg viewBox="0 0 64 48">
                  <path d="M4 40 0 10l16 12L32 2l16 20 16-12-4 30Z" fill="var(--gold)" />
                  <rect x="4" y="40" width="56" height="7" rx="2" fill="var(--gold)" />
                </svg>
              </div>
            </div>
            <p className={s.status}>
              <span className={s.old}>La Corona del complejo · Defensas: 2</span>
              <span className={s.new}>Nuevo campeón de la Corona · Defensas: 0</span>
            </p>
            <p className="sr-only">
              Ejemplo: Deportivo Rejunte le gana 4 a 3 a Los Mismos de Siempre y se lleva la Corona
              del complejo.
            </p>
          </div>
        </div>
      </section>

      <section className={`${s.after} ${s.wrap}`} aria-label="Lo que trae el partido oficial">
        <ul className={s.menu} data-reveal="">
          {TRAITS.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
