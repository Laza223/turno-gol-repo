import Image from 'next/image'
import type { CSSProperties } from 'react'
import { addDays } from '@/shared/dates/art'

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const

/** Día de la semana y número de una fecha de calendario (UTC de punta a punta: es una fecha). */
function dayParts(date: string): { weekday: number; day: number } {
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  return { weekday: utc.getUTCDay(), day: utc.getUTCDate() }
}

// Todo lo de este dibujo es un EJEMPLO (complejos, estados, cancha y precio) y lo dice la etiqueta:
// es cómo se ve la ficha, nunca datos de un complejo real (decisión del dueño, 2026-11-14).
const COMPLEJOS = [
  { name: 'La Canchita', free: 5, photo: '/bg-hero-2.webp' },
  { name: 'Basílica F5', free: 2, photo: '/bg-owner.webp' },
  { name: 'Las Rosas Fútbol', free: 3, photo: '/hero-bg.webp' },
  { name: 'Potrero Norte', free: 4, photo: '/bg-how-it-works.webp' },
] as const

/** Estado de cada uno de los siete días de la fila: 2 lleno, 4 cerrado. */
const DAY_STATE: Record<number, 'Lleno' | 'Cerrado'> = { 2: 'Lleno', 4: 'Cerrado' }

const HORAS = [
  { time: '18:00', label: 'Lleno' },
  { time: '19:00', label: '2 libres' },
  { time: '20:00', label: '1 libre', picked: true },
  { time: '21:00', label: 'Lleno' },
  { time: '22:00', label: '2 libres' },
  { time: '23:00', label: '3 libres' },
  { time: '00:00', label: '1 libre' },
  { time: '01:00', label: 'Lleno' },
] as const

/**
 * "Reservás en una pantalla" (`home.html`, `#reservar`): la ficha nueva dibujada. Los días salen
 * de la fecha de hoy, así "Hoy" siempre es hoy. Es un dibujo: el lector de pantalla oye solo su
 * descripción.
 */
export function ReservaDibujo({ today }: { today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const hoy = dayParts(today)

  return (
    <section className="home-sec home-sec--glow" id="reservar" aria-labelledby="reservar-title">
      <div className="home-wrap">
        <div className="home-sec__head home-reveal">
          <h2 id="reservar-title" className="home-h2">
            Reservás en una pantalla. <span>Elegís el día, tocás una hora y confirmás.</span>
          </h2>
        </div>
        <div className="home-reveal">
          <p className="home-example-row" aria-hidden>
            <span className="home-tag home-tag--neutral">Ejemplo</span>
          </p>
          <div
            className="home-app glass-painted"
            role="img"
            aria-label="Ejemplo de la página de un complejo: los días en una fila, los horarios de hoy y el botón Reservar con la cancha y el precio"
          >
            <div className="home-app__bar" aria-hidden>
              <span>← Explorar</span>
              <b>La Canchita</b>
              <span>Abierto</span>
            </div>
            <div className="home-app__grid" aria-hidden>
              <div className="home-app__list">
                {COMPLEJOS.map((c, i) => (
                  <div key={c.name} className="home-row" data-on={i === 0 ? '' : undefined}>
                    <Image src={c.photo} alt="" width={56} height={56} sizes="56px" />
                    <div>
                      <b>{c.name}</b>
                      <span>{c.free} horarios libres hoy</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="home-app__main">
                <p className="home-app__q">Reservá tu turno</p>
                <div className="home-daystrip">
                  {days.map((d, i) => {
                    const { weekday, day } = dayParts(d)
                    const state = DAY_STATE[i]
                    return (
                      <div
                        key={d}
                        className="home-dayp"
                        data-picked={i === 0 ? '' : undefined}
                        data-off={state ? '' : undefined}
                      >
                        <small>{i === 0 ? 'Hoy' : DAY_SHORT[weekday]}</small>
                        <b>{day}</b>
                        {state ? <em>{state}</em> : <i />}
                      </div>
                    )
                  })}
                </div>
                <div className="home-hgrid">
                  {HORAS.map((h, i) => (
                    <div
                      key={h.time}
                      className="home-hourb"
                      style={{ '--h': i } as CSSProperties}
                      data-picked={'picked' in h ? '' : undefined}
                      data-off={h.label === 'Lleno' ? '' : undefined}
                    >
                      <b>{h.time}</b>
                      <span>{h.label}</span>
                    </div>
                  ))}
                </div>
                <div className="home-app__go">
                  <div>
                    <span>
                      Hoy, {DAY_LONG[hoy.weekday]} {hoy.day} · 20:00 a 21:00
                    </span>
                    <b>Cancha 2 · Fútbol 5</b>
                  </div>
                  <span className="home-btn">Reservar · $36.000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
