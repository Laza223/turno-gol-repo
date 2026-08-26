'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Banknote } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { fetchWithTimeout } from '@/shared/utils/async'

/** Cada cuánto se vuelve a preguntar mientras la pestaña está a la vista. */
const REFRESH_MS = 60_000
/**
 * Piso entre dos pedidos. Una ráfaga de navegación (tres clicks seguidos en el
 * menú) no tiene por qué disparar tres consultas de plata.
 */
const MIN_GAP_MS = 5_000
/**
 * Corte por tiempo de cada pedido. Un `fetch` sin corte no falla: se queda
 * colgado, y del lado del componente eso no se distingue de "todavía no llegó".
 * Es la causa raíz que documenta `shared/utils/async.ts` y la razón por la que
 * el placeholder podía quedarse en pantalla para siempre.
 */
const FETCH_TIMEOUT_MS = 8_000
/**
 * Espera entre reintentos después de un pedido que falló por algo pasajero.
 * Cubre los primeros 32 segundos; pasado eso toma la posta el ciclo normal de
 * {@link REFRESH_MS}. Corto al principio porque el caso típico es el primer
 * pedido de la sesión —la pantalla arranca sin ningún número— y largo después
 * para no martillar un backend que ya está en problemas.
 */
const RETRY_BACKOFF_MS = [1_000, 3_000, 8_000, 20_000]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type FetchOutcome =
  | { kind: 'ok'; cents: number }
  /** Pasajero: vale la pena volver a preguntar enseguida. */
  | { kind: 'retry' }
  /** Insistir no lo arregla: esperar al ciclo normal. */
  | { kind: 'give-up' }

async function fetchDayTotal(): Promise<FetchOutcome> {
  try {
    const res = await fetchWithTimeout(
      '/api/admin/day-total',
      { cache: 'no-store' },
      FETCH_TIMEOUT_MS,
    )
    if (!res.ok) {
      // 401/403: la sesión venció, y volver a pedir no la renueva. 429: el
      // rate-limit del endpoint ya está lleno, así que insistir solo lo empeora
      // —y su ventana es de 60 s, o sea exactamente el ciclo normal—. Los 5xx y
      // el 408 sí son "probá de nuevo".
      return res.status >= 500 || res.status === 408 ? { kind: 'retry' } : { kind: 'give-up' }
    }
    const body = (await res.json()) as { data?: { collectedCents?: number } }
    const value = body.data?.collectedCents
    // Un cuerpo con otra forma es un bug del servidor, no un corte de red:
    // reintentar devolvería el mismo cuerpo.
    return typeof value === 'number' ? { kind: 'ok', cents: value } : { kind: 'give-up' }
  } catch {
    // Sin respuesta: offline, DNS, TLS, o el corte de {@link FETCH_TIMEOUT_MS}.
    // Es justo el caso que se arregla volviendo a preguntar.
    return { kind: 'retry' }
  }
}

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
 * Dos disparadores, los dos por el mismo camino con piso de {@link MIN_GAP_MS}:
 * cada {@link REFRESH_MS} mientras la pestaña está a la vista, y al volver a la
 * pestaña. Ese último importa de verdad: el encargado deja el panel abierto y
 * atiende el mostrador; al volver, lo primero que mira es este número.
 *
 * Hubo un tercero —cambiar de ruta— y se sacó: el badge vive en la barra
 * lateral, así que disparaba en CADA navegación del panel, y del otro lado ese
 * pedido no es barato (rehace la cadena de autenticación completa y consulta el
 * rate-limit reteniendo una de las 3 conexiones del pool). Ninguno de los dos
 * motivos que justifican el componente —plata que entra por fuera de esta
 * pestaña— tiene que ver con navegar: si el encargado se mueve por el panel, el
 * número que ya tiene sigue siendo el mismo. El piso de {@link MIN_GAP_MS} lo
 * atenuaba, no lo evitaba.
 *
 * **Un pedido que falla se reintenta solo** ({@link RETRY_BACKOFF_MS}). Sin eso,
 * el único reintento era el ciclo de {@link REFRESH_MS}: una sola respuesta
 * perdida al abrir el panel —el caso más común de todos, porque es cuando la
 * pantalla todavía no tiene ningún número— dejaba la barra en "cargando" un
 * minuto entero. Y si el pedido no fallaba sino que se colgaba, se quedaba ahí
 * para siempre; por eso además va con {@link FETCH_TIMEOUT_MS}.
 *
 * Límite conocido y aceptado: si el admin cobra desde `/caja` y se queda ahí, el
 * encabezado de esa pantalla se actualiza al instante (`router.refresh()`) y
 * este número puede tardar hasta {@link REFRESH_MS}. Los dos salen de la misma
 * cuenta (`cashflow/totals.ts`), así que difieren en el momento, nunca en el
 * criterio.
 */
export function DayTotalBadge() {
  const [cents, setCents] = useState<number | null>(null)
  const lastFetchRef = useRef(0)
  const aliveRef = useRef(true)
  // Los reintentos viven dentro de una sola corrida de `refresh`. Sin este
  // candado, el pedido de visibilidad podría arrancar una segunda cadena
  // mientras la primera está en su espera, y quedarían dos escaleras de
  // backoff pisándose.
  const runningRef = useRef(false)

  const refresh = useCallback(async () => {
    if (runningRef.current) return
    if (Date.now() - lastFetchRef.current < MIN_GAP_MS) return
    runningRef.current = true
    try {
      for (let attempt = 0; aliveRef.current; attempt++) {
        lastFetchRef.current = Date.now()
        const outcome = await fetchDayTotal()
        if (!aliveRef.current) return
        if (outcome.kind === 'ok') {
          setCents(outcome.cents)
          return
        }
        // Un total que no llega deja el anterior en pantalla y no pinta ningún
        // error: el número no es accionable al segundo y la barra de navegación
        // no es lugar para un cartel rojo. Lo que sí cambia es que ahora vuelve
        // a intentar solo, en vez de esperar el minuto completo.
        const wait = outcome.kind === 'retry' ? RETRY_BACKOFF_MS[attempt] : undefined
        if (wait === undefined) return
        await sleep(wait)
      }
    } finally {
      runningRef.current = false
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Montaje e intervalo, en un solo efecto. El primer pedido sale por un timer
  // y no desde el cuerpo del efecto: así el valor llega por una respuesta y
  // nunca por una cascada de render (`react-hooks/set-state-in-effect`, en
  // `error` en este repo). Mismo idioma que `PaymentStatusWatcher`.
  //
  // Sin `pathname` en las dependencias: la barra lateral no se desmonta al
  // navegar, así que el intervalo sobrevive de una vista a la otra y no hay que
  // rearmarlo. Ver el bloque de arriba sobre por qué el cambio de ruta dejó de
  // ser un disparador.
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
  }, [refresh])

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
