import s from './landing.module.css'
import { StatusChip } from './StatusChip'

const FIGURITAS = [
  { edition: 'Debut', cls: s.fDebut, num: '7', club: 'Los Mismos de Siempre' },
  { edition: 'Plata', cls: s.fPlata, num: '4', club: 'Deportivo Rejunte' },
  { edition: 'Oro', cls: s.fOro, num: '10', club: 'La Banda del Rulo' },
  { edition: 'Figura', cls: s.fFigura, num: '9', club: 'La vota el rival' },
  { edition: 'Fundador', cls: s.fFundador, num: '1', club: 'Temporada Cero' },
] as const

const TRAITS = [
  ['La figura.', 'La vota el rival, así no se arregla entre amigos.'],
  [
    'La tapa.',
    'La IA escribe la crónica de cada partido oficial, con titular de diario deportivo. Habla de clubes y resultados: no nombra a nadie.',
  ],
  [
    'La figurita.',
    'Tu carta: foto, dorsal, club y números verdaderos. Con ediciones que se ganan jugando: Debut, Plata, Oro, Campeón, Figura y Fundador.',
  ],
  [
    'Tarjetas para todo.',
    'Resultado, fichaje, ascenso, "¡Subí a Quinta!", la Corona. Con un botón: "Que se sepa".',
  ],
  [
    'Tu carrera.',
    'Ganados, empatados y perdidos, clásicos, títulos y logros con nombre de crónica, como Centenario o Matador de clásicos. Algunos están ocultos.',
  ],
  ['Versus.', 'Tu carrera contra la de un amigo, si los dos aceptan.'],
  ['Tu Temporada.', 'El resumen de tu año, para compartir.'],
] as const

const WEEKLY = [
  ['El desafío de la semana.', 'Un reto nuevo para clubes y jugadores.'],
  [
    'El Diario de la Zona.',
    'Los lunes, la edición de tu zona: resultados, la tabla, el clásico y la goleada.',
  ],
] as const

function Silhouette() {
  return (
    <div className={s.sil}>
      <svg viewBox="0 0 100 90" aria-hidden="true">
        <circle cx="50" cy="28" r="20" fill="currentColor" opacity=".35" />
        <path d="M8 90c4-24 20-36 42-36s38 12 42 36Z" fill="currentColor" opacity=".35" />
      </svg>
    </div>
  )
}

/** 6. Tercer tiempo: el mazo de costado (escena fijada con scroll horizontal) y después los rasgos. */
export function TercerTiempoSection() {
  return (
    <>
      <section
        className={`${s.tt} ${s.scene} ${s.pin}`}
        id="tercer-tiempo"
        data-scene="hpin"
        data-hook="tercer-tiempo"
        aria-labelledby="tt-h"
      >
        <div className={s.stage}>
          <div className={s.wrap}>
            <StatusChip piece="figure" />
            <h2 className={s.display} id="tt-h" style={{ marginTop: 10 }}>
              Que se <span className={s.acc}>sepa.</span>
            </h2>
            <p className={s.lede} style={{ marginTop: 10 }}>
              Después del partido viene lo mejor: el resultado, la figura y la tapa. Todo listo para
              pegar en el grupo y en tu historia.
            </p>
          </div>
          <div
            className={s.trackWrap}
            tabIndex={0}
            role="region"
            aria-label="Mazo de ejemplo: la tapa, cinco figuritas y una tarjeta"
          >
            <div className={s.track} data-track="">
              <article className={s.rivalTapa} aria-label="Tapa de ejemplo">
                <div className={s.mast}>
                  <span>EL DIARIO DE LA ZONA</span>
                  <span>EJEMPLO</span>
                </div>
                <h3>Se terminó el reinado</h3>
                <p>
                  Deportivo Rejunte le sacó la Corona a Los Mismos de Siempre en la noche del
                  jueves.
                </p>
                <span className={s.ej}>Ejemplo · la escribe la IA, sin nombrar a nadie</span>
              </article>
              {FIGURITAS.map((f) => (
                <div key={f.edition} className={`${s.rivalFigurita} ${f.cls}`}>
                  <span className={s.ed}>{f.edition}</span>
                  <span className={s.num}>{f.num}</span>
                  <Silhouette />
                  <div className={s.foot}>
                    <span>{f.club}</span>
                    <span>Ejemplo</span>
                  </div>
                </div>
              ))}
              <div className={s.story}>
                <span className={s.ej} style={{ alignSelf: 'flex-start' }}>
                  Ejemplo · tarjeta 9:16
                </span>
                <p className={s.big}>
                  ¡Subí a <span className={s.acc}>Quinta!</span>
                </p>
                <span className={s.share}>Que se sepa</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.after} ${s.wrap}`} aria-label="Lo que se gana y se comparte">
        <ul className={`${s.chalkList} ${s.twoCol}`} data-reveal="">
          {TRAITS.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b> {text}
            </li>
          ))}
        </ul>
        <h3 style={{ marginTop: 40 }} data-reveal="">
          Y toda la semana
        </h3>
        <ul className={`${s.chalkList} ${s.twoCol}`} style={{ marginTop: 16 }} data-reveal="">
          {WEEKLY.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b> {text}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
