import { describe, expect, it } from 'vitest'
import {
  renderBookingConfirmed,
  renderBookingCanceled,
  renderBookingCanceledByComplex,
  renderNoShowDebtCreated,
  renderAdminNewBooking,
  renderTrialWelcome,
  renderTrialEnding,
  renderDunningPaymentFailed,
  renderDepositExpired,
  renderAdminLatePayment,
  renderAdminTransferExpired,
  renderTemplate,
  isTemplateName,
} from '@/modules/notifications/templates'

const CONFIRMED_DATA = {
  playerFirstName: 'Tomás',
  courtName: 'Cancha 5',
  date: '02/06/2027',
  timeStart: '10:00',
  timeEnd: '11:00',
  tenantName: 'Complejo Norte',
  tenantAddress: 'Av. Libertador 1200',
}

describe('renderBookingConfirmed', () => {
  it('subject contains court and date', () => {
    const { subject } = renderBookingConfirmed(CONFIRMED_DATA)
    expect(subject).toContain('Cancha 5')
    expect(subject).toContain('02/06/2027')
  })

  it('html contains player name and address', () => {
    const { html } = renderBookingConfirmed(CONFIRMED_DATA)
    expect(html).toContain('Tomás')
    expect(html).toContain('Av. Libertador 1200')
  })

  it('text is defined and contains key info', () => {
    const { text } = renderBookingConfirmed(CONFIRMED_DATA)
    expect(text).toBeTruthy()
    expect(text).toContain('Tomás')
    expect(text).toContain('10:00')
  })
})

describe('renderBookingCanceled', () => {
  it('subject signals cancelation', () => {
    const { subject } = renderBookingCanceled({
      playerFirstName: 'Tomás',
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      tenantName: 'Complejo Norte',
      canceledBy: 'player',
    })
    expect(subject.toLowerCase()).toContain('cancelad')
  })

  it('html includes reason when provided', () => {
    const { html } = renderBookingCanceled({
      playerFirstName: 'Tomás',
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      tenantName: 'Complejo Norte',
      canceledBy: 'admin',
      reason: 'Lluvia',
    })
    expect(html).toContain('Lluvia')
    // Ancla el assert negativo de abajo: 'Motivo' es la etiqueta real de la fila.
    // Sin esto, si la etiqueta cambiara, el par positivo/negativo daría falso verde.
    expect(html).toContain('Motivo')
  })

  it('html omits reason row when absent', () => {
    const { html } = renderBookingCanceled({
      playerFirstName: 'Tomás',
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      tenantName: 'Complejo Norte',
      canceledBy: 'admin',
    })
    expect(html).not.toContain('Motivo')
  })
})

describe('renderBookingCanceledByComplex', () => {
  const BASE = {
    playerFirstName: 'Tomás',
    courtName: 'Cancha 5',
    date: '02/06/2027',
    timeStart: '10:00',
    timeEnd: '11:00',
    tenantName: 'Complejo Norte',
  }

  it('subject names the tenant', () => {
    const { subject } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: false })
    expect(subject).toContain('Complejo Norte')
    expect(subject.toLowerCase()).toContain('cancelad')
  })

  it('html confirms refund when refundConfirmed is true', () => {
    const { html } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: true })
    // Exacto (no lowercase 'reembolso' suelto): alinea con el assert negativo,
    // así el par no puede dar verde si la línea cambia de forma.
    expect(html).toContain('Reembolso confirmado')
  })

  it('html omits refund line when refundConfirmed is false', () => {
    const { html } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: false })
    expect(html).not.toContain('Reembolso confirmado')
  })

  it('text incluye la nota de reembolso solo cuando refundConfirmed es true', () => {
    const yes = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: true })
    const no = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: false })
    expect(yes.text).toBeTruthy()
    expect(yes.text!).toContain('Reembolso confirmado')
    expect(no.text ?? '').not.toContain('Reembolso confirmado')
  })
})

describe('renderNoShowDebtCreated', () => {
  const DATA = {
    playerFirstName: 'Tomás',
    courtName: 'Cancha 5',
    date: '02/06/2027',
    timeStart: '10:00',
    timeEnd: '11:00',
    tenantName: 'Complejo Norte',
    debtAmount: '$15.000',
    tenantAddress: 'Av. Libertador 1200',
  }

  it('subject signals a pending debt and names the tenant', () => {
    const { subject } = renderNoShowDebtCreated(DATA)
    expect(subject.toLowerCase()).toContain('deuda')
    expect(subject).toContain('Complejo Norte')
  })

  it('html shows the amount, address and the regularize instruction', () => {
    const { html } = renderNoShowDebtCreated(DATA)
    expect(html).toContain('$15.000')
    expect(html).toContain('Av. Libertador 1200')
    expect(html.toLowerCase()).toContain('regularizar')
    // Regla de negocio del cambio #5/#20: el mail debe avisar el bloqueo online.
    expect(html.toLowerCase()).toContain('no vas a poder reservar')
  })

  it('text is defined and includes the debt amount', () => {
    const { text } = renderNoShowDebtCreated(DATA)
    expect(text).toBeTruthy()
    expect(text).toContain('$15.000')
  })
})

describe('renderAdminNewBooking', () => {
  it('subject contains court name', () => {
    const { subject } = renderAdminNewBooking({
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      playerName: 'Tomás García',
    })
    expect(subject).toContain('Cancha 5')
  })

  it('phone row absent when not provided', () => {
    const { html } = renderAdminNewBooking({
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      playerName: 'Tomás',
    })
    expect(html).not.toContain('Teléfono')
  })

  it('phone row present when provided', () => {
    const { html } = renderAdminNewBooking({
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      timeEnd: '11:00',
      playerName: 'Tomás',
      playerPhone: '11-9999-8888',
    })
    expect(html).toContain('11-9999-8888')
  })
})

