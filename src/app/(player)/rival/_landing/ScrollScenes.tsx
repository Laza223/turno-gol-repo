'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { gsap as GsapInstance } from 'gsap'
import type { ScrollTrigger as ScrollTriggerPlugin } from 'gsap/ScrollTrigger'

/**
 * El motor de escenas de la landing de RIVAL. GSAP con ScrollTrigger mide, en cada escena, cuánto se
 * recorrió de 0 a 1 (con un `scrub` corto que lo suaviza) y lo escribe como `--p` en la sección; el
 * CSS hace la coreografía con `calc()` sobre `--p` (solo transform y opacidad, más el trazo de tiza).
 * Acá solo va lo que el CSS no puede: textos que cambian, los momentos de cada escena (data-*) y el
 * mazo horizontal. No secuestra el scroll: la página se mueve sola, sin smooth scroll.
 *
 * GSAP entró por la medición del 2026-10-30 (docs/rival/landing.md, "Con GSAP"): en un celular medio
 * fue más fluido que el motor propio. Se importa dinámico, así no pesa en el primer pintado.
 *
 * Sin JavaScript o con `prefers-reduced-motion`, el motor no arranca, ninguna escena se fija y todo
 * queda en su estado final (el CSS de movimiento cuelga de `data-motion` en la raíz).
 *
 * Los ganchos al DOM son atributos `data-*`: las clases de un CSS Module se hashean.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
/** Segundos que `--p` tarda en alcanzar al scroll: el suavizado del motor. */
const SCRUB = 0.3

/** Dónde empieza y termina cada tipo de escena, en el idioma de ScrollTrigger. */
const RANGE: Record<SceneMode, { start: string; end: string }> = {
  pin: { start: 'top top', end: 'bottom bottom' },
  hpin: { start: 'top top', end: 'bottom bottom' },
  exit: { start: 'top top', end: 'bottom top' },
  view: { start: 'top bottom', end: 'bottom top' },
}

const TICKER_TAGS: Record<number, string> = {
  4: 'Techo del arranque: nadie empieza más arriba.',
  8: 'Selección de la zona: los mejores de cada temporada.',
}

type SceneMode = 'pin' | 'hpin' | 'exit' | 'view'

