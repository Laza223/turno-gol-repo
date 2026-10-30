import s from './landing.module.css'

/** "RIVAL" en tiza (solo contorno) arriba del pie; el trazo se dibuja con el scroll. */
export function Wordmark() {
  return (
    <div className={`${s.wordmark} ${s.scene}`} data-scene="view" aria-hidden="true">
      <svg viewBox="0 0 1000 220">
        <text x="500" y="196" textAnchor="middle">
          RIVAL
        </text>
      </svg>
    </div>
  )
}