describe('renderTrialWelcome', () => {
  it('subject contains tenant name', () => {
    const { subject } = renderTrialWelcome({ ownerName: 'Marcelo', tenantName: 'Complejo Norte' })
    expect(subject).toContain('Complejo Norte')
  })

  it('html greets owner by name', () => {
    const { html } = renderTrialWelcome({ ownerName: 'Marcelo', tenantName: 'Complejo Norte' })
    expect(html).toContain('Marcelo')
  })
})

describe('renderTrialEnding', () => {
  it('subject includes days remaining', () => {
    const { subject } = renderTrialEnding({ ownerName: 'Marcelo', tenantName: 'Norte', daysLeft: 3 })
    expect(subject).toContain('3')
  })

  it('singular form for 1 day', () => {
    const { subject } = renderTrialEnding({ ownerName: 'Marcelo', tenantName: 'Norte', daysLeft: 1 })
    expect(subject).toContain('1 día ')
    expect(subject).not.toContain('días')
  })
})

describe('renderDunningPaymentFailed', () => {
  it('subject signals payment problem', () => {
    const { subject } = renderDunningPaymentFailed({
      ownerName: 'Marcelo',
      tenantName: 'Norte',
      retryDate: '15/06/2027',
    })
    expect(subject.toLowerCase()).toContain('pago')
  })

  it('html includes retry date', () => {
    const { html } = renderDunningPaymentFailed({
      ownerName: 'Marcelo',
      tenantName: 'Norte',
      retryDate: '15/06/2027',
    })
    expect(html).toContain('15/06/2027')
  })
})

describe('renderDepositExpired', () => {
  it('subject signals expiry', () => {
    const { subject } = renderDepositExpired({
      playerFirstName: 'Tomás',
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      tenantName: 'Complejo Norte',
    })
    expect(subject.toLowerCase()).toContain('expiró')
  })
})

describe('renderAdminLatePayment', () => {
  const DATA = {
    bookingId: 'abcdef12-3456-7890-aaaa-bbbbbbbbbbbb',
    amountArs: '3.000,00',
    currentStatus: 'expired',
    courtName: 'Cancha 5',
    date: '02/06/2027',
  }

  it('subject flags required action and the booking ref', () => {
    const { subject } = renderAdminLatePayment(DATA)
    expect(subject.toLowerCase()).toContain('pago tardío')
    expect(subject).toContain('abcdef12')
  })

  it('html shows the amount and demands manual action', () => {
    const { html } = renderAdminLatePayment(DATA)
    expect(html).toContain('3.000,00')
    expect(html).toContain('acción manual')
    expect(html).toContain('Cancha 5')
  })

  it('text omits optional detail rows when absent', () => {
    const { text } = renderAdminLatePayment({
      bookingId: 'abcdef12-3456-7890-aaaa-bbbbbbbbbbbb',
      amountArs: '500,00',
      currentStatus: 'canceled_no_refund',
    })
    expect(text).toContain('500,00')
    expect(text).not.toContain('Cancha')
  })
})

describe('renderAdminTransferExpired', () => {
  it('subject signals a freed slot and the html explains 48h', () => {
    const { subject, html } = renderAdminTransferExpired({
      courtName: 'Cancha 5',
      date: '02/06/2027',
      timeStart: '10:00',
      bookingId: 'abcdef12-3456-7890-aaaa-bbbbbbbbbbbb',
    })
    expect(subject).toContain('Cancha 5')
    expect(html).toContain('48 horas')
    expect(html).toContain('abcdef12')
  })
})

describe('renderTemplate dispatcher', () => {
  it('routes booking_confirmed to correct renderer', () => {
    const result = renderTemplate('booking_confirmed', CONFIRMED_DATA)
    expect(result.subject).toContain('Cancha 5')
    expect(result.html).toContain('Tomás')
  })

  // Los 2 templates nuevos (#20) estaban registrados pero el dispatcher nunca se
  // probaba con ellos: un mapeo mal cableado en RENDERERS pasaría desapercibido.
  it('routes booking_canceled_by_complex to its renderer', () => {
    const result = renderTemplate('booking_canceled_by_complex', {
      ...CONFIRMED_DATA,
      refundConfirmed: true,
    })
    expect(result.subject).toContain('Complejo Norte')
    expect(result.html).toContain('Reembolso confirmado')
  })

  it('routes no_show_debt_created to its renderer', () => {
    const result = renderTemplate('no_show_debt_created', {
      ...CONFIRMED_DATA,
      debtAmount: '$15.000',
    })
    expect(result.subject.toLowerCase()).toContain('deuda')
    expect(result.html).toContain('$15.000')
  })
})

describe('isTemplateName', () => {
  it('returns true for all valid template names', () => {
    const valid = [
      'booking_confirmed',
      'booking_canceled',
      'booking_canceled_by_complex',
      'no_show_debt_created',
      'admin_new_booking',
      'trial_welcome',
      'trial_ending',
      'dunning_payment_failed',
      'deposit_expired',
      'admin_late_payment',
      'admin_transfer_expired',
    ]
    for (const name of valid) {
      expect(isTemplateName(name)).toBe(true)
    }
  })

  it('returns false for unknown names', () => {
    expect(isTemplateName('unknown_template')).toBe(false)
    expect(isTemplateName('')).toBe(false)
    expect(isTemplateName('BOOKING_CONFIRMED')).toBe(false)
  })
})
