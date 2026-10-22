import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRivalMatchSchema,
  inviteCodeSchema,
  publishBoardSchema,
  RIVAL_REPORT_REASONS,
  rivalReportSchema,
  rivalWelcomeSchema,
} from '@/modules/rival/rival.schema'

const TENANT = '11111111-1111-4111-8111-111111111111'
const BOOKING = '22222222-2222-4222-8222-222222222222'

// Jueves 22/10/2026 12:00 ART (UTC-3, sin DST).
const NOW = new Date('2026-10-22T15:00:00Z')

function base(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    startsAt: '2026-10-23T22:00:00Z', // viernes 19:00 ART
    format: 5,
    level: 'parejo',
    courtDeclared: true,
    ...overrides,
  }
}

function startsAtError(startsAt: string): string | undefined {
  const r = createRivalMatchSchema.safeParse(base({ startsAt }))
  return r.success ? undefined : r.error.issues[0]?.message
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('createRivalMatchSchema: ventana de inicio (ART)', () => {
  it('acepta en punto y y media dentro de la ventana', () => {
    expect(createRivalMatchSchema.safeParse(base()).success).toBe(true)
    expect(
      createRivalMatchSchema.safeParse(base({ startsAt: '2026-10-23T22:30:00Z' })).success,
    ).toBe(true)
  })

  it('rechaza el pasado y el instante exacto de ahora', () => {
    expect(startsAtError('2026-10-22T14:30:00Z')).toMatch(/a futuro/)
    expect(startsAtError(NOW.toISOString())).toMatch(/a futuro/)
  })

  it('rechaza lo que no cae en punto o y media', () => {
    expect(startsAtError('2026-10-23T22:15:00Z')).toMatch(/en punto o y media/)
    expect(startsAtError('2026-10-23T22:00:30Z')).toMatch(/en punto o y media/)
  })

  it('el último día es hoy + 7 en ART: 23:30 ART entra aunque en UTC ya sea el día siguiente', () => {
    // hoy ART = 22/10, tope 29/10. 29/10 23:30 ART = 30/10 02:30 UTC.
    expect(
      createRivalMatchSchema.safeParse(base({ startsAt: '2026-10-30T02:30:00Z' })).success,
    ).toBe(true)
    // 30/10 00:00 ART = 30/10 03:00 UTC: ya es el día 8.
    expect(startsAtError('2026-10-30T03:00:00Z')).toMatch(/7 días/)
  })

  it('hoy se mide en ART y no en UTC: a las 22:30 ART (01:30 UTC del día siguiente) el tope no corre', () => {
    vi.setSystemTime(new Date('2026-10-23T01:30:00Z'))
    // Para el reloj ART todavía es 22/10: 30/10 00:00 ART sigue afuera de la ventana...
    expect(startsAtError('2026-10-30T03:00:00Z')).toMatch(/7 días/)
    // ...y 23:00 ART de hoy (02:00 UTC) está adentro.
    expect(
      createRivalMatchSchema.safeParse(base({ startsAt: '2026-10-23T02:00:00Z' })).success,
    ).toBe(true)
  })

  it('rechaza fechas inválidas', () => {
    expect(createRivalMatchSchema.safeParse(base({ startsAt: 'mañana' })).success).toBe(false)
  })
})

describe('createRivalMatchSchema: formato, cupo, cancha', () => {
  it('el cupo por defecto es el formato por 2', () => {
    const r = createRivalMatchSchema.parse(base({ format: 7 }))
    expect(r.capacity).toBe(14)
  })

  it('acepta cupos de 2 a 22 y rechaza el resto', () => {
    expect(createRivalMatchSchema.parse(base({ capacity: 2 })).capacity).toBe(2)
    expect(createRivalMatchSchema.parse(base({ format: 11, capacity: 22 })).capacity).toBe(22)
    expect(createRivalMatchSchema.safeParse(base({ capacity: 1 })).success).toBe(false)
    expect(createRivalMatchSchema.safeParse(base({ capacity: 23 })).success).toBe(false)
  })

  it('el formato va de 4 a 11', () => {
    expect(createRivalMatchSchema.safeParse(base({ format: 4 })).success).toBe(true)
    expect(createRivalMatchSchema.safeParse(base({ format: 11 })).success).toBe(true)
    expect(createRivalMatchSchema.safeParse(base({ format: 3 })).success).toBe(false)
    expect(createRivalMatchSchema.safeParse(base({ format: 12 })).success).toBe(false)
    expect(createRivalMatchSchema.safeParse(base({ format: 5.5 })).success).toBe(false)
  })

  it('en "Busca rival" el cupo es el formato, y un cupo distinto se rechaza', () => {
    const board = { seeking: 'rival', whatsapp: '11 5555-1234', whatsappConsent: true }
    expect(createRivalMatchSchema.parse(base({ format: 7, board })).capacity).toBe(7)
    expect(createRivalMatchSchema.parse(base({ format: 7, capacity: 7, board })).capacity).toBe(7)
    expect(createRivalMatchSchema.safeParse(base({ format: 7, capacity: 14, board })).success).toBe(
      false,
    )
  })

  it('exige cancha: reserva o la casilla "Ya tengo la cancha"', () => {
    expect(createRivalMatchSchema.safeParse(base({ courtDeclared: false })).success).toBe(false)
    expect(createRivalMatchSchema.safeParse(base({ courtDeclared: undefined })).success).toBe(false)
    const withBooking = createRivalMatchSchema.parse(
      base({ courtDeclared: false, bookingId: BOOKING }),
    )
    expect(withBooking.bookingId).toBe(BOOKING)
    expect(createRivalMatchSchema.parse(base()).bookingId).toBeNull()
  })

  it('el nivel es cerrado', () => {
    expect(createRivalMatchSchema.safeParse(base({ level: 'pro' })).success).toBe(false)
    for (const level of ['tranqui', 'parejo', 'picante']) {
      expect(createRivalMatchSchema.safeParse(base({ level })).success).toBe(true)
    }
  })

  it('sin board es solo el grupo', () => {
    expect(createRivalMatchSchema.parse(base()).board).toBeNull()
  })
})

describe('publishBoardSchema', () => {
  const ok = { seeking: 'players', whatsapp: '011 15 5555-1234', whatsappConsent: true }

  it('normaliza el WhatsApp argentino a los dígitos de wa.me', () => {
    expect(publishBoardSchema.parse(ok).whatsappDigits).toBe('5491155551234')
    expect(publishBoardSchema.parse({ ...ok, whatsapp: '+54 9 11 5555-1234' }).whatsappDigits).toBe(
      '5491155551234',
    )
  })

  it('rechaza un teléfono que no es argentino o no se puede marcar', () => {
    expect(publishBoardSchema.safeParse({ ...ok, whatsapp: '+598 99 123 456' }).success).toBe(false)
    expect(publishBoardSchema.safeParse({ ...ok, whatsapp: '123' }).success).toBe(false)
    expect(publishBoardSchema.safeParse({ ...ok, whatsapp: '' }).success).toBe(false)
  })

  it('exige el consentimiento explícito', () => {
    expect(publishBoardSchema.safeParse({ ...ok, whatsappConsent: false }).success).toBe(false)
    const { whatsappConsent: _omit, ...withoutConsent } = ok
    expect(publishBoardSchema.safeParse(withoutConsent).success).toBe(false)
  })

  it('"jugadores" lleva posición (por defecto "Donde me pongan"); "rival" no lleva', () => {
    expect(publishBoardSchema.parse(ok).seekingPosition).toBe('any')
    expect(publishBoardSchema.parse({ ...ok, seekingPosition: 'goalkeeper' }).seekingPosition).toBe(
      'goalkeeper',
    )
    expect(publishBoardSchema.parse({ ...ok, seeking: 'rival' }).seekingPosition).toBeNull()
    expect(
      publishBoardSchema.safeParse({ ...ok, seeking: 'rival', seekingPosition: 'any' }).success,
    ).toBe(false)
    expect(publishBoardSchema.safeParse({ ...ok, seeking: 'todos' }).success).toBe(false)
  })
})

describe('inviteCodeSchema', () => {
  it('acepta 10 símbolos del alfabeto', () => {
    expect(inviteCodeSchema.safeParse('ABCDEFGHJK').success).toBe(true)
    expect(inviteCodeSchema.safeParse('MNPQRSTUVW').success).toBe(true)
    expect(inviteCodeSchema.safeParse('XYZ2345678').success).toBe(true)
    expect(inviteCodeSchema.safeParse('9ABCDEFGHJ').success).toBe(true)
  })

  it('rechaza largo distinto, minúsculas y símbolos fuera del alfabeto (I, L, O, 0, 1)', () => {
    expect(inviteCodeSchema.safeParse('ABCDEFGHJ').success).toBe(false)
    expect(inviteCodeSchema.safeParse('ABCDEFGHJKM').success).toBe(false)
    expect(inviteCodeSchema.safeParse('abcdefghjk').success).toBe(false)
    for (const bad of ['I', 'L', 'O', '0', '1']) {
      expect(inviteCodeSchema.safeParse(`ABCDEFGHJ${bad}`).success, bad).toBe(false)
    }
    expect(inviteCodeSchema.safeParse('ABCDEFGH J').success).toBe(false)
  })
})

describe('rivalWelcomeSchema y rivalReportSchema', () => {
  it('la zona sale de la lista cerrada, con "Otra zona"', () => {
    const ok = { firstName: ' Lazaro ', position: 'any', zone: 'Luján' }
    expect(rivalWelcomeSchema.parse(ok).firstName).toBe('Lazaro')
    expect(rivalWelcomeSchema.safeParse({ ...ok, zone: 'Otra zona' }).success).toBe(true)
    expect(rivalWelcomeSchema.safeParse({ ...ok, zone: 'Palermo' }).success).toBe(false)
    expect(rivalWelcomeSchema.safeParse({ ...ok, position: 'dt' }).success).toBe(false)
    expect(rivalWelcomeSchema.safeParse({ ...ok, firstName: '   ' }).success).toBe(false)
  })

  it('los motivos de denuncia son los 4 cerrados', () => {
    expect([...RIVAL_REPORT_REASONS]).toEqual(['not_exists', 'spam', 'offensive', 'minor'])
    expect(rivalReportSchema.safeParse({ matchId: TENANT, reason: 'spam' }).success).toBe(true)
    expect(rivalReportSchema.safeParse({ matchId: TENANT, reason: 'otro' }).success).toBe(false)
  })
})
