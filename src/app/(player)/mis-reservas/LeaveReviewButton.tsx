'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { GlassSheetContent } from '@/components/ui/glass-sheet'
import { Sheet, SheetTrigger } from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import '@/components/world/portal-app.css'

type Props = {
  bookingId: string
  tenantName: string
  /** Ids del contexto de la tarjeta (cuándo y dónde): el botón sigue llamándose "Dejar reseña" a secas. */
  describedBy?: string
}

/** Deja una reseña post-partido (solo para reservas 'completed'). */
export function LeaveReviewButton({ bookingId, tenantName, describedBy }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [pending, setPending] = useState(false)

  async function submit() {
    if (rating < 1) {
      toast({ title: 'Elegí una calificación.', variant: 'destructive' })
      return
    }
    setPending(true)
    try {
      const res = await fetch('/api/player/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, comment: comment.trim() || undefined }),
      })
      if (res.status === 409) {
        toast({ title: 'Ya dejaste una reseña para esta reserva.' })
        setOpen(false)
        router.refresh()
        return
      }
      if (!res.ok) throw new Error('failed')
      toast({ title: '¡Gracias por tu reseña!', variant: 'success' })
      setOpen(false)
      router.refresh()
    } catch {
      toast({ title: 'No pudimos guardar tu reseña.', variant: 'destructive' })
    } finally {
      setPending(false)
    }
  }

  const shown = hover || rating

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-describedby={describedBy}
          data-ghost
          className={cn(
            buttonVariants({ variant: 'pill-link', size: 'pill-sm' }),
            'min-h-11 px-3.5 text-sm',
          )}
        >
          <Star aria-hidden />
          Dejar reseña
        </button>
      </SheetTrigger>
      <GlassSheetContent title={`¿Cómo estuvo ${tenantName}?`}>
        <div className="grid gap-4 text-portal-ink">
          <div
            className="flex justify-center gap-1"
            role="radiogroup"
            aria-label="Calificación"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} estrella${n === 1 ? '' : 's'}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                className="flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-portal-green"
              >
                <Star
                  className={cn(
                    'h-8 w-8',
                    n <= shown ? 'fill-portal-green text-portal-green' : 'text-portal-soft',
                  )}
                  aria-hidden
                />
              </button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="review-comment" className="text-sm font-semibold">
              Comentario (opcional)
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="¿Qué te pareció la cancha, el lugar, la atención?"
              className="w-full resize-none rounded-[18px] border border-portal-soft/70 bg-portal-inner px-4 py-3 text-base text-portal-ink placeholder:text-portal-soft focus-visible:border-portal-green focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-portal-green"
            />
            <p className="text-right text-sm text-portal-soft tabular-nums">{comment.length}/500</p>
          </div>

          <Button
            type="button"
            variant="pill"
            size="pill"
            onClick={submit}
            disabled={pending}
            className="w-full disabled:opacity-100"
          >
            {pending ? 'Enviando…' : 'Publicar reseña'}
          </Button>
        </div>
      </GlassSheetContent>
    </Sheet>
  )
}
