'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type {
  AvailabilityResponse,
  WeeklyAvailabilityResponse,
} from '@/modules/tenants/public.service'

/** Cada cuánto se vuelve a pedir el día mientras alguien está señando una cancha. */
const HELD_REFRESH_MS = 30_000

/** Cuánto vale un día (o una semana) ya pedido: pasado ese tiempo se vuelve a pedir al volver a él. */
const TTL_MS = 120_000

/**
 * Por qué no se pudo cargar un día: la red (sin respuesta), el servidor (5xx), el límite de pedidos
 * (429, pedir de nuevo en unos segundos), el complejo (404: ya no está disponible) o el día mismo
 * (400 `date_out_of_range`: el complejo bajó cuántos días deja reservar y esta página es vieja).
 */
export type DayFailure = 'network' | 'server' | 'rate' | 'gone' | 'range'

class HttpError extends Error {
  status: number
  code: string | null
  constructor(status: number, code: string | null) {
    super(`HTTP ${status}`)
    this.status = status
    this.code = code
  }
}

// Se clasifica por STATUS (y el `code` de texto del 400): los 404/400 de estas rutas responden
// `{ error: 'not_found' }`, no el envelope `{ error: { message } }` que lee `rejectionMessage`.
function failureOf(err: unknown): DayFailure {
  if (!(err instanceof HttpError)) return 'network'
  if (err.status === 400 && err.code === 'date_out_of_range') return 'range'
  return err.status === 429 ? 'rate' : err.status === 404 ? 'gone' : 'server'
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null
    throw new HttpError(res.status, typeof body?.error === 'string' ? body.error : null)
  }
  return (await res.json()) as T
}

const dayUrl = (slug: string, date: string) =>
  `/api/public/availability?slug=${encodeURIComponent(slug)}&date=${date}`

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/** ¿La pestaña se está viendo? En el servidor y al hidratar, sí. */
function useTabVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === 'visible',
    () => true,
  )
}

type DayEntry = { data: AvailabilityResponse; at: number }

/**
 * Disponibilidad de UN día, guardada en memoria por fecha: volver a un día ya visto (o cambiar de
 * formato, que filtra del lado del cliente) no pide nada mientras el dato tenga menos de 120 s.
 * Vencido, se vuelve a pedir al volver a ese día o al volver a la pestaña, mostrando lo anterior
 * mientras llega lo nuevo. `date = null` no pide nada (día cerrado o página sin hidratar). Cambiar
 * de día aborta el pedido en curso.
 *
 * Con alguna cancha `held` (alguien pagando la seña) y la pestaña a la vista, el día se refresca
 * cada 30 s para que el "Señando" se libere solo; sin eso no hay ningún intervalo.
 */
export function useDayAvailability(slug: string, date: string | null) {
  const [days, setDays] = useState<Record<string, DayEntry>>({})
  const [failure, setFailure] = useState<{ date: string; cause: DayFailure } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [seenDate, setSeenDate] = useState(date)
  const visible = useTabVisible()

  // Cambiar de día borra el error del anterior: al volver a un día que había fallado, el pedido
  // arranca limpio y no parpadea el error mientras carga.
  if (seenDate !== date) {
    setSeenDate(date)
    setFailure(null)
  }

  const entry = date === null ? undefined : days[date]
  const data = entry?.data
  const fetchedAt = entry?.at
  const hasHeld = data?.courts.some((c) => c.slots.some((s) => s.status === 'held')) ?? false
  // Mostrar u ocultar la pestaña solo reinicia el pedido cuando ya hay datos que pudieron vencer.
  // Sin datos el pedido en vuelo no se toca: reiniciarlo en cada vuelta lo abortaba y lo repetía.
  const refreshOnShow = fetchedAt === undefined ? null : visible

  useEffect(() => {
    if (date === null) return
    // Con la pestaña oculta no se pide lo vencido: se pide al volver (`refreshOnShow` cambia).
    if (fetchedAt !== undefined && (!refreshOnShow || Date.now() - fetchedAt < TTL_MS)) return
    const controller = new AbortController()
    getJson<AvailabilityResponse>(dayUrl(slug, date), controller.signal)
      .then((res) => setDays((prev) => ({ ...prev, [date]: { data: res, at: Date.now() } })))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setFailure({ date, cause: failureOf(err) })
      })
    return () => controller.abort()
    // `attempt` re-corre el pedido tras "Reintentar" o al elegir una hora (solo pide si venció).
  }, [slug, date, fetchedAt, refreshOnShow, attempt])

  useEffect(() => {
    if (date === null || !hasHeld || !visible) return
    let controller: AbortController | undefined
    const id = setInterval(() => {
      controller?.abort()
      controller = new AbortController()
      getJson<AvailabilityResponse>(dayUrl(slug, date), controller.signal)
        .then((res) => setDays((prev) => ({ ...prev, [date]: { data: res, at: Date.now() } })))
        .catch(() => {}) // el refresco es de cortesía: si falla, queda lo que ya se ve
    }, HELD_REFRESH_MS)
    return () => {
      clearInterval(id)
      controller?.abort()
    }
  }, [slug, date, hasHeld, visible])

  return {
    data,
    /** Solo mientras no hay nada que mostrar: si el día ya se vio, un refresco fallido no lo tapa. */
    failure: failure?.date === date && !data ? failure.cause : null,
    /** Vuelve a pedir el día si venció (los 120 s); con datos frescos no hace nada. */
    revalidate: () => setAttempt((n) => n + 1),
    retry: () => {
      setFailure(null)
      setAttempt((n) => n + 1)
    },
  }
}

/**
 * La semana que sigue a `start`, para ofrecer "el próximo día con lugar". Una sola consulta,
 * diferida: `start = null` no pide nada (solo hace falta cuando el día elegido no tiene lugar).
 * Vale 120 s como los días. `week`: `undefined` = cargando · `'error'` = no se pudo (`retry` lo
 * vuelve a pedir).
 */
export function useWeekFrom(slug: string, start: string | null) {
  const [weeks, setWeeks] = useState<
    Record<string, { data: WeeklyAvailabilityResponse; at: number } | 'error'>
  >({})
  const entry = start === null ? undefined : weeks[start]
  const failed = entry === 'error'
  const at = entry && entry !== 'error' ? entry.at : undefined

  useEffect(() => {
    if (start === null || failed) return
    if (at !== undefined && Date.now() - at < TTL_MS) return
    const controller = new AbortController()
    getJson<WeeklyAvailabilityResponse>(
      `/api/public/availability/week?slug=${encodeURIComponent(slug)}&start=${start}`,
      controller.signal,
    )
      .then((res) => setWeeks((prev) => ({ ...prev, [start]: { data: res, at: Date.now() } })))
      .catch(() => {
        if (!controller.signal.aborted) setWeeks((prev) => ({ ...prev, [start]: 'error' }))
      })
    return () => controller.abort()
  }, [slug, start, at, failed])

  return {
    week: entry === 'error' ? entry : entry?.data,
    retry: () => {
      if (start !== null) setWeeks(({ [start]: _failed, ...rest }) => rest)
    },
  }
}
