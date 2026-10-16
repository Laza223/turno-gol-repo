'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BadgeCheck, Star } from 'lucide-react'
import RatingStars from '@/components/public/RatingStars'
import { Button } from '@/components/ui/button'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'

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
 * La página no la monta sin reseñas: sin datos el bloque no deja hueco.
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
    <section aria-label="Reseñas" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={PORTAL_SECTION_TITLE}>Reseñas</h2>
        <RatingStars rating={average} count={total} variant="full" className="text-foreground" />
      </div>

      <ul className="divide-y divide-border">
        {reviews.map((r) => (
          <li key={r.id} className="py-4 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <RatingStars rating={r.rating} variant="full" className="text-foreground" />
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {dateFmt.format(new Date(r.createdAt))}
              </span>
            </div>
            {r.comment && <p className="mt-2 text-base leading-6 text-foreground">{r.comment}</p>}
            <p className="mt-2 inline-flex items-center gap-1 text-[13px] text-emerald-700 dark:text-emerald-400">
              <BadgeCheck className="size-4" aria-hidden />
              Reseña verificada
            </p>
          </li>
        ))}
      </ul>

      {hasMore && (
        <Button
          type="button"
          variant="outline"
          onClick={loadMore}
          disabled={loading}
          className="w-full shadow-none sm:w-auto md:h-11"
        >
          {loading ? 'Cargando…' : 'Ver más reseñas'}
        </Button>
      )}

      {/* Las reseñas son verificadas (atadas a un turno jugado), así que no hay un
          formulario acá: se dejan desde el historial del jugador. Sin esta línea la
          sección no decía cómo reseñar y parecía que no se podía. Esta página es
          estática/cacheada: no puede saber si quien mira jugó, por eso el enlace es
          fijo y `/mis-reservas` pide el ingreso si hace falta. */}
      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-5 text-muted-foreground">
          Solo reseñan quienes ya jugaron acá. Un rato después de tu turno aparece «Dejar reseña» en
          tu historial de reservas.
        </p>
        <Link
          href="/mis-reservas?tab=historial"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-md px-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-emerald-400 sm:self-auto"
        >
          <Star className="size-4" aria-hidden />
          Dejar una reseña
        </Link>
      </div>
    </section>
  )
}
