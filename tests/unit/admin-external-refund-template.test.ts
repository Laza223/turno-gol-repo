import { describe, expect, it } from 'vitest'
import { renderAdminExternalRefundDetected } from '@/modules/notifications/templates/admin-external-refund-detected'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const REF = BOOKING_ID.slice(0, 8)

describe('renderAdminExternalRefundDetected', () => {
  it('cuando reconcilió: dice que la seña quedó reembolsada y aclara que el turno NO se canceló', () => {
    const { subject, html, text } = renderAdminExternalRefundDetected({
      bookingId: BOOKING_ID,
      amountArs: '2.400,00',
      reconciled: true,
    })

    expect(subject).toContain(REF)
    expect(subject).toMatch(/mercado pago/i)
    expect(html).toMatch(/marcamos la seña como reembolsada/i)
    // La aclaración importa: sin ella el dueño puede asumir que el sistema le
    // liberó el horario solo, y el slot queda ocupado sin que nadie lo mire.
    expect(html).toMatch(/turno NO se canceló/i)
    expect(text).toMatch(/marcamos la seña como reembolsada/i)
  })

  it('cuando NO reconcilió: nombra el estado real del turno y pide revisarlo a mano', () => {
    const { html, text } = renderAdminExternalRefundDetected({
      bookingId: BOOKING_ID,
      amountArs: '2.400,00',
      reconciled: false,
      bookingStatus: 'no_show',
    })

    expect(html).toMatch(/no pudimos actualizarlo solos/i)
    expect(html).toContain('no_show')
    expect(html).toMatch(/revisalo a mano/i)
    expect(text).toContain('no_show')
    // El camino feliz no debe filtrarse al no feliz.
    expect(html).not.toMatch(/marcamos la seña como reembolsada/i)
  })

  it('sin bookingStatus degrada a "final" en vez de imprimir undefined', () => {
    const { html, text } = renderAdminExternalRefundDetected({
      bookingId: BOOKING_ID,
      amountArs: '2.400,00',
      reconciled: false,
    })

    expect(html).not.toContain('undefined')
    expect(text).not.toContain('undefined')
    expect(html).toContain('final')
  })

  it('deja explícito que al jugador no se le avisó — es la decisión, no un olvido', () => {
    const { html, text } = renderAdminExternalRefundDetected({
      bookingId: BOOKING_ID,
      amountArs: '2.400,00',
      reconciled: true,
    })

    expect(html).toMatch(/al jugador no le avisamos/i)
    expect(text).toMatch(/al jugador no le avisamos/i)
  })

  it('el monto viaja pre-formateado y aparece en asunto o cuerpo', () => {
    const { html, text } = renderAdminExternalRefundDetected({
      bookingId: BOOKING_ID,
      amountArs: '2.400,00',
      reconciled: true,
    })

    expect(html).toContain('$2.400,00')
    expect(text).toContain('$2.400,00')
  })
})
