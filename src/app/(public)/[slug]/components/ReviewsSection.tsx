'use client'

import { useState } from 'react'
import { BadgeCheck, MessageSquare } from 'lucide-react'
import RatingStars from '@/components/public/RatingStars'

type ReviewItem = {
  id: string
  rating: number
  comment: string | null
  createdAt: string | Date
}

type Props = {
  tenantId: string
  initial: ReviewItem[]
  total: number
  average: number
}

const PAGE = 10
const dateFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Reseñas del complejo. Por privacidad (Ley 25.326) no se expone identidad del
 * jugador: las reseñas son verificadas (atadas a un turno completado) pero anónimas.
 */
export default function ReviewsSection({ tenantId, initial, total, average }: Props) {
  const [reviews, setReviews] = useState<ReviewItem[]>(initial)
  const [loading, setLoading] = useState(false)
  const hasMore = reviews.length < total

  async function loadMore() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/public/reviews/${tenantId}?limit=${PAGE}&offset=${reviews.length}`,
      )
      if (!res.ok) throw new Error('fetch failed')
      const json = (await res.json()) as { reviews: ReviewItem[] }
      setReviews((prev) => [...prev, ...json.reviews])
    } catch {
      // Silencioso: el botón sigue disponible para reintentar.
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      aria-label="Reseñas"
      className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Reseñas</h2>
        {total > 0 && (
          <div className="flex items-center gap-2 text-foreground">
            <RatingStars rating={average} count={total} variant="full" />
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <MessageSquare className="h-9 w-9" aria-hidden />
          <p className="text-sm">Todavía no hay reseñas de este complejo.</p>
        </div>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-border">
            {reviews.map((r) => (
              <li key={r.id} className="py-4 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <RatingStars rating={r.rating} variant="full" className="text-foreground" />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {dateFmt.format(new Date(r.createdAt))}
                  </span>
                </div>
                {r.comment && <p className="mt-2 text-sm leading-relaxed text-foreground">{r.comment}</p>}
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  Reseña verificada
                </p>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="inline-flex h-11 items-center rounded-full border border-border bg-card px-6 text-sm font-medium text-foreground shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/60 hover:text-emerald-700 hover:shadow-md disabled:opacity-60 motion-reduce:hover:translate-y-0 dark:hover:text-emerald-400"
              >
                {loading ? 'Cargando…' : 'Ver más reseñas'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
