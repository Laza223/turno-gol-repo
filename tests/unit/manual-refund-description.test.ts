import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { manualRefundDescription } from '@/modules/payments/refund.service'

/**
 * La invariante que protege este test es cara si se rompe: `description` es una
 * clave de join real. `retry-refunds.worker.ts` hace
 * `LEFT JOIN payments op ON p.description = 'Refund of ' || op.id::text` para
 * encontrar el pago de MercadoPago que tiene que reembolsar. Si una devolución
 * de una seña cobrada en EFECTIVO cayera en ese patrón, el worker intentaría
 * reembolsar contra MercadoPago plata que nunca pasó por MercadoPago —
 * loguearía un error cada hora y mandaría un mail con instrucciones falsas.
 */
describe('manualRefundDescription', () => {
  it('nunca colisiona con el patrón de los refunds de MercadoPago', () => {
    for (let i = 0; i < 1000; i++) {
      const id = randomUUID()
      const description = manualRefundDescription(id)
      expect(description).not.toBe(`Refund of ${id}`)
      // El patrón del LEFT JOIN es 'Refund of ' + <uuid>: el prefijo distinto
      // es lo que garantiza que la fila quede fuera del alcance del worker.
      expect(description.startsWith('Refund of ')).toBe(false)
    }
  })

  it('identifica la reserva, para poder rastrear la devolución', () => {
    const id = randomUUID()
    expect(manualRefundDescription(id)).toContain(id)
  })
})
