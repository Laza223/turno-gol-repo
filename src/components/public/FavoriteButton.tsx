'use client'

import { useState, type MouseEvent } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { usePortalSession } from '@/components/site/PortalSessionProvider'

type Props = {
  tenantId: string
  initialFavorited?: boolean
  /** 'overlay' = botón circular sobre la imagen; 'inline' = botón con etiqueta. */
  variant?: 'overlay' | 'inline'
  className?: string
}

/**
 * Botón de favorito (❤️). Optimista: togglea al instante y revierte si falla.
 * Si el jugador no está logueado (401), lo manda a /ingresar y vuelve.
 * Pensado para vivir dentro de un <Link> de card: corta la propagación del click.
 */
export default function FavoriteButton({
  tenantId,
  initialFavorited = false,
  variant = 'overlay',
  className,
}: Props) {
  const { toast } = useToast()
  const { favoriteTenantIds } = usePortalSession()
  // Prioridad: interacción del usuario > prop del server (rutas dynamic como
  // /explorar) > hidratación client-side de la sesión (rutas ISR como /[slug],
  // donde el server render no puede leer cookies y arranca no-favorito).
  const [override, setOverride] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const fav = override ?? (initialFavorited || favoriteTenantIds.has(tenantId))

  async function toggle(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    setPending(true)
    const prev = fav
    const next = !fav
    setOverride(next)
    try {
      const res = await fetch('/api/player/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      if (res.status === 401) {
        const back = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/ingresar?next=${back}`
        return
      }
      if (!res.ok) throw new Error('toggle failed')
      const json = (await res.json()) as { data?: { favorited?: boolean } }
      setOverride(json.data?.favorited ?? next)
    } catch {
      setOverride(prev)
      toast({ title: 'No pudimos actualizar tus favoritos.', variant: 'destructive' })
    } finally {
      setPending(false)
    }
  }

  const label = fav ? 'Quitar de favoritos' : 'Guardar en favoritos'

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={fav}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors disabled:opacity-60',
          fav
            ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          className,
        )}
      >
        <Heart className={cn('h-4 w-4', fav && 'fill-current')} aria-hidden />
        {fav ? 'Guardado' : 'Guardar'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={fav}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-red-600 active:scale-90 disabled:opacity-60 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        fav && 'text-red-600',
        className,
      )}
    >
      <Heart className={cn('h-[18px] w-[18px] transition-transform', fav && 'fill-current')} aria-hidden />
    </button>
  )
}
