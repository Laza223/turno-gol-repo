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

/** El badge del jugador sin seña de por medio: lo único que cambia con la seña es "sin reembolso". */
const sinSena = (status: BookingStatus) => playerBookingVisual(status, 'not_required')

describe('el jugador y el complejo dicen lo mismo', () => {
  /**
   * El trinquete del lote: si alguien vuelve a escribir un label a mano en la
   * vista del jugador, esto se pone rojo. Antes decía "Confirmado" donde el
   * complejo lee "Confirmada" y "Expirado" donde lee "Expirada".
   */
  it('cada estado usa el label de la tabla compartida', () => {
    for (const status of ESTADOS) {
      if (status === 'canceled_no_refund') continue
      expect(sinSena(status).label, status).toBe(soloEstado(status).label)
    }
  })

  it('el mismo ícono, siempre', () => {
    for (const status of ESTADOS) {
      expect(sinSena(status).icon, status).toBe(soloEstado(status).icon)
    }
  })

  it('"Esperando seña" es el único nombre de ese estado', () => {
    expect(sinSena('pending_payment').label).toBe('Esperando seña')
  })
})

describe('lo que el jugador ve distinto, a propósito', () => {
  it('distingue las dos cancelaciones porque es su plata', () => {
    expect(playerBookingVisual('canceled_refunded', 'refunded').label).toBe('Cancelada')
    expect(playerBookingVisual('canceled_no_refund', 'captured').label).toBe(
      'Cancelada (sin reembolso)',
    )
    // El complejo las lee como una sola: para su caja el turno se liberó y punto.
    expect(soloEstado('canceled_no_refund').label).toBe('Cancelada')
  })

  it('"sin reembolso" solo si había seña pagada: sin ella es "Cancelada" a secas', () => {
    for (const deposit of ['paid', 'captured']) {
      expect(playerBookingVisual('canceled_no_refund', deposit).label, deposit).toBe(
        'Cancelada (sin reembolso)',
      )
    }
    for (const deposit of ['not_required', 'pending', 'refunded']) {
      expect(playerBookingVisual('canceled_no_refund', deposit).label, deposit).toBe('Cancelada')
    }
  })

  it('una reserva confirmada es verde y no azul', () => {
    // El azul del admin separa "pagada entera" de "señada", que es una
    // distinción de caja. El jugador no la tiene: para él confirmada es "listo".
    expect(sinSena('confirmed').tone).toBe('success')
    expect(soloEstado('confirmed').tone).toBe('info')
  })
})

describe('La Reserva: ni ámbar ni rojo de alarma en los estados del jugador', () => {
  it('"Ausente" y "Esperando seña" van en neutro: se explican en el texto de la tarjeta', () => {
    // En el complejo el ausente es rojo (plata que no entró) y la espera es ámbar. En el portal el
    // ámbar es solo de "Queda 1" y al jugador no se le grita.
    expect(soloEstado('no_show').tone).toBe('destructive')
    expect(sinSena('no_show').tone).toBe('neutral')
    expect(sinSena('pending_payment').tone).toBe('neutral')
  })

  it('ningún estado del jugador usa warning', () => {
    for (const status of ESTADOS) expect(sinSena(status).tone, status).not.toBe('warning')
  })
})

describe('el "No cobrado" de la caja no llega al jugador', () => {
  it('ningún estado le muestra "No cobrado"', () => {
    for (const status of ESTADOS) {
      expect(sinSena(status).label, status).not.toBe(PENDING_CHARGE_BADGE.label)
    }
  })

  it('un turno jugado sin cobrar sigue diciendo "Jugada"', () => {
    // En la grilla del complejo esa misma reserva dice "No cobrado". Acá no:
    // que el jugador vea que el complejo no cobró no le sirve y expone un dato
    // del mostrador.
    expect(sinSena('completed').label).toBe('Jugada')
    expect(sinSena('completed').tone).toBe('success')
  })
})

describe('`ended` es aditivo: el portal no lo pasa y no cambia', () => {
  it('confirmada con saldo, sin `ended`, sigue sin marcar "No cobrado" (mismo comportamiento de siempre)', () => {
    const conPending = bookingBadgeVisual({
      status: 'confirmed',
      type: 'spontaneous',
      pending: 150000,
      totalPaid: 0,
    })
    expect(conPending.unpaid).toBe(false)
    expect(conPending.label).toBe('Confirmada')
    // El portal llama `playerBookingVisual`, que SIEMPRE null-ea la plata: el
    // mismo estado, con o sin datos de pending/ended.
    expect(sinSena('confirmed').label).toBe(conPending.label)
  })
})

describe('un turno fijo no dice dos veces que es fijo', () => {
  it('el badge de estado no se convierte en "Abonado"', () => {
    // La tarjeta ya tiene su chip "Turno fijo" al lado. En la grilla `fixed`
    // pisa al estado porque una celda muestra una cosa sola.
    expect(sinSena('confirmed').label).toBe('Confirmada')
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
