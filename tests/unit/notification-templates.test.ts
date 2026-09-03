import { describe, expect, it } from 'vitest'
import {
  renderBookingConfirmed,
  renderBookingCanceled,
  renderBookingCanceledByComplex,
  renderBookingRescheduled,
  renderAdminNewBooking,
  renderTrialWelcome,
  renderTrialEnding,
  renderTrialExpired,
  renderDunningPaymentFailed,
  renderDepositExpired,
  renderAdminLatePayment,
  renderPlayerLatePaymentRefunded,
  renderAdminTransferExpired,
  renderAdminRefundPendingReminder,
  renderOnboardingAbandoned,
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
  const CANCELED_BASE = {
    playerFirstName: 'Tomás',
    courtName: 'Cancha 5',
    date: '02/06/2027',
    timeStart: '10:00',
    timeEnd: '11:00',
    tenantName: 'Complejo Norte',
    bookingCode: 'A1B2C3D4',
    tenantPhone: '+54 9 2323 346976',
    tenantWhatsapp: null,
    tenantEmail: 'contacto@complejo.test',
  }

  it('subject signals cancelation', () => {
    const { subject } = renderBookingCanceled({ ...CANCELED_BASE, canceledBy: 'player' })
    expect(subject.toLowerCase()).toContain('cancelad')
  })

  /**
   * El mail decía "contactá directamente al complejo" sin dar un solo canal, y
   * es justo el mail donde el jugador se entera de que le tienen que devolver
   * la seña. El teléfono y el email son NOT NULL en la base: siempre hay algo.
   */
  it('da los canales de contacto del complejo, no solo la frase', () => {
    const { html, text } = renderBookingCanceled({ ...CANCELED_BASE, canceledBy: 'player' })
    expect(html).toContain('+54 9 2323 346976')
    expect(html).toContain('contacto@complejo.test')
    // Sin WhatsApp propio cargado cae al teléfono, normalizado a formato wa.me.
    expect(html).toContain('https://wa.me/5492323346976')
    expect(text!).toContain('contacto@complejo.test')
  })

  it('incluye el código de reserva, que el complejo puede buscar', () => {
    const { html, text } = renderBookingCanceled({ ...CANCELED_BASE, canceledBy: 'player' })
    expect(html).toContain('A1B2C3D4')
    expect(text!).toContain('A1B2C3D4')
  })

  it('html includes reason when provided', () => {
    const { html } = renderBookingCanceled({
      ...CANCELED_BASE,
      canceledBy: 'admin',
      reason: 'Lluvia',
    })
    expect(html).toContain('Lluvia')
    // Ancla el assert negativo de abajo: 'Motivo' es la etiqueta real de la fila.
    // Sin esto, si la etiqueta cambiara, el par positivo/negativo daría falso verde.
    expect(html).toContain('Motivo')
  })

  it('html omits reason row when absent', () => {
    const { html } = renderBookingCanceled({ ...CANCELED_BASE, canceledBy: 'admin' })
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
    bookingCode: 'A1B2C3D4',
    tenantPhone: '+54 9 2323 346976',
    tenantWhatsapp: null,
    tenantEmail: 'contacto@complejo.test',
  }

  it('subject names the tenant', () => {
    const { subject } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: false })
    expect(subject).toContain('Complejo Norte')
    expect(subject.toLowerCase()).toContain('cancelad')
  })

  it('anuncia que corresponde la devolución cuando había seña', () => {
    const { html } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: true })
    // Exacto (no lowercase 'devoluc' suelto): alinea con el assert negativo,
    // así el par no puede dar verde si la línea cambia de forma.
    expect(html).toContain('Te corresponde la devolución de la seña')
  })

  /**
   * Antes decía "te devolvemos la seña de forma automática". No hay nada
   * automático: el reembolso por API falla siempre con 403 de permisos, así que
   * el mail prometía plata que nadie había mandado.
   */
  it('no promete que la devolución ya se hizo', () => {
    const { html, text } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: true })
    expect(html).not.toContain('forma automática')
    expect(html).not.toContain('Reembolso confirmado')
    expect(text ?? '').not.toContain('forma automática')
  })

  it('html omits refund line when refundConfirmed is false', () => {
    const { html } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: false })
    expect(html).not.toContain('Te corresponde la devolución')
  })

  it('text incluye la nota de devolución solo cuando refundConfirmed es true', () => {
    const yes = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: true })
    const no = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: false })
    expect(yes.text).toBeTruthy()
    expect(yes.text!).toContain('Te corresponde la devolución de la seña')
    expect(no.text ?? '').not.toContain('Te corresponde la devolución')
  })

  it('da los canales de contacto del complejo', () => {
    const { html } = renderBookingCanceledByComplex({ ...BASE, refundConfirmed: true })
    expect(html).toContain('+54 9 2323 346976')
    expect(html).toContain('contacto@complejo.test')
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
  const WELCOME_DATA = { ownerName: 'Marcelo', tenantName: 'Complejo Norte' }

  it('subject contains tenant name', () => {
    const { subject } = renderTrialWelcome(WELCOME_DATA)
    expect(subject).toContain('Complejo Norte')
  })

  it('html greets owner by name', () => {
    const { html } = renderTrialWelcome(WELCOME_DATA)
    expect(html).toContain('Marcelo')
  })

  // El copy tenía "30 días" fijo. El self-signup crea el trial en 30 y a los
  // pilotos se les extiende después desde soporte, cuando este mail ya salió:
  // el número quedaba contradiciendo lo pactado. Sin días explícitos no se
  // afirma ninguno.
  it('sin días explícitos no afirma ningún plazo', () => {
    const { html, text } = renderTrialWelcome(WELCOME_DATA)
    expect(html).not.toContain('30 días')
    expect(text).not.toContain('30 días')
    expect(html).toContain('Tu prueba gratuita ya está activa')
    expect(text).toContain('Tu prueba gratuita ya está activa')
  })

  it('con días explícitos los dice, en html y en text', () => {
    const { html, text } = renderTrialWelcome({ ...WELCOME_DATA, trialDays: 90 })
    expect(html).toContain('90 días')
    expect(text).toContain('90 días')
    expect(html).not.toContain('30 días')
  })

  it('singulariza un trial de un solo día', () => {
    const { html, text } = renderTrialWelcome({ ...WELCOME_DATA, trialDays: 1 })
    expect(html).toContain('1 día de prueba')
    expect(text).toContain('1 día de prueba')
    expect(html).not.toContain('1 días')
  })

  // `content` sale del JSONB de `notifications`: el tipo no rige en runtime.
  // Una fila encolada antes de este cambio no trae la clave, y un 0 o un
  // negativo tampoco describen un plazo real. Los tres caen en la frase neutra
  // en vez de renderizar "undefined días".
  it.each([
    ['ausente', undefined],
    ['cero', 0],
    ['negativo', -5],
  ])('con trialDays %s cae en la frase sin número', (_caso, dias) => {
    const { html, text } = renderTrialWelcome({
      ...WELCOME_DATA,
      trialDays: dias as number | undefined,
    })
    expect(html).toContain('Tu prueba gratuita ya está activa')
    expect(html).not.toContain('undefined')
    expect(text).not.toContain('undefined')
    expect(html).not.toMatch(/-?\d+ días? de prueba/)
  })
})

