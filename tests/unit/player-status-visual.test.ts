import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { playerBookingVisual } from '@/app/(player)/mis-reservas/status-visual'
import { PENDING_CHARGE_BADGE, bookingBadgeVisual } from '@/lib/booking/slot-visual'
import type { BookingStatus } from '@/modules/bookings/booking.types'

const ESTADOS: BookingStatus[] = [
  'pending_payment',
  'confirmed',
  'expired',
  'canceled_refunded',
  'canceled_no_refund',
  'completed',
  'no_show',
]

const soloEstado = (status: BookingStatus) =>
  bookingBadgeVisual({ status, type: 'spontaneous', pending: null, totalPaid: null })

describe('el jugador y el complejo dicen lo mismo', () => {
  /**
   * El trinquete del lote: si alguien vuelve a escribir un label a mano en la
   * vista del jugador, esto se pone rojo. Antes decía "Confirmado" donde el
   * complejo lee "Confirmada" y "Expirado" donde lee "Expirada".
   */
  it('cada estado usa el label de la tabla compartida', () => {
    for (const status of ESTADOS) {
      if (status === 'canceled_no_refund') continue
      expect(playerBookingVisual(status).label, status).toBe(soloEstado(status).label)
    }
  })

  it('el mismo ícono, siempre', () => {
    for (const status of ESTADOS) {
      expect(playerBookingVisual(status).icon, status).toBe(soloEstado(status).icon)
    }
  })

  it('"Esperando seña" es el único nombre de ese estado', () => {
    expect(playerBookingVisual('pending_payment').label).toBe('Esperando seña')
  })
})

describe('lo que el jugador ve distinto, a propósito', () => {
  it('distingue las dos cancelaciones porque es su plata', () => {
    expect(playerBookingVisual('canceled_refunded').label).toBe('Cancelada')
    expect(playerBookingVisual('canceled_no_refund').label).toBe('Cancelada (sin reembolso)')
    // El complejo las lee como una sola: para su caja el turno se liberó y punto.
    expect(soloEstado('canceled_no_refund').label).toBe('Cancelada')
  })

  it('una reserva confirmada es verde y no azul', () => {
    // El azul del admin separa "pagada entera" de "señada", que es una
    // distinción de caja. El jugador no la tiene: para él confirmada es "listo".
    expect(playerBookingVisual('confirmed').tone).toBe('success')
    expect(soloEstado('confirmed').tone).toBe('info')
  })
})

describe('el "Por cobrar" de la caja no llega al jugador', () => {
  it('ningún estado le muestra "Por cobrar"', () => {
    for (const status of ESTADOS) {
      expect(playerBookingVisual(status).label, status).not.toBe(PENDING_CHARGE_BADGE.label)
    }
  })

  it('un turno jugado sin cobrar sigue diciendo "Jugada"', () => {
    // En la grilla del complejo esa misma reserva dice "Por cobrar". Acá no:
    // que el jugador vea que el complejo no cobró no le sirve y expone un dato
    // del mostrador.
    expect(playerBookingVisual('completed').label).toBe('Jugada')
    expect(playerBookingVisual('completed').tone).toBe('success')
  })
})

describe('un turno fijo no dice dos veces que es fijo', () => {
  it('el badge de estado no se convierte en "Abonado"', () => {
    // La tarjeta ya tiene su chip "Turno fijo" al lado. En la grilla `fixed`
    // pisa al estado porque una celda muestra una cosa sola.
    expect(playerBookingVisual('confirmed').label).toBe('Confirmada')
    expect(
      bookingBadgeVisual({ status: 'confirmed', type: 'fixed', pending: null, totalPaid: null })
        .label,
    ).toBe('Abonado')
  })
})

/**
 * El trinquete de la CLASE, no de la instancia. Cuatro superficies habían
 * escrito su propia tabla de labels de `booking_status` y las cuatro habían
 * divergido: la del jugador decía "Pago pendiente", la de la ficha del cliente
 * decía "Pago pendiente" y "Completada", y la grilla decía "Pagando ahora".
 * El término canónico es "Esperando seña" (MASTER §8.5, decisión del dueño
 * 2026-09-10) y el completado es "Jugada".
 *
 * `slot-visual.ts` declara sus estados como `{ label, icon, tone }`, no como
 * `estado: 'texto'`, así que esta forma solo aparece cuando alguien vuelve a
 * escribir la tabla a mano.
 */
const ROOT = resolve(__dirname, '../..')

/** Camina `src/` y devuelve los `.ts`/`.tsx`, en paths relativos con `/`. */
function findSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) findSources(full, out)
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(relative(ROOT, full).split(sep).join('/'))
    }
  }
  return out
}

describe('nadie declara su propia tabla de labels de reserva', () => {
  it('ningún archivo mapea pending_payment a un texto suelto', () => {
    const culpables = findSources(join(ROOT, 'src')).filter((rel) =>
      /pending_payment:\s*['"]/.test(readFileSync(join(ROOT, rel), 'utf8')),
    )
    expect(culpables, 'el label sale de slot-visual.ts, no de una copia').toEqual([])
  })
})
