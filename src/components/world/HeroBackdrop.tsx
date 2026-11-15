import Image from 'next/image'
import { cn } from '@/lib/utils'
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
import './hero-backdrop.css'

/**
 * La foto de fondo del portal de vidrio, con sus cuatro capas (dirección §3.4): la foto, un
 * desenfoque que se apaga hacia abajo, el velo del color del tema y los resplandores. En oscuro va
 * la de noche y en claro la de día, por clase del tema: el tema se sabe recién en el cliente, así
 * que se bajan las dos (31 KB + 39 KB).
 *
 * `priority`: en la home la foto es el LCP y va con `preload` + `fetchPriority="high"` (sin eso el
 * LCP pasaba de 0,96 s a 1,70 s, build local, CPU 4×, 4G, 2026-11-14). Cada pantalla ubica la foto
 * con su clase (`home.css`, `portal-app.css`) y le pone su entrada. Necesita `data-portal-glass`
 * arriba: sin el marcador no hay velo ni resplandor.
 */
export function HeroBackdrop({
  priority = false,
  className,
}: {
  priority?: boolean
  className?: string
}) {
  const load = priority ? ({ preload: true, fetchPriority: 'high' } as const) : {}
  return (
    <div className={cn('hero-bg', className)} aria-hidden>
      <Image
        src={heroNoche}
        alt=""
        sizes="100vw"
        placeholder="blur"
        {...load}
        className="hero-bg__img hidden dark:block"
      />
      <Image
        src={heroClaro}
        alt=""
        sizes="100vw"
        placeholder="blur"
        {...load}
        className="hero-bg__img hero-bg__img--claro dark:hidden"
      />
      <div className="hero-bg__blur" />
      <div className="hero-bg__veil" />
      <div className="hero-bg__glow" />
    </div>
  )
}
