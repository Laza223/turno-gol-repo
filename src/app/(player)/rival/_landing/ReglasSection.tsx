import Link from 'next/link'
import { cssVars } from './css-vars'
import s from './landing.module.css'

const FAQ = [
  [
    '¿Qué puedo usar hoy?',
    'El partido del grupo y el tablón. Lo que dice "Próximamente" está en camino.',
  ],
  [
    '¿Cuándo llega lo que dice "Próximamente"?',
    'Por partes y sin fecha. Cada parte sale cuando está lista, y acá pasa de "Próximamente" a "Ya disponible".',
  ],
  [
    '¿Quién va a ver mi categoría?',
    'La categoría llega muy pronto, y la vas a ver vos. Mostrarla, aparecer en una tabla o mostrar tu figurita lo vas a elegir vos, y lo vas a poder volver a ocultar.',
  ],
  [
    '¿Se va a ver cuando me va mal?',
    'No se le va a mostrar a otros jugadores. Cuando lleguen las tablas, lo bueno se ve y lo malo no: nadie ve a otro abajo de una tabla.',
  ],
  [
    '¿Qué partidos van a contar?',
    'Para la tabla y la categoría, que llegan muy pronto, solo lo verificado: partidos entre clubes, con turno en un complejo TurnoGol y el resultado confirmado.',
  ],
  [
    '¿Alguien puede escribir algo sobre mí?',
    'No. En RIVAL no hay comentarios ni notas de una persona a otra. Y la tapa, cuando llegue, va a hablar de clubes y resultados.',
  ],
  ['¿Cuánto sale?', 'Nada. RIVAL es gratis para el jugador.'],
  ['¿Hay plata en juego?', 'No. Ni apuestas ni plata entre jugadores.'],
  ['¿Desde qué edad?', 'Solo mayores de 18.'],
  [
    '¿Qué pasa con mis datos?',
    'Son tuyos: los podés ver, corregir, descargar o borrar (Ley 25.326).',
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
            Competir sin <span className={s.acc}>escrache.</span>
          </h2>
          <p className={s.lede} style={{ marginTop: 12 }}>
            Las reglas del vestuario valen para todo RIVAL: lo que ya se juega y lo que viene.
          </p>
          <p style={{ marginTop: 14 }}>
            <Link className={s.link} href="/terminos">
              Términos y privacidad
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
