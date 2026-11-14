'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { MapPin } from 'lucide-react'
import type { SearchZona } from '@/components/site/HeroSearch'
import type { AvailabilityResponse } from '@/modules/tenants/public.service'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { todayART } from '@/shared/time/art-date'
import { formatsLabel } from '@/lib/formats-label'
import { freeTimes, pickWindowComplexes } from './nearby'

/** Alcanza para juntar 4 con reserva online aunque algunos de la localidad no la tengan. */
const SEARCH_LIMIT = 8
const SLOTS_PER_CARD = 2

type Card = PublicTenantCard & {
  /** `undefined` mientras carga; `null` si no cargó (no es lo mismo que "no hay"). */
  times?: string[] | null
}

type WindowState = { key: string; total: number; cards: Card[] } | null

async function loadTimes(slug: string, date: string): Promise<string[] | null> {
  try {
    const res = await fetch(`/api/public/availability?${new URLSearchParams({ slug, date })}`)
    if (!res.ok) return null
    return freeTimes((await res.json()) as AvailabilityResponse, SLOTS_PER_CARD)
  } catch {
    return null
  }
}

/**
 * Cuántas tarjetas entran a este ancho, con los mismos cortes que `home.css`: 2 en el celu, 3 desde
 * 640 px y 4 desde 1024 px. Solo de esas se piden horarios: cada pedido a `/api/public/*` gasta del
 * mismo balde por IP (`publicAvailability`, 30 por minuto) que usa la ficha para mostrar las horas.
 */
function cardsThatFit(): number {
  if (window.matchMedia('(width >= 64rem)').matches) return 4
  if (window.matchMedia('(width >= 40rem)').matches) return 3
  return 2
}

/**
 * La ventana del hero de la home (`home.html`, `.win`): complejos reales de la localidad del
 * buscador con sus próximos horarios libres de hoy. Sin localidad, sin complejos con reserva
 * online o si la búsqueda falla, no aparece (decisión del dueño: no se inventan datos).
 *
 * Pide la búsqueda pública y la disponibilidad de cada tarjeta que se ve: 3 pedidos en el celu y 5
 * en la compu, más el de `/api/public/zona` si no hay zona guardada (`useIpZona`). Sin distancia:
 * la zona de la conexión es aproximada.
 */
export function ComplexWindow({ zona }: { zona: SearchZona | null }) {
  const key = zona ? `${zona.city}||${zona.province}` : ''
  const [state, setState] = useState<WindowState>(null)

  useEffect(() => {
    if (!zona) return
    let cancelled = false
    const k = `${zona.city}||${zona.province}`
    void (async () => {
      try {
        const params = new URLSearchParams({ city: zona.city, limit: String(SEARCH_LIMIT) })
        if (zona.province) params.set('province', zona.province)
        const res = await fetch(`/api/public/search?${params}`)
        if (!res.ok) throw new Error(String(res.status))
        const { results = [], total = 0 } = (await res.json()) as {
          results?: PublicTenantCard[]
          total?: number
        }
        const picked = pickWindowComplexes(results).slice(0, cardsThatFit())
        if (cancelled) return
        setState({ key: k, total, cards: picked })
        const date = todayART()
        const times = await Promise.all(picked.map((t) => loadTimes(t.slug, date)))
        if (cancelled) return
        setState({ key: k, total, cards: picked.map((t, i) => ({ ...t, times: times[i] })) })
      } catch {
        if (!cancelled) setState({ key: k, total: 0, cards: [] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [zona])

  // Lo de otra localidad no se muestra mientras llega lo nuevo.
  if (!zona || !state || state.key !== key || state.cards.length === 0) return null

  return (
    <section
      aria-label={`Complejos de ${zona.city} con sus horarios libres de hoy`}
      className="home-win home-rise glass"
      style={{ '--i': 3 } as CSSProperties}
    >
      <div className="home-win__bar">
        <span className="home-chip">
          <MapPin aria-hidden />
          {zona.city}
        </span>
        <span className="home-win__n">
          <b>{state.total === 1 ? '1 complejo' : `${state.total} complejos`}</b>
        </span>
      </div>
      <ul className="home-cards">
        {state.cards.map((t) => (
          <li key={t.id} className="home-card">
            <Link href={`/${t.slug}`} className="home-card__link">
              <div className="home-card__ph">
                {t.coverUrl ? (
                  <Image
                    src={t.coverUrl}
                    alt=""
                    fill
                    sizes="(width >= 1024px) 270px, (width >= 640px) 190px, 45vw"
                  />
                ) : null}
              </div>
              <div className="home-card__b">
                <span className="home-card__n">{t.name}</span>
                {formatsLabel(t.courtFormats) && (
                  <span className="home-card__m">{formatsLabel(t.courtFormats)}</span>
                )}
                <Times times={t.times} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Times({ times }: { times: string[] | null | undefined }) {
  if (times === undefined) return <div className="home-slots" aria-hidden />
  if (times === null) return null
  if (times.length === 0) return <span className="home-card__none">Sin horarios libres hoy.</span>
  return (
    <div className="home-slots">
      {times.map((time) => (
        <span key={time} className="home-slot">
          {time}
        </span>
      ))}
    </div>
  )
}
