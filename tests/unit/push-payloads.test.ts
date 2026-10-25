import { describe, expect, it } from 'vitest'
import {
  BOOKING_CANCELED_PUSH_TYPE,
  bookingCanceledPayload,
  planPushPayload,
  type PlanPushEvent,
} from '@/modules/notifications/push-payloads'

const base = {
  bookingId: 'b-1',
  courtName: 'Cancha 2',
  ymd: '2026-10-25',
  dateLabel: '25 de octubre',
  timeLabel: '21:00–22:00',
}

describe('bookingCanceledPayload', () => {
  it('cancelación común: título con la cancha, cuerpo con día y hora, y abre la grilla de ese día', () => {
    expect(bookingCanceledPayload({ ...base, late: false })).toEqual({
      type: BOOKING_CANCELED_PUSH_TYPE,
      bookingId: 'b-1',
      courtName: 'Cancha 2',
      dateLabel: '25 de octubre',
      timeLabel: '21:00–22:00',
      late: false,
      title: 'Reserva cancelada — Cancha 2',
      body: '25 de octubre · 21:00–22:00',
      url: '/grilla?date=2026-10-25',
    })
  })

  it('cancelación tardía: el título lo dice y el payload lleva late: true', () => {
    const p = bookingCanceledPayload({ ...base, late: true })
    expect(p.title).toBe('Cancelación tardía — Cancha 2')
    expect(p.late).toBe(true)
  })

  it('sin cancha (la reserva ya no se pudo leer): título sin sufijo', () => {
    const p = bookingCanceledPayload({ ...base, courtName: undefined, late: false })
    expect(p.title).toBe('Reserva cancelada')
  })

  it('sin fecha ni hora: cuerpo vacío sin separadores colgando y abre /grilla a secas', () => {
    const p = bookingCanceledPayload({
      bookingId: 'b-1',
      ymd: '',
      dateLabel: '',
      timeLabel: '',
      late: false,
    })
    expect(p.body).toBe('')
    expect(p.url).toBe('/grilla')
  })

  it('la URL no lleva el prefijo /admin: (admin) es un route group y no aparece en la ruta', () => {
    expect(bookingCanceledPayload({ ...base, late: false }).url).not.toContain('/admin')
  })
})

describe('planPushPayload', () => {
  const cases: Array<[PlanPushEvent, string, string]> = [
    [{ event: 'trial_ending', daysLeft: 3 }, 'Tu prueba termina en 3 días', 'Activá tu plan'],
    [{ event: 'trial_ending', daysLeft: 1 }, 'Tu prueba termina mañana', 'Activá tu plan'],
    [{ event: 'trial_expired' }, 'Terminó tu prueba', 'Activá tu plan'],
    [
      { event: 'payment_failed', retryDate: '28/10' },
      'No pudimos cobrar tu plan',
      'Vamos a reintentar el 28/10',
    ],
    [{ event: 'suspended' }, 'Tu cuenta quedó en solo lectura', 'Regularizá el pago'],
    [{ event: 'blocked' }, 'Bloqueamos el acceso a tu cuenta', 'Tus datos siguen guardados'],
    [
      { event: 'deletion_warning', deletionDate: '30/11', daysRemaining: 7 },
      'Tus datos se eliminan en 7 días',
      'El 30/11 los borramos',
    ],
  ]

  it.each(cases)('%j → título y cuerpo', (event, title, bodyStart) => {
    const p = planPushPayload(event, 'inst-1')
    expect(p.title).toBe(title)
    expect(p.body).toContain(bodyStart)
  })

  it('el type lleva el prefijo plan., el dedupeId viaja y apunta a facturación', () => {
    expect(planPushPayload({ event: 'suspended' }, 'inst-1')).toMatchObject({
      type: 'plan.suspended',
      dedupeId: 'inst-1',
      url: '/settings/facturacion',
    })
  })
})
