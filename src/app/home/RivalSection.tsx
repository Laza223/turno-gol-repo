import Link from 'next/link'
import type { CSSProperties } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Partidos de EJEMPLO, y lo dice la etiqueta: cómo se ve el tablón, nunca partidos publicados de
// verdad (decisión del dueño, 2026-11-14).
const PARTIDOS = [
  {
    tag: 'Falta 1',
    what: 'Fútbol 5 · hoy 21:00',
    where: 'La Canchita · ya son 9 de 10',
    fill: 0.9,
  },
  {
    tag: 'Faltan 3',
    what: 'Fútbol 7 · sábado 19:00',
    where: 'Las Rosas Fútbol · ya son 11 de 14',
    fill: 0.78,
  },
  {
    tag: 'Busca rival',
    rival: true,
    what: 'Fútbol 5 · domingo 20:00',
    where: 'Basílica F5 · equipo de 5 completo',
    fill: 0.5,
  },
  {
    tag: 'Faltan 2',
    what: 'Fútbol 6 · viernes 22:00',
    where: 'Las Rosas Fútbol · ya son 10 de 12',
    fill: 0.83,
  },
] as const

/**
 * Rival en la home (`home.html`, `#rival`). Solo con el flag `rival` prendido: lo decide la página.
 * El tablón es un dibujo con partidos de ejemplo; el lector de pantalla oye solo su descripción.
 */
export function RivalSection() {
  return (
    <section
      className="home-sec home-sec--glow home-sec--glow-l"
      id="rival"
      aria-labelledby="rival-title"
    >
      <div className="home-wrap home-split">
        <div className="home-reveal">
          <h2 id="rival-title" className="home-h2">
            Rival, el tablón de partidos de tu zona
          </h2>
          <p className="home-lead2">
            Si te faltan jugadores, publicás cuántos. Si tenés equipo, buscás rival. Los que juegan
            cerca piden sumarse y, cuando los aceptás, arreglan por WhatsApp.
          </p>
          <Link
            href="/rival"
            className={cn(buttonVariants({ variant: 'pill-glass', size: 'pill' }), 'mt-6')}
          >
            Ver el tablón
          </Link>
        </div>
        <div className="home-reveal">
          <p className="home-example-row" aria-hidden>
            <span className="home-tag home-tag--neutral">Ejemplo</span>
          </p>
          <div
            className="home-board"
            role="img"
            aria-label="Ejemplo del tablón de Rival, con sus dos botones para armar un partido y los partidos publicados"
          >
            <div className="home-board__head" aria-hidden>
              <span>Me faltan jugadores</span>
              <span>Busco rival</span>
            </div>
            {PARTIDOS.map((p) => (
              <div key={p.what} className="home-match glass-painted" aria-hidden>
                <div className="home-match__k">
                  <span className={'rival' in p ? 'home-tag home-tag--neutral' : 'home-tag'}>
                    {p.tag}
                  </span>
                  <span className="home-match__t">{p.what}</span>
                </div>
                <span className="home-match__m">{p.where}</span>
                <span className="home-match__bar">
                  <i style={{ '--fill': p.fill } as CSSProperties} />
                </span>
                <span className="home-match__cta">Pedir sumarme</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
