import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { CityCount } from '@/modules/tenants/search.service'
import { HomeEntry } from './HomeEntry'
import { HomeSearch } from './HomeSearch'
// Fotos del hero (aprobadas por Lazar el 2026-11-14 hasta tener fotos propias). Las dos son de
// Wikimedia Commons con licencia CC0 (dominio público, sin obligación de crédito). El crédito
// queda acá y no se muestra en la web, por decisión del dueño:
// - hero-noche.webp: "Soccer at night (Unsplash)", Abigail Keenan (akeenster), CC0.
//   https://commons.wikimedia.org/wiki/File:Soccer_at_night_(Unsplash).jpg
// - hero-claro.webp: "Soccer goal construction with night sky clouds (Unsplash)", Mitchell
//   Lawler (dalawler), CC0.
//   https://commons.wikimedia.org/wiki/File:Soccer_goal_construction_with_night_sky_clouds_(Unsplash).jpg
import heroNoche from './fotos/hero-noche.webp'
import heroClaro from './fotos/hero-claro.webp'

/**
 * Hero de la home (portal de vidrio, F2; `home.html`). Un solo árbol para todos los anchos y un
 * solo `<h1>`. La foto apila cuatro capas (dirección §3.4): la foto, un desenfoque que se apaga
 * hacia abajo, el velo del color del tema y los resplandores. La de oscuro y la de claro van por
 * clase del tema. Las dos van con `preload` (un `<link>` en el `<head>`) y `fetchPriority="high"`:
 * la foto es el LCP de la home. Con `lazy` se descubría tarde y el LCP pasaba de 0,96 s (main antes
 * de F2) a 1,70 s; con `preload` quedó en 1,03 s (build local, CPU 4×, 4G, 2026-11-14). Se bajan
 * las dos aunque se vea una (31 KB + 39 KB): el tema se sabe recién en el cliente.
 *
 * El movimiento está en `home.css`.
 */
export function Hero({ cities }: { cities: CityCount[] }) {
  return (
    <div className="home-stage">
      <HomeEntry />
      <div className="home-bg" aria-hidden>
        <Image
          src={heroNoche}
          alt=""
          sizes="100vw"
          preload
          fetchPriority="high"
          placeholder="blur"
          className="home-bg__img hidden dark:block"
        />
        <Image
          src={heroClaro}
          alt=""
          sizes="100vw"
          preload
          fetchPriority="high"
          placeholder="blur"
          className="home-bg__img home-bg__img--claro dark:hidden"
        />
        <div className="home-bg__blur" />
        <div className="home-bg__veil" />
        <div className="home-bg__glow" />
      </div>

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
