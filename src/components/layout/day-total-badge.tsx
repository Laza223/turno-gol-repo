'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Banknote } from 'lucide-react'
import { formatArs } from '@/lib/format'

/** Cada cuánto se vuelve a preguntar mientras la pestaña está a la vista. */
const REFRESH_MS = 60_000
/**
 * Piso entre dos pedidos. Una ráfaga de navegación (tres clicks seguidos en el
 * menú) no tiene por qué disparar tres consultas de plata.
 */
const MIN_GAP_MS = 5_000

/**
 * B14 — "Hoy: $X" en la barra lateral (visión v2 §3.3 / P2): el número del día
 * visible desde cualquier espacio, sin volver a la pantalla "Hoy".
 *
 * Se pide al servidor en vez de bajar como prop del layout, y se refresca solo.
 * El motivo no es Next: es que **la plata entra desde afuera de esta pestaña**
 * —una seña que confirma el webhook de MercadoPago, otro empleado cobrando en
 * su teléfono— así que un número atado al render de la pantalla envejece sin
 * avisar. Y un total de plata viejo no se lee como "viejo", se lee como plata
 * que falta.
 *
 * Tres disparadores, todos por el mismo camino con piso de {@link MIN_GAP_MS}:
 * al montar y al cambiar de ruta, cada {@link REFRESH_MS}, y al volver a la
 * pestaña. Ese último importa de verdad: el encargado deja el panel abierto y
 * atiende el mostrador; al volver, lo primero que mira es este número.
 *
 * Límite conocido y aceptado: si el admin cobra desde `/caja` y se queda ahí, el
 * encabezado de esa pantalla se actualiza al instante (`router.refresh()`) y
 * este número puede tardar hasta {@link REFRESH_MS}. Los dos salen de la misma
 * cuenta (`cashflow/totals.ts`), así que difieren en el momento, nunca en el
 * criterio.
 */
export function DayTotalBadge() {
  const pathname = usePathname()
  const [cents, setCents] = useState<number | null>(null)
  const lastFetchRef = useRef(0)
  const aliveRef = useRef(true)

  const refresh = useCallback(async () => {
    const now = Date.now()
    if (now - lastFetchRef.current < MIN_GAP_MS) return
    lastFetchRef.current = now
    try {
      const res = await fetch('/api/admin/day-total', { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as { data?: { collectedCents?: number } }
      const value = body.data?.collectedCents
      if (typeof value === 'number' && aliveRef.current) setCents(value)
    } catch {
      // Un total que no llega deja el anterior en pantalla. Pintar un error acá
      // sería ruido en la barra de navegación: el número no es accionable al
      // segundo, y el pedido siguiente ya lo corrige.
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Montaje, cambio de ruta e intervalo, en un solo efecto. El primer pedido
  // sale por un timer y no desde el cuerpo del efecto: así el valor llega por
  // una respuesta y nunca por una cascada de render
  // (`react-hooks/set-state-in-effect`, en `error` en este repo). Mismo idioma
  // que `PaymentStatusWatcher`.
  useEffect(() => {
    let cancelled = false
    const run = () => {
      if (cancelled) return
      void refresh()
    }
    const kickoff = setTimeout(run, 0)
    const interval = setInterval(run, REFRESH_MS)
    return () => {
      cancelled = true
      clearTimeout(kickoff)
      clearInterval(interval)
    }
  }, [pathname, refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  return (
    <Link
      href="/caja"
      // El total es un atajo a Caja, que es donde se explica: el pedido de fondo
      // es no tener que volver a otra pantalla para saber cómo viene el día.
      aria-label={
        cents === null ? 'Cobrado hoy, cargando' : `Cobrado hoy: ${formatArs(cents)}. Ir a Caja`
      }
      className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-muted/40 p-2.5 transition-colors hover:bg-accent dark:bg-zinc-950/20"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Banknote className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
          Hoy
        </p>
        {cents === null ? (
          // Placeholder del mismo alto que el número, para que la barra no salte
          // cuando llega el dato.
          <span
            className="mt-1 block h-[1.125rem] w-20 animate-pulse rounded bg-muted"
            aria-hidden="true"
          />
        ) : (
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground truncate leading-tight tracking-tight">
            {formatArs(cents)}
          </p>
        )}
      </div>
    </Link>
  )
}
