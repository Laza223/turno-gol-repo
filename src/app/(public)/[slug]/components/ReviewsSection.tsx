'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BadgeCheck, Star } from 'lucide-react'
import RatingStars from '@/components/public/RatingStars'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import './ficha-rest.css'

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
    <section aria-label="Reseñas" className="fr-blk fr-reveal">
      <h2 className="fr-h2">Reseñas</h2>

      {/* La tarjeta resumen (`.rev` del mockup). El número grande es decorativo: las estrellas
          ya dicen el promedio y la cantidad. */}
      <div className="glass-painted flex flex-wrap items-center justify-between gap-3 rounded-3xl px-4.5 py-4 text-portal-ink">
        <span
          aria-hidden
          className="font-display text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums"
        >
          {average.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        </span>
        <div className="mr-auto grid gap-1">
          <RatingStars
            rating={average}
            count={total}
            variant="full"
            className="[&>span:last-child]:sr-only"
          />
          <span aria-hidden className="text-sm text-portal-soft">
            {total} {total === 1 ? 'reseña' : 'reseñas'}
          </span>
        </div>
        {/* Las reseñas son verificadas (atadas a un turno jugado), así que no hay un formulario
            acá: se dejan desde el historial del jugador. Esta página es estática/cacheada: no
            puede saber si quien mira jugó, por eso el enlace es fijo y `/mis-reservas` pide el
            ingreso si hace falta. */}
        <Link
          href="/mis-reservas?tab=historial"
          className={cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }))}
        >
          <Star aria-hidden />
          Dejar una reseña
        </Link>
      </div>

      <ul className="glass-painted divide-y divide-portal-inner-line overflow-hidden rounded-3xl text-portal-ink">
        {reviews.map((r) => (
          <li key={r.id} className="px-4.5 py-4">
            <div className="flex items-center justify-between gap-3">
              <RatingStars rating={r.rating} variant="full" />
              <span className="text-[13px] text-portal-soft tabular-nums">
                {dateFmt.format(new Date(r.createdAt))}
              </span>
            </div>
            {r.comment && <p className="mt-2 text-base leading-6">{r.comment}</p>}
            <p className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-portal-slot-ink">
              <BadgeCheck className="size-4" aria-hidden />
              Reseña verificada
            </p>
          </li>
        ))}
      </ul>

      {hasMore && (
        <Button
          type="button"
          variant="pill-link"
          size="pill-sm"
          onClick={loadMore}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          {loading ? 'Cargando…' : 'Ver más reseñas'}
        </Button>
      )}

      <p className="px-1 text-[13px] leading-5 text-portal-soft">
        Solo pueden opinar quienes reservaron y jugaron acá. Después de tu partido vas a poder
        calificar desde Mis reservas.
      </p>
    </section>
  )
}
