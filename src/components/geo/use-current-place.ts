'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoReverse, GeoReverseResponse } from '@/modules/geo/geo.types'

export type CurrentPlacePrecision = 'address' | 'locality'

export type CurrentPlaceState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'found'; place: GeoReverse }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'timeout' }
  | { status: 'outside_argentina' }
  | { status: 'error' }

type FailureStatus = 'denied' | 'unsupported' | 'timeout' | 'outside_argentina' | 'error'

/** Qué decirle a la persona en cada caso que no salió. */
export const CURRENT_PLACE_MESSAGES: Record<FailureStatus, string> = {
  denied:
    'Tenés bloqueado el permiso de ubicación. Activalo desde el candado de la barra del navegador, o buscá tu localidad.',
  unsupported: 'Tu navegador no permite compartir la ubicación. Buscá tu localidad.',
  timeout: 'No pudimos ubicarte a tiempo. Probá de nuevo o buscá tu localidad.',
  outside_argentina: 'Parece que estás fuera de Argentina. Buscá tu localidad.',
  error: 'No pudimos saber dónde estás ahora. Probá de nuevo o buscá tu localidad.',
}

// `locality` es para jugadores: su posición se redondea (~100 m) antes de salir del dispositivo.
const OPTIONS: Record<CurrentPlacePrecision, PositionOptions & { decimals: number }> = {
  address: { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0, decimals: 6 },
  locality: { enableHighAccuracy: false, timeout: 8_000, maximumAge: 600_000, decimals: 3 },
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function isReverseResponse(body: unknown): body is GeoReverseResponse {
  return typeof body === 'object' && body !== null && 'result' in body
}

/**
 * "Usar mi ubicación actual". Pide la posición SOLO cuando se llama `locate()`
 * (un toque del usuario, nunca al montar). `locate(onFound)` además avisa el
 * lugar encontrado, para que el caller lo use sin un efecto de por medio.
 */
export function useCurrentPlace(precision: CurrentPlacePrecision): {
  state: CurrentPlaceState
  locate: (onFound?: (place: GeoReverse) => void) => void
  reset: () => void
} {
  const [state, setState] = useState<CurrentPlaceState>({ status: 'idle' })
  // Cada intento tiene un número: si cambia (reset, otro locate, desmontaje), el viejo se ignora.
  const attempt = useRef(0)
  const controller = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    attempt.current += 1
    controller.current?.abort()
    controller.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const reset = useCallback(() => {
    cancel()
    setState({ status: 'idle' })
  }, [cancel])

  const locate = useCallback(
    (onFound?: (place: GeoReverse) => void) => {
      cancel()
      const mine = attempt.current
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setState({ status: 'unsupported' })
        return
      }
      setState({ status: 'locating' })
      const { decimals, ...positionOptions } = OPTIONS[precision]

      const fail = (status: FailureStatus) => {
        if (attempt.current === mine) setState({ status })
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (attempt.current !== mine) return
          const ctrl = new AbortController()
          controller.current = ctrl
          const lat = round(pos.coords.latitude, decimals)
          const lng = round(pos.coords.longitude, decimals)
          void (async () => {
            try {
              const res = await fetch(
                `/api/public/geo/reverse?lat=${lat}&lng=${lng}&precision=${precision}`,
                { signal: ctrl.signal },
              )
              if (!res.ok) return fail('error')
              const body: unknown = await res.json()
              if (!isReverseResponse(body)) return fail('error')
              if (body.result) {
                if (attempt.current !== mine) return
                setState({ status: 'found', place: body.result })
                onFound?.(body.result)
                return
              }
              // Sin resultado y con servicios caídos no es "fuera de Argentina".
              fail(body.degraded ? 'error' : 'outside_argentina')
            } catch {
              if (!ctrl.signal.aborted) fail('error')
            }
          })()
        },
        (err) => fail(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'error'),
        positionOptions,
      )
    },
    [cancel, precision],
  )

  return { state, locate, reset }
}
