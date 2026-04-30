import { describe, expect, it } from 'vitest'
import {
  renderBookingConfirmed,
  renderBookingCanceled,
  renderBookingReminder,
  renderAdminNewBooking,
  renderTrialWelcome,
  renderTrialEnding,
  renderDunningPaymentFailed,
  renderDepositExpired,
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

describe('renderBookingReminder', () => {
  it('subject mentions tomorrow', () => {
    const { subject } = renderBookingReminder(CONFIRMED_DATA)
    expect(subject.toLowerCase()).toContain('mañana')
  })

  it('html contains date and time', () => {
    const { html } = renderBookingReminder(CONFIRMED_DATA)
    expect(html).toContain('02/06/2027')
    expect(html).toContain('10:00')
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

describe('renderTemplate dispatcher', () => {
  it('routes booking_confirmed to correct renderer', () => {
    const result = renderTemplate('booking_confirmed', CONFIRMED_DATA)
    expect(result.subject).toContain('Cancha 5')
    expect(result.html).toContain('Tomás')
  })
})

describe('isTemplateName', () => {
  it('returns true for all valid template names', () => {
    const valid = [
      'booking_confirmed',
      'booking_canceled',
      'booking_reminder',
      'admin_new_booking',
      'trial_welcome',
      'trial_ending',
      'dunning_payment_failed',
      'deposit_expired',
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
