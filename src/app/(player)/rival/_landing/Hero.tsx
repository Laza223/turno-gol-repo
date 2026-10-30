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
        <p className={s.micro}>RIVAL powered by TurnoGol</p>
        <h1 className={`${s.display} ${s.heroH1}`}>
          <span className={s.ln}>Cada partido</span>{' '}
          <span className={`${s.ln} ${s.acc}`} style={cssVars({ '--li': 1 })}>
            cuenta.
          </span>
        </h1>
        <p className={s.lede}>
          Armá el partido, cada uno toca Voy y, si falta 1, sale al tablón. Muy pronto, con tu club:
          la tabla, la Corona y tu categoría.
        </p>
      </div>
      <VoyDemo />
      <div className={s.heroActions}>
        <ArmarCta entry={entry} className={s.btn}>
          Armá tu partido
        </ArmarCta>
        <Link className={s.ghost} href="/rival/tablon">
          Mirá el tablón
        </Link>
      </div>
      <p className={s.note}>Con tu cuenta de TurnoGol. Solo mayores de 18.</p>
    </section>
  )
}
