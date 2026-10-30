import { CategoryQuiz } from './CategoryQuiz'
import { cssVars } from './css-vars'
import s from './landing.module.css'
import { CATEGORY_LADDER, STARTING_CEILING } from './quiz-table'
import { StatusChip } from './StatusChip'

const TOP = CATEGORY_LADDER[CATEGORY_LADDER.length - 1]
// La escalera en microrrótulos (celular): de arriba hacia abajo.
const INDEX_LABELS = [...CATEGORY_LADDER].reverse()

/** 2. ¿De qué categoría sos?: la escalera se sube con el scroll, y después las reglas y el quiz. */
export function CategoriaSection() {
  return (
    <>
      <section
        className={`${s.cat} ${s.scene} ${s.pin}`}
        id="categoria"
        data-scene="pin"
        data-hook="categoria"
        style={cssVars({ '--len': '320svh' })}
        aria-labelledby="cat-h"
      >
        <div className={`${s.stage} ${s.wrap}`}>
          <div className={s.head}>
            <StatusChip piece="category" />
            <h2 className={s.display} id="cat-h">
              ¿De qué <span className={s.acc}>categoría</span> sos?
            </h2>
            <p className={s.lede}>Todos dicen que son de Primera. La cancha lo dice.</p>
          </div>
          <ol className={s.catIndex} data-cat-index="" aria-hidden="true">
            {INDEX_LABELS.map((name) => (
              <li key={name}>{name === TOP ? 'Selección de la zona' : name}</li>
            ))}
          </ol>
          <div className={s.ticker}>
            <div className={s.mask}>
              <ol
                className={s.ladderNames}
                data-ladder=""
                aria-label="La escala, de abajo hacia arriba"
              >
                {CATEGORY_LADDER.map((name) => (
                  <li
                    key={name}
                    className={
                      name === STARTING_CEILING ? s.techo : name === TOP ? s.sel : undefined
                    }
                  >
                    {name}
                  </li>
                ))}
              </ol>
            </div>
            <p className={s.tickerTag} data-ticker-tag="" aria-hidden="true" />
            <div className={s.rail} aria-hidden="true">
              <span className={s.base} />
              <span className={s.fill} />
              <div className={s.notches}>
                {CATEGORY_LADDER.map((name) => (
                  <span key={name}>
                    <b>{name}</b>
                  </span>
                ))}
              </div>
              <div className={s.ends}>
                <span>Tu arco</span>
                <span>Arco rival</span>
              </div>
              <div className={s.mover}>
                <span className={s.ball} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.after} ${s.wrap}`} aria-label="Cómo funciona la categoría">
        <div className={s.rulesQuiz}>
          <div className={s.rules}>
            <ul className={s.chalkList} data-reveal="">
              <li>
                <b>Declarás y la cancha confirma.</b> Arrancás con tres preguntas y un &quot;?&quot;
                al lado. A los 10 partidos oficiales con tu club, se va el &quot;?&quot;.
              </li>
              <li>
                <b>Subís en el momento. Bajás despacio.</b> Solo al cierre de la temporada, y como
                mucho una categoría. Una mala noche no te manda abajo.
              </li>
              <li>
                <b>Es tuya.</b> La ves vos. Pública, solo si querés.
              </li>
            </ul>
            <p data-reveal="" style={{ color: 'var(--ink-2)' }}>
              Arriba de Primera está la <b style={{ color: 'var(--ink)' }}>Selección de la zona</b>:
              los mejores de cada temporada, entre los que eligieron mostrarse.
            </p>
            <p className={s.bridge} data-reveal="">
              Sin club no hay categoría oficial.
            </p>
          </div>
          <CategoryQuiz />
        </div>
      </section>
    </>
  )
}
