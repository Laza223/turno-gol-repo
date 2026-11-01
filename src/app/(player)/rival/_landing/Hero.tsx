import Image from 'next/image'
import Link from 'next/link'
import { ArmarCta, type LandingEntry } from './ArmarCta'
import { cssVars } from './css-vars'
import s from './landing.module.css'
import { VoyDemo } from './VoyDemo'

/** 0. Hero: "Cada partido cuenta." con la demo de Voy. Sin chip: es la tesis. */
export function Hero({ entry }: { entry: LandingEntry }) {
  return (
    <section className={`${s.hero} ${s.scene}`} data-scene="exit">
      <div className={s.glow} aria-hidden="true" />
      <div className={s.heroCopy}>
        <Image
          className={s.heroLogo}
          src="/brand-assets/rival/rival-logo.svg"
          alt="RIVAL powered by TurnoGol"
          width={1880}
          height={375}
          unoptimized
          priority
        />
        <p className={s.micro}>
          La plataforma de los futboleros: armá tus partidos, encontrá rivales y sumate a los de
          otros.
        </p>
        <h1 className={`${s.display} ${s.heroH1}`}>
          <span className={s.ln}>Cada partido</span>{' '}
          <span className={`${s.ln} ${s.acc}`} style={cssVars({ '--li': 1 })}>
            cuenta.
          </span>
        </h1>
        <p className={s.lede}>
          Armá el partido, pasá el link por WhatsApp y que cada uno toque Voy: ves quiénes van y
          cuántos faltan. ¿Falta gente? Publicalo en el tablón y quien busca partido puede pedir
          sumarse. Próximamente: tu club, la tabla y tu categoría.
        </p>
      </div>
      <VoyDemo />
      <div className={s.heroActions}>
        <ArmarCta entry={entry} className={s.btn}>
          Armá tu partido
        </ArmarCta>
        <Link className={s.ghost} href="/rival/tablon">
          Buscá un partido
        </Link>
      </div>
      <p className={s.note}>
        RIVAL es gratis para el jugador. Entrás con Google o con tu email. Solo mayores de 18.
      </p>
    </section>
  )
}
