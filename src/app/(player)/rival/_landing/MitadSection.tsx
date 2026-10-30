import s from './landing.module.css'

/** Mitad de cancha: la frontera entre lo que ya se juega y lo que viene (de paso, atada al scroll). */
export function MitadSection() {
  return (
    <section
      className={`${s.mitad} ${s.scene}`}
      data-scene="view"
      aria-label="Lo que ya se juega y lo que viene"
    >
      <div className={`${s.wrap} ${s.row}`}>
        <p className={s.a}>Hasta acá, lo que ya se juega.</p>
        <div className={s.lineWrap} aria-hidden="true">
          <span className={s.hline} />
          <svg className={s.chalkSvg} viewBox="0 0 200 200">
            <circle className={s.draw} pathLength={1} cx="100" cy="100" r="96" />
            <circle className={s.dot} cx="100" cy="100" r="4" />
          </svg>
        </div>
        <p className={s.b}>
          De acá para allá, lo que viene. Todo lo que sigue dice &quot;Próximamente&quot; hasta que
          esté en la cancha.
        </p>
      </div>
    </section>
  )
}