describe('renderTrialEnding', () => {
  it('subject includes days remaining', () => {
    const { subject } = renderTrialEnding({
      ownerName: 'Marcelo',
      tenantName: 'Norte',
      daysLeft: 3,
    })
    expect(subject).toContain('3')
  })

  it('singular form for 1 day', () => {
    const { subject } = renderTrialEnding({
      ownerName: 'Marcelo',
      tenantName: 'Norte',
      daysLeft: 1,
    })
    expect(subject).toContain('1 día ')
    expect(subject).not.toContain('días')
  })
})

describe('renderTrialExpired', () => {
  it('subject and body do not promise a data-retention deadline', () => {
    const { subject, html, text } = renderTrialExpired({
      ownerName: 'Marcelo',
      tenantName: 'Norte',
    })
    // La transición que dispara este mail no fija scheduled_deletion_at —
    // prometer un plazo acá sería mentirle al dueño.
    expect(subject + html + text).not.toMatch(/\d+\s*días?/)
  })

  it('html greets owner and names the tenant', () => {
    const { html } = renderTrialExpired({ ownerName: 'Marcelo', tenantName: 'Complejo Norte' })
    expect(html).toContain('Marcelo')
    expect(html).toContain('Complejo Norte')
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

  // Decisión del dueño 2026-08-19: sobre una reserva `expired` el reembolso
  // sale solo, así que pedirle al complejo "acción manual" pasó a ser mentira.
  // Los otros estados terminales SÍ la siguen necesitando, por eso la copy es
  // condicional y no un reemplazo.
  it('con refundIssued deja de pedir acción manual, en subject, html y text', () => {
    const { subject, html, text } = renderAdminLatePayment({ ...DATA, refundIssued: true })
    expect(subject).not.toContain('acción requerida')
    expect(html).not.toContain('acción manual')
    expect(text).not.toContain('acción manual')
    expect(html).toContain('automáticamente')
    expect(text).toContain('automáticamente')
    expect(html).toContain('3.000,00')
  })
})

describe('renderPlayerLatePaymentRefunded', () => {
  const DATA = {
    playerFirstName: 'Tomás',
    courtName: 'Cancha 5',
    date: '02/06/2027',
    timeStart: '20:00',
    tenantName: 'Complejo Norte',
    amountArs: '3.000,00',
  }

  it('le dice al jugador que la plata vuelve, con monto y turno', () => {
    const { subject, html, text } = renderPlayerLatePaymentRefunded(DATA)
    expect(subject).toContain('Cancha 5')
    expect(html).toContain('3.000,00')
    expect(html).toContain('Complejo Norte')
    expect(html).toContain('20:00')
    expect(text).toContain('3.000,00')
  })

  it('escapa el nombre del complejo (viene de input del dueño)', () => {
    const { html } = renderPlayerLatePaymentRefunded({
      ...DATA,
      tenantName: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
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

describe('renderAdminRefundPendingReminder', () => {
  const BASE = {
    refundPaymentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    bookingId: '11111111-2222-4333-8444-555555555555',
    amountArs: '5.000,00',
    daysPending: 9,
    playerName: 'Tomás García',
    courtName: 'Cancha 5',
    date: '14/08/2026',
  }

  it('dice cuántos días lleva y cuánto se debe', () => {
    const { subject, html, text } = renderAdminRefundPendingReminder(BASE)
    expect(subject).toContain('9 días')
    expect(subject).toContain('5.000,00')
    expect(html).toContain('Tomás García')
    expect(text!).toContain('9 días')
  })

  /**
   * Es el único aviso de devolución sin saldar, y cubre las señas cobradas en
   * efectivo, para las que el panel de MercadoPago no sirve de nada. Por eso
   * tiene que mandar a la pantalla propia y ofrecer los tres medios.
   */
  it('manda a Devoluciones y no asume que la plata salió por MercadoPago', () => {
    const { html } = renderAdminRefundPendingReminder(BASE)
    expect(html).toContain('Devoluciones')
    expect(html).toContain('transferencia o efectivo')
    expect(html).not.toContain('Se requiere acción manual')
  })

  it('sin datos del turno no rompe ni inventa filas vacías', () => {
    const { html } = renderAdminRefundPendingReminder({
      refundPaymentId: BASE.refundPaymentId,
      bookingId: null,
      amountArs: '5.000,00',
      daysPending: 8,
    })
    expect(html).not.toContain('Cancha')
    expect(html).not.toContain('undefined')
  })
})

describe('renderTemplate dispatcher', () => {
  it('routes booking_confirmed to correct renderer', () => {
    const result = renderTemplate('booking_confirmed', CONFIRMED_DATA)
    expect(result.subject).toContain('Cancha 5')
    expect(result.html).toContain('Tomás')
  })

  // Un mapeo mal cableado en RENDERERS pasaría desapercibido sin probar el dispatcher.
  it('routes booking_canceled_by_complex to its renderer', () => {
    const result = renderTemplate('booking_canceled_by_complex', {
      ...CONFIRMED_DATA,
      bookingCode: 'A1B2C3D4',
      tenantPhone: '+54 9 2323 346976',
      tenantWhatsapp: null,
      tenantEmail: 'contacto@complejo.test',
      refundConfirmed: true,
    })
    expect(result.subject).toContain('Complejo Norte')
    expect(result.html).toContain('Te corresponde la devolución de la seña')
  })
})

describe('renderBookingRescheduled', () => {
  const DATA = {
    playerFirstName: 'Nicolás',
    tenantName: 'Complejo San Telmo',
    fromCourtName: 'Cancha 1',
    fromDate: '06/08/2026',
    fromTimeStart: '18:00',
    fromTimeEnd: '19:00',
    toCourtName: 'Cancha 3',
    toDate: '07/08/2026',
    toTimeStart: '21:00',
    toTimeEnd: '22:00',
    price: '$ 25.000,00',
    priceChanged: false,
  }

  it('el subject dice a dónde quedó el turno, no de dónde salió', () => {
    const { subject } = renderBookingRescheduled(DATA)
    expect(subject).toContain('Cancha 3')
    expect(subject).toContain('21:00')
    expect(subject).not.toContain('Cancha 1')
  })

  it('muestra el origen y el destino, para poder leer el cambio de un vistazo', () => {
    const { html, text } = renderBookingRescheduled(DATA)
    for (const body of [html, text!]) {
      expect(body).toContain('Nicolás')
      expect(body).toContain('Cancha 1')
      expect(body).toContain('18:00')
      expect(body).toContain('Cancha 3')
      expect(body).toContain('21:00')
    }
  })

  it('destaca el cambio de precio solo cuando el precio cambió', () => {
    const igual = renderBookingRescheduled(DATA)
    expect(igual.html).not.toContain('El precio del turno cambió')
    expect(igual.html).toContain('$ 25.000,00')

    const distinto = renderBookingRescheduled({ ...DATA, priceChanged: true })
    expect(distinto.html).toContain('El precio del turno cambió')
    expect(distinto.text).toContain('El precio del turno cambió')
  })

  it('se puede renderizar por nombre, como lo hace el worker de envío', () => {
    expect(isTemplateName('booking_rescheduled')).toBe(true)
    const out = renderTemplate('booking_rescheduled', DATA)
    expect(out.subject).toBeTruthy()
    expect(out.html).toContain('Tu turno se movió')
  })
})

describe('renderOnboardingAbandoned', () => {
  const DATA = { ownerName: 'Marcelo', tenantName: 'Complejo Norte', lastStepLabel: 'Horarios' }

  it('subject nombra el complejo', () => {
    const { subject } = renderOnboardingAbandoned(DATA)
    expect(subject).toContain('Complejo Norte')
  })

  it('html dice en qué paso quedó, sin fingir que fue más lejos', () => {
    const { html, text } = renderOnboardingAbandoned(DATA)
    for (const body of [html, text!]) {
      expect(body).toContain('Marcelo')
      expect(body).toContain('Horarios')
    }
  })

  it('se puede renderizar por nombre, como lo hace el worker de abandono', () => {
    expect(isTemplateName('onboarding_abandoned')).toBe(true)
    const out = renderTemplate('onboarding_abandoned', DATA)
    expect(out.subject).toBeTruthy()
    expect(out.html).toContain('Horarios')
  })
})

describe('isTemplateName', () => {
  it('returns true for all valid template names', () => {
    const valid = [
      'booking_confirmed',
      'booking_canceled',
      'booking_canceled_by_complex',
      'booking_rescheduled',
      'admin_new_booking',
      'trial_welcome',
      'trial_ending',
      'dunning_payment_failed',
      'deposit_expired',
      'admin_late_payment',
      'admin_transfer_expired',
      'onboarding_abandoned',
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
