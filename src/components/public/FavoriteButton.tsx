'use client'

import { useState, type MouseEvent } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { usePortalSession } from '@/components/site/PortalSessionProvider'
import { rejectionMessage } from '@/shared/lib/rejection-message'

const FAVORITE_TOGGLE_ERROR = 'No pudimos actualizar tus favoritos.'

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
      if (!res.ok) {
        setOverride(prev)
        toast({ title: await rejectionMessage(res, FAVORITE_TOGGLE_ERROR), variant: 'destructive' })
        return
      }
      const json = (await res.json()) as { data?: { favorited?: boolean } }
      setOverride(json.data?.favorited ?? next)
    } catch {
      setOverride(prev)
      toast({ title: FAVORITE_TOGGLE_ERROR, variant: 'destructive' })
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
          'group inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all duration-200 shadow-xs backdrop-blur-md active:scale-95 disabled:opacity-60 disabled:pointer-events-none hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500',
          fav
            ? // text-red-600 (#dc2626) sobre bg-red-500/10 compuesto con
              // --background (#DDE3EC) da ~#E3D7DD de fondo real → 3.45:1, bajo
              // AA. red-700 (#b91c1c) es el mismo idiom que status-badge/toast
              // (texto rojo oscuro sobre fondo rojo tenue) y sí pasa.
              'border-red-500/20 bg-red-500/10 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-500/20 dark:hover:bg-red-500/20'
            : 'border-border/50 bg-card/60 text-foreground/90 hover:bg-card hover:border-red-500/30 dark:hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400',
          className,
        )}
      >
        <Heart
          className={cn(
            'h-4 w-4 transition-all duration-200 group-hover:scale-110',
            fav ? 'fill-current text-red-700 dark:text-red-400' : 'text-current',
          )}
          aria-hidden
        />
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
        'group inline-flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-full bg-card/85 text-foreground/70 border border-border/40 shadow-xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-card hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 active:scale-90 disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500',
        fav && 'text-red-700 border-red-500/30 bg-red-500/10 dark:text-red-400 dark:bg-red-500/25',
        className,
      )}
    >
      <Heart
        className={cn(
          'h-[18px] w-[18px] transition-all duration-200 group-hover:scale-110',
          fav && 'fill-current',
        )}
        aria-hidden
      />
    </button>
  )
}
