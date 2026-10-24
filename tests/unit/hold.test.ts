import { describe, expect, it } from 'vitest'
import {
  HOLD_TTL_SECONDS,
  depositPayState,
  holdAllowsRetry,
  holdExpiresAtIso,
  holdExpiresAtMs,
  holdIsExpired,
  holdPayUntilLabel,
  holdRemainingLabel,
  holdRetryDeadlineMs,
} from '@/lib/booking/hold'

/**
 * B15 — la cuenta `created_at + TTL` estaba copiada a mano en cinco lugares, y
 * esa duplicación ya mordió: el contador del jugador decía 15 minutos cuando el
 * hold vencía a los 6, así que confiaba en un margen que no existía y perdía el
 * slot (caza-bugs #12). Ahora hay una sola cuenta; estos tests son lo que
 * impide que vuelva a divergir.
 */
const T0 = Date.parse('2026-08-11T20:30:00.000Z')

describe('vencimiento del hold', () => {
  it('el TTL es el mismo que usa el job de expiración', () => {
    // Si alguien cambia DEFAULT_EXPIRY_SECONDS, la UI lo sigue solo porque sale
    // de la misma constante. Esto lo deja escrito.
    expect(HOLD_TTL_SECONDS).toBe(6 * 60)
  })

  it('vence exactamente TTL después de created_at', () => {
    expect(holdExpiresAtMs(new Date(T0))).toBe(T0 + HOLD_TTL_SECONDS * 1000)
  })

  it('acepta string y Date por igual', () => {
    // Los dos caminos existen de verdad: `tx.execute` devuelve string y el query
    // builder devuelve Date (ver la tabla en src/shared/db/client.ts).
    expect(holdExpiresAtMs('2026-08-11T20:30:00.000Z')).toBe(holdExpiresAtMs(new Date(T0)))
  })

  it('holdExpiresAtIso devuelve el mismo instante en ISO', () => {
    expect(holdExpiresAtIso(new Date(T0))).toBe(
      new Date(T0 + HOLD_TTL_SECONDS * 1000).toISOString(),
    )
  })

  it('holdIsExpired es cierto EN el instante de vencimiento, no después', () => {
    const expiry = holdExpiresAtMs(new Date(T0))
    expect(holdIsExpired(new Date(T0), expiry - 1)).toBe(false)
    expect(holdIsExpired(new Date(T0), expiry)).toBe(true)
  })
})

describe('holdRemainingLabel', () => {
  const heldUntil = new Date(T0 + 6 * 60 * 1000).toISOString()

  it('cuenta minutos y segundos con el segundo en dos dígitos', () => {
    expect(holdRemainingLabel(heldUntil, T0)).toEqual({ expired: false, label: '6:00' })
    expect(holdRemainingLabel(heldUntil, T0 + 60_000)).toEqual({ expired: false, label: '5:00' })
    // 4 min 5 s: el '05' con cero adelante es lo que evita leer "4:5".
    expect(holdRemainingLabel(heldUntil, T0 + 115_000)).toEqual({ expired: false, label: '4:05' })
  })

  it('redondea hacia arriba para no mostrar 0:00 con tiempo restante', () => {
    // A 500 ms del final quedan "1" segundos, no "0": mostrar 0:00 mientras el
    // hold todavía retiene la cancha es la misma clase de mentira que este
    // bloque viene a sacar.
    expect(holdRemainingLabel(heldUntil, T0 + 6 * 60 * 1000 - 500)).toEqual({
      expired: false,
      label: '0:01',
    })
  })

  it('marca expirado EN el instante exacto y después', () => {
    expect(holdRemainingLabel(heldUntil, T0 + 6 * 60 * 1000)).toEqual({ expired: true })
    expect(holdRemainingLabel(heldUntil, T0 + 99 * 60 * 1000)).toEqual({ expired: true })
  })

  it('una fecha basura cae a expirado en vez de renderizar NaN', () => {
    expect(holdRemainingLabel('no-es-una-fecha', T0)).toEqual({ expired: true })
  })
})

describe('holdAllowsRetry', () => {
  // La preferencia nueva vence 60 s antes del hold, con un piso de 30 s desde ahora: con 90 s o
  // menos de hold, vencería después y el pago llegaría tarde.
  const created = new Date(T0)
  const expires = T0 + HOLD_TTL_SECONDS * 1000

  it('con más de 90 s de hold se puede reintentar', () => {
    expect(holdAllowsRetry(created, expires - 91_000)).toBe(true)
    expect(holdAllowsRetry(created, T0)).toBe(true)
  })

  it('con 90 s o menos ya no: la preferencia sobreviviría al hold', () => {
    expect(holdAllowsRetry(created, expires - 90_000)).toBe(false)
    expect(holdAllowsRetry(created, expires - 10_000)).toBe(false)
    expect(holdAllowsRetry(created, expires + 1)).toBe(false)
  })
})

describe('holdRetryDeadlineMs / holdPayUntilLabel', () => {
  it('el plazo para pagar es el vencimiento del hold menos los 90 s, el mismo borde que holdAllowsRetry', () => {
    const deadline = holdRetryDeadlineMs(new Date(T0))
    expect(deadline).toBe(T0 + HOLD_TTL_SECONDS * 1000 - 90_000)
    expect(holdAllowsRetry(new Date(T0), deadline - 1)).toBe(true)
    expect(holdAllowsRetry(new Date(T0), deadline)).toBe(false)
  })

  it('la hora va en ART y corta los segundos: nunca promete un minuto que no hay', () => {
    // T0 = 17:30:00 ART; el plazo cae 17:34:30 → "17:34", no "17:35".
    expect(holdPayUntilLabel(new Date(T0))).toBe('17:34')
    expect(holdPayUntilLabel(new Date(T0).toISOString())).toBe('17:34')
  })

  it('pasada la medianoche ART dice 00:xx, no 24:xx', () => {
    // 02:58:00Z = 23:58 ART → plazo 00:02:30 del día siguiente.
    expect(holdPayUntilLabel(new Date('2026-08-12T02:58:00Z'))).toBe('00:02')
  })
})

describe('depositPayState — la regla de "Pagar la seña" en /pendiente y Mis reservas', () => {
  const base = {
    status: 'pending_payment',
    depositAmount: 500000,
    mpReady: true,
    inProcess: false,
    createdAt: new Date(T0),
  }

  it('con hold, seña y MercadoPago listo: se ofrece', () => {
    expect(depositPayState(base, T0)).toBe('open')
  })

  it('un pago en curso gana sobre todo: nunca se ofrece otro', () => {
    expect(depositPayState({ ...base, inProcess: true }, T0)).toBe('processing')
    expect(depositPayState({ ...base, inProcess: true }, T0 + 10 * 60_000)).toBe('processing')
  })

  it('sin margen de hold: cerrado, aunque MercadoPago esté caído', () => {
    const late = holdRetryDeadlineMs(base.createdAt)
    expect(depositPayState(base, late)).toBe('closed')
    expect(depositPayState({ ...base, mpReady: false }, late)).toBe('closed')
  })

  it('con hold pero sin MercadoPago o sin seña: no disponible (la acción mandaría en loop a /pendiente)', () => {
    expect(depositPayState({ ...base, mpReady: false }, T0)).toBe('unavailable')
    expect(depositPayState({ ...base, depositAmount: 0 }, T0)).toBe('unavailable')
  })

  it('fuera de pending_payment no aplica', () => {
    expect(depositPayState({ ...base, status: 'confirmed' }, T0)).toBeNull()
    expect(depositPayState({ ...base, status: 'expired' }, T0)).toBeNull()
  })
})
