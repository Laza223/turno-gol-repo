import Image from 'next/image'
import s from './landing.module.css'

/** El logo de RIVAL arriba del pie; aparece con el scroll. */
export function Wordmark() {
  return (
    <div className={`${s.wordmark} ${s.scene}`} data-scene="view">
      <Image
        src="/brand-assets/rival/rival-logo.svg"
        alt="RIVAL powered by TurnoGol"
        width={1880}
        height={375}
        unoptimized
      />
    </div>
  )
}
