'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Props = { bookingId: string; tenantName: string }

/** Deja una reseña post-partido (solo para reservas 'completed'). */
export function LeaveReviewButton({ bookingId, tenantName }: Props) {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-500/10 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <Star className="h-4 w-4" aria-hidden />
          Dejar reseña
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Cómo estuvo {tenantName}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                className="rounded p-1 transition-transform hover:scale-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 motion-reduce:hover:scale-100"
              >
                <Star
                  className={cn(
                    'h-8 w-8',
                    n <= shown ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
                  )}
                  aria-hidden
                />
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label htmlFor="review-comment" className="text-sm font-medium text-foreground">
              Comentario (opcional)
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="¿Qué te pareció la cancha, el lugar, la atención?"
              className="w-full resize-none rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">{comment.length}/500</p>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100"
          >
            {pending ? 'Enviando…' : 'Publicar reseña'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
