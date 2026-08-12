import { describe, expect, it } from 'vitest'
import {
  HOLD_TTL_SECONDS,
  holdExpiresAtIso,
  holdExpiresAtMs,
  holdIsExpired,
  holdRemainingLabel,
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
