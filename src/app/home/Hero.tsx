import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { CityCount } from '@/modules/tenants/search.service'
import { HomeEntry } from './HomeEntry'
import { HomeSearch } from './HomeSearch'
import { HeroBackdrop } from '@/components/world/HeroBackdrop'

/**
 * Hero de la home (portal de vidrio, F2; `home.html`). Un solo árbol para todos los anchos y un
 * solo `<h1>`. La foto apila cuatro capas (dirección §3.4): la foto, un desenfoque que se apaga
 * hacia abajo, el velo del color del tema y los resplandores (`HeroBackdrop`, compartida con la
 * pantalla de ingresar). Acá va con `priority`: la foto es el LCP de la home.
 *
 * El movimiento está en `home.css`.
 */
export function Hero({ cities }: { cities: CityCount[] }) {
  return (
    <div className="home-stage">
      <HomeEntry />
      <HeroBackdrop priority />

      <section className="home-hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="home-title">
          <span className="home-title__line" style={{ '--l': 0 } as CSSProperties}>
            <span>Tu cancha,</span>
          </span>{' '}
          <span className="home-title__line" style={{ '--l': 1 } as CSSProperties}>
            <em>a un toque.</em>
          </span>
        </h1>
        <p className="home-lead home-rise" style={{ '--i': 1 } as CSSProperties}>
          Elegí localidad y cancha. Ves los horarios libres y reservás desde el celu, sin llamar a
          nadie.
        </p>

        <HomeSearch cities={cities} />

        {/* La entrada del complejo en el celu (#520): hasta `md` la cabecera es solo el logo. */}
        <p className="home-owner home-rise md:hidden" style={{ '--i': 4 } as CSSProperties}>
          ¿Tenés un complejo? <Link href="/para-complejos">Sumalo a TurnoGol</Link>
        </p>
      </section>
    </div>
  )
}
