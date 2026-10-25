import { describe, expect, it } from 'vitest'
import {
  isInboundSilent,
  openHoursBetween,
  type OpeningHoursMap,
} from '@/modules/super-admin/whatsapp-silence'
import {
  pickSignatureAlerts,
  pickSilenceAlerts,
  SIGNATURE_ALERT_MINUTES,
} from '@/modules/super-admin/whatsapp-ops-alerts.service'

// 08:00 a 23:00, viernes hasta las 02:00 y domingo cerrado.
const HOURS: OpeningHoursMap = {
  mon: { open: '08:00', close: '23:00' },
  tue: { open: '08:00', close: '23:00' },
  wed: { open: '08:00', close: '23:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '08:00', close: '02:00' },
  sat: { open: '08:00', close: '23:00' },
  sun: { open: '08:00', close: '23:00', closed: true },
}
// Los instantes van en hora argentina (UTC-3).
const at = (isoArt: string) => new Date(`${isoArt}-03:00`)

describe('openHoursBetween', () => {
  it('cuenta solo las horas con el complejo abierto', () => {
    // Mar 22:00 a mié 10:00: abierto 22-23 (1 h) y 08-10 (2 h).
    expect(
      openHoursBetween({
        since: at('2026-10-20T22:00:00'),
        now: at('2026-10-21T10:00:00'),
        openingHours: HOURS,
        closesNextDay: false,
      }),
    ).toBe(3)
  })

  it('con cierre pasada la medianoche la madrugada cuenta como abierta', () => {
    // Vie 23:00 a sáb 03:00, cierra a las 02:00: abierto 23-02 (3 h).
    expect(
      openHoursBetween({
        since: at('2026-10-23T23:00:00'),
        now: at('2026-10-24T03:00:00'),
        openingHours: HOURS,
        closesNextDay: true,
      }),
    ).toBe(3)
  })

  it('sin closesNextDay esa madrugada es horario cerrado', () => {
    expect(
      openHoursBetween({
        since: at('2026-10-24T00:00:00'),
        now: at('2026-10-24T03:00:00'),
        openingHours: HOURS,
        closesNextDay: false,
      }),
    ).toBe(0)
  })

  it('un día cerrado no suma horas', () => {
    expect(
      openHoursBetween({
        since: at('2026-10-25T08:00:00'),
        now: at('2026-10-25T20:00:00'),
        openingHours: HOURS,
        closesNextDay: false,
      }),
    ).toBe(0)
  })
})

describe('isInboundSilent', () => {
  const base = { openingHours: HOURS, closesNextDay: false }
  const floor = at('2026-10-01T00:00:00')

  it('último entrante hace 6 horas abiertas o más: silencio', () => {
    expect(
      isInboundSilent({
        ...base,
        floor,
        lastInboundAt: at('2026-10-21T08:00:00'),
        now: at('2026-10-21T14:00:00'),
      }),
    ).toBe(true)
  })

  it('con 5 horas abiertas todavía no', () => {
    expect(
      isInboundSilent({
        ...base,
        floor,
        lastInboundAt: at('2026-10-21T09:00:00'),
        now: at('2026-10-21T14:00:00'),
      }),
    ).toBe(false)
  })

  it('la noche cerrada no acumula silencio', () => {
    // 9 horas de reloj desde las 22:00 hasta las 07:00, pero solo 1 con el complejo abierto.
    expect(
      isInboundSilent({
        ...base,
        floor,
        lastInboundAt: at('2026-10-20T22:00:00'),
        now: at('2026-10-21T07:00:00'),
      }),
    ).toBe(false)
  })

  it('sin entrantes nunca, se mide desde que se conectó el número', () => {
    const args = { ...base, lastInboundAt: null, now: at('2026-10-21T14:00:00') }
    expect(isInboundSilent({ ...args, floor: at('2026-10-21T13:00:00') })).toBe(false)
    expect(isInboundSilent({ ...args, floor: at('2026-10-20T08:00:00') })).toBe(true)
  })
})

describe('pickSilenceAlerts', () => {
  const now = new Date('2026-10-21T15:00:00Z')

  it('una alerta por complejo, con clave por tenant y día', () => {
    const alerts = pickSilenceAlerts(
      [
        { tenantId: 't1', tenantName: 'El Vagón', lastInboundAt: null },
        { tenantId: 't2', tenantName: 'La Quinta', lastInboundAt: null },
      ],
      now,
    )
    expect(alerts.map((a) => a.key)).toEqual([
      'wa-sin-entrantes:t1:2026-10-21',
      'wa-sin-entrantes:t2:2026-10-21',
    ])
    expect(alerts[0]?.subject).toContain('El Vagón')
  })

  it('sin números en silencio no hay alertas', () => {
    expect(pickSilenceAlerts([], now)).toEqual([])
  })
})

describe('pickSignatureAlerts', () => {
  const now = new Date('2026-10-21T15:00:00Z')

  it('debajo del umbral no alerta', () => {
    expect(pickSignatureAlerts(SIGNATURE_ALERT_MINUTES - 1, now)).toEqual([])
  })

  it('en el umbral alerta, con clave por hora ART', () => {
    const alerts = pickSignatureAlerts(SIGNATURE_ALERT_MINUTES, now)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.key).toBe('wa-firma-rechazada:2026-10-21T12')
  })
})