interface Scene {
  el: HTMLElement
  mode: SceneMode
  hook: string
  /** Solo 'hpin': cuánto se corre el mazo y dónde está el centro de cada pieza. */
  over: number
  centers: number[]
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

type Gsap = typeof GsapInstance
type ScrollTriggerType = typeof ScrollTriggerPlugin

function isSceneMode(v: string | undefined): v is SceneMode {
  return v === 'pin' || v === 'hpin' || v === 'exit' || v === 'view'
}

function setFlag(el: Element, name: string, on: boolean) {
  if (on) el.setAttribute(name, '')
  else el.removeAttribute(name)
}

function pulse(el: HTMLElement) {
  el.removeAttribute('data-pulse')
  void el.offsetWidth // reflow: reinicia la animación
  el.setAttribute('data-pulse', '')
}

/** Arranca el motor sobre `root`. Devuelve la función que lo desarma. */
function startScenes(root: HTMLElement, gsap: Gsap, ScrollTrigger: ScrollTriggerType): () => void {
  root.setAttribute('data-motion', '')
  let disposed = false

  /* ── Entradas (Reveal): una vez, al entrar en pantalla ── */
  const revealIo = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting || e.boundingClientRect.top < 0) {
          e.target.setAttribute('data-in', '')
          revealIo.unobserve(e.target)
        }
      }),
    { threshold: 0.15 },
  )
  root.querySelectorAll('[data-reveal]').forEach((el) => revealIo.observe(el))

  /* ── Ganchos por escena ── */
  const hoy = root.querySelector<HTMLElement>('[data-hook="hoy"]')
  const hoyPlayers = hoy ? [...hoy.querySelectorAll<HTMLElement>('[data-hoy-player]')] : []
  const hoySteps = hoy ? [...hoy.querySelectorAll<HTMLElement>('[data-hoy-step]')] : []
  const hoyTicks = hoy ? [...hoy.querySelectorAll<HTMLElement>('[data-hoy-tick]')] : []
  const hoyCount = hoy?.querySelector<HTMLElement>('[data-hoy-count]') ?? null
  const hoyCountText = hoyCount?.querySelector<HTMLElement>('[data-count-text]') ?? null
  let hoyText = ''

  const ladder = root.querySelector<HTMLElement>('[data-ladder]')
  const tickerTag = root.querySelector<HTMLElement>('[data-ticker-tag]')
  const catIndex = [...root.querySelectorAll<HTMLElement>('[data-cat-index] li')]
  let ladderIdx = -1

  const track = root.querySelector<HTMLElement>('[data-track]')
  const trackItems = track
    ? [...track.children].filter((c): c is HTMLElement => c instanceof HTMLElement)
    : []

  const hooks: Record<string, (p: number, el: HTMLElement, scene: Scene) => void> = {
    hoy(p, el) {
      const k = Math.min(3, Math.floor(p * 4))
      const t = [0, 1, 2, 3].map((i) => clamp(p * 4 - i, 0, 1))
      el.style.setProperty('--t0', t[0].toFixed(3))
      hoySteps.forEach((step, i) => setFlag(step, 'data-active', i === k))
      hoyTicks.forEach((tk, i) => tk.style.setProperty('--tk', t[i].toFixed(3)))
      let n = t[0] > 0.85 ? 1 : 0
      if (k >= 2) n = k === 2 ? 1 + Math.floor(t[2] * 8.999) : 9
      hoyPlayers.forEach((pl, i) => setFlag(pl, 'data-on', i < n))
      setFlag(el, 'data-card-on', (k === 0 && t[0] > 0.45) || k === 1)
      setFlag(el, 'data-link-on', k === 1 && t[1] > 0.15)
      setFlag(el, 'data-posted', k === 3 && t[3] > 0.12)
      const joined = k === 3 && t[3] > 0.6
      const text = joined ? '¡Estamos los 10!' : n === 9 ? 'Falta 1' : `Faltan ${10 - n}`
      if (hoyText !== text) {
        hoyText = text
        if (hoyCountText) hoyCountText.textContent = text
        if (joined && hoyCount) pulse(hoyCount)
      }
      setFlag(el, 'data-joined', joined)
    },
    categoria(p) {
      const idx = Math.min(8, Math.floor(p * 9))
      if (ladderIdx === idx || !ladder) return
      ladderIdx = idx
      ladder.style.setProperty('--idx', String(idx))
      if (tickerTag) tickerTag.textContent = TICKER_TAGS[idx] ?? ''
      catIndex.forEach((li, i) => setFlag(li, 'data-on', 8 - i === idx))
    },
    'grupo-club'(p, el) {
      setFlag(el, 'data-club', p > 0.5)
    },
    oficial(p, el) {
      setFlag(el, 'data-scored', p > 0.2)
      setFlag(el, 'data-champ', p > 0.82)
    },
    'tercer-tiempo'(p, _el, scene) {
      if (!track) return
      track.style.transform = `translate3d(${(-p * scene.over).toFixed(1)}px,0,0)`
      const vw = window.innerWidth
      trackItems.forEach((it, i) => {
        const c = (scene.centers[i] - p * scene.over - vw / 2) / vw
        it.style.setProperty('--c', c.toFixed(3))
        it.style.setProperty('--ac', Math.abs(c).toFixed(3))
      })
    },
    'tu-cancha'(p, el) {
      setFlag(el, 'data-stamped', p > 0.78)
    },
    'temporada-cero'(p, el) {
      setFlag(el, 'data-stamped', p > 0.72)
    },
  }

  const scenes: Scene[] = []
  root.querySelectorAll<HTMLElement>('[data-scene]').forEach((el) => {
    const mode = el.dataset.scene
    if (!isSceneMode(mode)) return
    scenes.push({
      el,
      mode,
      hook: el.dataset.hook ?? '',
      over: 0,
      centers: [],
    })
  })

  function layout() {
    if (!track) return
    scenes
      .filter((s) => s.mode === 'hpin')
      .forEach((s) => {
        track.style.transform = 'none'
        s.over = Math.max(0, track.scrollWidth - window.innerWidth)
        s.centers = trackItems.map((it) => it.offsetLeft + it.offsetWidth / 2)
        s.el.style.height = `${s.over + window.innerHeight * 1.25}px`
      })
  }

  // Una escena = un tween de 0 a 1 atado al scroll. ScrollTrigger solo trabaja con las que están
  // cerca de la pantalla y agrupa las lecturas del layout antes de escribir.
  const ctx = gsap.context(() => {
    scenes.forEach((s) => {
      const progress = { p: 0 }
      gsap.to(progress, {
        p: 1,
        ease: 'none',
        scrollTrigger: { trigger: s.el, ...RANGE[s.mode], scrub: SCRUB },
        onUpdate: () => {
          const p = clamp(progress.p, 0, 1)
          s.el.style.setProperty('--p', p.toFixed(4))
          hooks[s.hook]?.(p, s.el, s)
        },
      })
    })
  }, root)

  // El mazo horizontal cambia el alto de su escena: se recalcula antes de cada refresh de
  // ScrollTrigger (resize incluido), y una vez más cuando cargan las fuentes.
  ScrollTrigger.addEventListener('refreshInit', layout)
  layout()
  ScrollTrigger.refresh()
  void document.fonts.ready.then(() => {
    if (!disposed) ScrollTrigger.refresh()
  })

  return () => {
    disposed = true
    ScrollTrigger.removeEventListener('refreshInit', layout)
    ctx.revert()
    revealIo.disconnect()
    root.removeAttribute('data-motion')
    // Deja cada escena en su estado final, como si el motor nunca hubiera corrido.
    scenes.forEach((s) => {
      s.el.style.removeProperty('--p')
      if (s.mode === 'hpin') s.el.style.removeProperty('height')
    })
    track?.style.removeProperty('transform')
    if (hoyCountText) hoyCountText.textContent = '¡Estamos los 10!'
  }
}

interface ScrollScenesProps {
  className: string
  children: ReactNode
}

/** Raíz de la landing: monta el motor una sola vez, salvo con movimiento reducido. */
export function ScrollScenes({ className, children }: ScrollScenesProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const mq = window.matchMedia(REDUCED_MOTION)
    let stop: (() => void) | undefined
    let cancelled = false
    let engine: { gsap: Gsap; ScrollTrigger: ScrollTriggerType } | null = null

    const sync = () => {
      stop?.()
      stop =
        !mq.matches && engine ? startScenes(root, engine.gsap, engine.ScrollTrigger) : undefined
    }
    // Con movimiento reducido GSAP ni se descarga; si después lo apagan, se carga ahí. Si la descarga
    // falla, la página queda como con movimiento reducido: estática y completa.
    const load = async () => {
      if (engine) return
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ])
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)
      engine = { gsap, ScrollTrigger }
      sync()
    }
    const onChange = () => {
      if (!mq.matches && !engine) void load().catch(() => {})
      else sync()
    }
    if (!mq.matches) void load().catch(() => {})
    mq.addEventListener('change', onChange)
    return () => {
      cancelled = true
      mq.removeEventListener('change', onChange)
      stop?.()
    }
  }, [])

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  )
}
