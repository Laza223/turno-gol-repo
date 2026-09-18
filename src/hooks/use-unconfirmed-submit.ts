'use client'

import { startTransition, useState } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * La clientIdempotencyKey de un envío cuya respuesta puede no llegar.
 *
 * Si la red corta una request que SÍ entró, hay dos formas de registrar dos
 * veces o de perder lo nuevo, y las dos pasaron en `/caja`:
 * - armar key nueva para el reintento (al reabrir el diálogo): el servidor lo
 *   inserta de nuevo;
 * - dejar mandar OTRA cosa con la key vieja (otro ticket, otro monto): el
 *   servidor lo toma por reintento del primero, contesta éxito y lo nuevo no
 *   se registra.
 *
 * El servidor no puede distinguir un reintento de un envío idéntico con otra
 * intención, así que se resuelve acá: después de un corte, lo único que se
 * puede mandar es ESE mismo intento (`retryPayload`), con la misma key. La key
 * rota recién cuando el servidor contesta, sea éxito o error: ese intento ya
 * quedó resuelto.
 *
 * Mismo criterio que el panel de cobro de la grilla (R3 de
 * docs/audit/2026-09-16-revision-tanda-319-324.md), con una diferencia a
 * propósito: el panel abandona el intento al cambiar de turno, y acá el intento
 * traba el diálogo aunque se reabra para OTRA fila o producto. Si se abandonara,
 * volver después a la primera fila armaría key nueva y el reintento se
 * registraría dos veces. Destrabarlo es un toque: el reintento entra, o el
 * servidor contesta y la key rota.
 *
 * El estado vive en el componente que llama al hook: si se desmonta, se pierde.
 */
export type UnconfirmedSubmit<P> = {
  /** El intento que salió sin respuesta. Mientras no sea null, no se manda otra cosa. */
  retryPayload: P | null
  /**
   * Manda `payload` con la key vigente. Devuelve la respuesta del servidor, o
   * `null` si la request no volvió: no se sabe si entró, y queda como
   * `retryPayload`.
   */
  send: <R>(
    payload: P,
    request: (payload: P, clientIdempotencyKey: string) => Promise<R>,
  ) => Promise<R | null>
}

export function useUnconfirmedSubmit<P>(): UnconfirmedSubmit<P> {
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [unconfirmed, setUnconfirmed] = useState<{ key: string; payload: P } | null>(null)

  const retryPayload = unconfirmed?.key === key ? unconfirmed.payload : null

  async function send<R>(
    payload: P,
    request: (payload: P, clientIdempotencyKey: string) => Promise<R>,
  ): Promise<R | null> {
    const sentKey = key
    try {
      const res = await request(payload, sentKey)
      setUnconfirmed(null)
      setKey(crypto.randomUUID())
      return res
    } catch (err) {
      Sentry.captureException(err)
      // `send` corre adentro del startTransition(async) del componente, y después
      // del await un set* suelto ya no es parte de esa transición: el aviso de
      // reintento se pintaba un render antes de que `pending` bajara, con los
      // controles todavía deshabilitados. Envuelto, toma el carril de la acción en
      // curso y sale en el mismo commit. Cuando el servidor contesta queda afuera a
      // propósito: la key tiene que rotar ya, y si el componente después llama a
      // router.refresh(), la transición espera al RSC.
      startTransition(() => setUnconfirmed({ key: sentKey, payload }))
      return null
    }
  }

  return { retryPayload, send }
}
