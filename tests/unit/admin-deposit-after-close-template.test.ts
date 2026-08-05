import { describe, expect, it } from 'vitest'
import { renderAdminDepositAfterClose } from '@/modules/notifications/templates/admin-deposit-after-close'

// El mail se manda cuando una seña se cobró con la caja del día ya cerrada, y
// el dueño lo usa para registrar el movimiento a mano al día siguiente. El
// template nació con un solo emisor (el webhook de MP) y tenía "por Mercado
// Pago" hardcodeado en el cuerpo. Cuando se sumaron los cobros de mostrador
// (confirmar una seña pendiente, y ahora también el alta con la seña ya
// cobrada), el mail pasó a mentir: mandaba al dueño a buscar en el panel de MP
// una plata que estaba en el cajón.

const BASE = {
  bookingId: '11111111-1111-4111-8111-111111111111',
  amountArs: '2.400,00',
}

describe('renderAdminDepositAfterClose — el medio de pago del aviso', () => {
  it('efectivo: dice "en efectivo", nunca Mercado Pago', () => {
    const { html, text } = renderAdminDepositAfterClose({ ...BASE, method: 'cash' })
    expect(text).toContain('$2.400,00 en efectivo')
    expect(html).toContain('en efectivo')
    expect(text).not.toContain('Mercado Pago')
    expect(html).not.toContain('Mercado Pago')
  })

  it('transferencia y otro medio tienen su propia frase', () => {
    expect(renderAdminDepositAfterClose({ ...BASE, method: 'transfer' }).text).toContain(
      'por transferencia',
    )
    expect(renderAdminDepositAfterClose({ ...BASE, method: 'other' }).text).toContain(
      'por otro medio',
    )
  })

  it('mercadopago explícito mantiene el texto original', () => {
    expect(renderAdminDepositAfterClose({ ...BASE, method: 'mercadopago' }).text).toContain(
      'por Mercado Pago',
    )
  })

  it('sin method degrada a Mercado Pago: el contrato viejo del template sigue valiendo', () => {
    // Importa para no romper llamadas viejas encoladas en `notifications` que
    // se rendericen después del deploy: el content guardado no tiene `method`.
    expect(renderAdminDepositAfterClose(BASE).text).toContain('por Mercado Pago')
  })

  it('el símbolo $ lo pone el template, no el caller', () => {
    // `amountArs` viaja SIN símbolo (formatArs de payment.service da
    // "2.400,00"). Si un caller mandara el formato de @/lib/format, saldría "$$".
    const { text } = renderAdminDepositAfterClose({ ...BASE, method: 'cash' })
    expect(text).toContain('$2.400,00')
    expect(text).not.toContain('$$')
  })
})
