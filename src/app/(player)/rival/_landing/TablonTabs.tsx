'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cssVars } from './css-vars'
import s from './landing.module.css'

const TABS = [
  {
    label: 'Faltan 3',
    meta: 'Jueves 22:00 · Fútbol 7 · Tranqui',
    text: 'Al partido le faltan jugadores. Te sumás con un pedido, y el organizador te acepta.',
  },
  {
    label: 'Se busca arquero',
    meta: 'Martes 20:00 · Fútbol 5 · Parejo',
    text: 'El puesto que nadie quiere y todos necesitan. Si atajás, acá te buscan.',
  },
  {
    label: 'Busca rival',
    meta: 'Sábado 18:00 · Fútbol 5 · Picante',
    text: 'Un equipo completo busca a otro equipo para jugar.',
  },
] as const

const FADE_MS = 160

/** El tablón: pestañas de texto que cambian la tarjeta de ejemplo (fundido de 200 ms). */
export function TablonTabs() {
  const [selected, setSelected] = useState(0)
  // La tarjeta cambia de contenido recién a mitad del fundido.
  const [shown, setShown] = useState(0)
  const [faded, setFaded] = useState(false)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function select(i: number) {
    setSelected(i)
    clearTimeout(timer.current)
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setFaded(true)
    timer.current = setTimeout(
      () => {
        setShown(i)
        setFaded(false)
      },
      calm ? 0 : FADE_MS,
    )
  }

  function onKeyDown(e: KeyboardEvent, i: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    tabRefs.current[next]?.focus()
    select(next)
  }

  const card = TABS[shown]

  return (
    <div className={s.tablon}>
      <div className={`${s.plate} ${s.rivalPizarra}`} data-reveal="">
        <span className={s.ring} aria-hidden="true" />
        <div className={s.tcard} style={{ opacity: faded ? 0 : 1 }} aria-live="polite">
          <p className={s.t}>{card.label}</p>
          <p className={s.m}>
            {card.meta}
            <br />
            Complejo de ejemplo
          </p>
          <span className={s.ej}>Ejemplo</span>
        </div>
      </div>
      <div data-reveal="" style={cssVars({ '--rd': '90ms' })}>
        <h3 className={s.display} id="tablon-h" style={{ fontSize: 'clamp(36px,4vw,56px)' }}>
          El tablón
        </h3>
        <div
          className={s.tabs}
          role="tablist"
          aria-label="Qué se publica en el tablón"
          style={{ marginTop: 12 }}
        >
          {TABS.map((tab, i) => (
            <button
              key={tab.label}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`tab-${i}`}
              aria-selected={selected === i}
              aria-controls="tab-panel"
              tabIndex={selected === i ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${selected}`}>
          <p className={s.tabText}>{card.text}</p>
        </div>
        <p style={{ color: 'var(--ink-2)', marginTop: 10 }}>
          Y si querés, te avisamos por mail cuando busquen gente en tu complejo.
        </p>
        <div className={s.actionsCol}>
          <Link className={s.ghost} href="/rival/tablon">
            Mirá el tablón
          </Link>
        </div>
      </div>
    </div>
  )
}
