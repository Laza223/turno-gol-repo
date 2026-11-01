import type { ReactNode } from 'react'
import Link from 'next/link'
import { cssVars } from './css-vars'
import s from './landing.module.css'

const FAQ: readonly (readonly [string, ReactNode])[] = [
  [
    '¿Qué puedo usar hoy?',
    'Hoy podés armar un partido, pasar el link al grupo para que cada uno confirme, publicarlo en el tablón si les falta gente o rival, y pedir sumarte a los partidos de otros. Lo que dice "Próximamente" está en camino.',
  ],
  [
    '¿Hace falta tener equipo?',
    'No. Armás el partido con tu grupo o te sumás a uno del tablón. El club es lo que viene.',
  ],
  [
    '¿Armar el partido reserva la cancha?',
    'No: la cancha tiene que estar ya conseguida. Si la reservaste en TurnoGol, el partido lleva el sello «Reservada en TurnoGol»; si la tenés por otro lado, lo marcás al armarlo.',
  ],
  [
    '¿Cuándo llega lo que dice "Próximamente"?',
    'Por etapas y todavía sin fecha. Cada una pasa de "Próximamente" a "Ya disponible" cuando está lista.',
  ],
  [
    '¿Quién va a ver mi categoría?',
    'La categoría está en camino, y la vas a ver vos. Mostrarla, aparecer en una tabla o mostrar tu figurita lo vas a elegir vos, y lo vas a poder volver a ocultar.',
  ],
  [
    '¿Se va a ver cuando me va mal?',
    'Tu rendimiento no se le muestra a otros jugadores. Las tablas de jugadores muestran solo a los de arriba, y tu posición la ves vos.',
  ],
  [
    '¿Qué partidos van a contar?',
    'Para la tabla y la categoría, que están en camino, solo lo verificado: partidos entre clubes, con turno en un complejo TurnoGol y el resultado confirmado.',
  ],
  [
    '¿Alguien puede escribir algo sobre mí?',
    'No. En RIVAL no hay comentarios ni notas de una persona a otra. Y los textos que escribe la IA (la tapa, la historia del club, el Diario de la Zona) hablan de clubes y resultados, no de jugadores.',
  ],
  [
    '¿Cuánto sale?',
    'Usar RIVAL es gratis para el jugador. La reserva de la cancha es aparte y la maneja cada complejo.',
  ],
  [
    '¿Hay plata en juego?',
    'No. En RIVAL no hay apuestas ni partidos por plata, y TurnoGol no cobra ni procesa pagos entre jugadores.',
  ],
  ['¿Desde qué edad?', 'Solo mayores de 18.'],
  [
    '¿Qué pasa con mis datos?',
    <>
      Son tuyos. Desde{' '}
      <Link className={s.link} href="/configuracion#mis-datos">
        Mi cuenta
      </Link>{' '}
      podés ver y descargar lo que guardamos y corregir tus datos de perfil, y podés{' '}
      <Link className={s.link} href="/eliminar-cuenta">
        borrar tu cuenta
      </Link>{' '}
      (Ley 25.326).
    </>,
  ],
] as const

/** 9. Las reglas del vestuario: preguntas y respuestas honestas. Sin chip: valen para todo RIVAL. */
export function ReglasSection() {
  return (
    <section
      className={`${s.reglas} ${s.after}`}
      id="reglas"
      aria-labelledby="reglas-h"
      style={{ paddingTop: 72 }}
    >
      <div className={s.wrap}>
        <div className={s.side} data-reveal="">
          <h2 className={s.display} id="reglas-h">
            Antes de salir a la <span className={s.acc}>cancha.</span>
          </h2>
          <p className={s.lede} style={{ marginTop: 12 }}>
            Cómo funciona RIVAL y qué pasa con tus datos, para lo que ya se juega y para lo que
            viene.
          </p>
          <p style={{ marginTop: 14 }}>
            <Link className={s.link} href="/terminos">
              Términos
            </Link>{' '}
            y{' '}
            <Link className={s.link} href="/privacidad">
              privacidad
            </Link>
          </p>
        </div>
        <div className={s.faq} data-reveal="" style={cssVars({ '--rd': '90ms' })}>
          {FAQ.map(([question, answer], i) => (
            <details key={question} name="rival-reglas" open={i === 0}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
