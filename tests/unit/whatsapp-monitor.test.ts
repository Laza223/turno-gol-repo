import { describe, expect, it } from 'vitest'
import { KAPSO_PLAN, kapsoCycleWindow, projectCycle } from '@/modules/super-admin/kapso-plan'
import { monthWindowArt, tokensToUsd } from '@/modules/super-admin/whatsapp-monitor.service'
import {
  classifyNumberHealth,
  pickOpsAlerts,
} from '@/modules/super-admin/whatsapp-ops-alerts.service'
import type { KapsoNumberHealth } from '@/lib/kapso/platform'

describe('tokensToUsd (OpenAI gpt-6.2-sol: 2,00 / 0,10 / 10,00 USD por millón)', () => {
  it('un millón de cada tipo suma 12,10', () => {
    expect(tokensToUsd({ input: 1e6, cached: 1e6, output: 1e6 })).toBeCloseTo(12.1, 10)
  })

  it('cada tipo se cobra a su precio', () => {
    expect(tokensToUsd({ input: 1e6, cached: 0, output: 0 })).toBeCloseTo(2.0, 10)
    expect(tokensToUsd({ input: 0, cached: 1e6, output: 0 })).toBeCloseTo(0.1, 10)
    expect(tokensToUsd({ input: 0, cached: 0, output: 1e6 })).toBeCloseTo(10.0, 10)
  })

  it('cero tokens son cero dólares', () => {
    expect(tokensToUsd({ input: 0, cached: 0, output: 0 })).toBe(0)
  })
})

describe('monthWindowArt', () => {
  it('el mes arranca a medianoche ART (03:00 UTC) y termina en la del mes siguiente', () => {
    const w = monthWindowArt(new Date('2026-10-21T15:00:00Z'))
    expect(w.ym).toBe('2026-10')
    expect(w.fromUtc.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(w.toUtc.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(w.daysInMonth).toBe(31)
  })

  it('01:00 ART del 1° ya es el mes nuevo; 23:30 ART del 31 sigue en el anterior', () => {
    expect(monthWindowArt(new Date('2026-11-01T04:00:00Z')).ym).toBe('2026-11')
    expect(monthWindowArt(new Date('2026-11-01T02:30:00Z')).ym).toBe('2026-10')
  })

  it('un mes de 30 días y febrero', () => {
    expect(monthWindowArt(new Date('2026-11-15T12:00:00Z')).daysInMonth).toBe(30)
    expect(monthWindowArt(new Date('2026-02-10T12:00:00Z')).daysInMonth).toBe(28)
  })

  it('diciembre cierra en enero del año siguiente', () => {
    const w = monthWindowArt(new Date('2026-12-31T12:00:00Z'))
    expect(w.toUtc.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('kapsoCycleWindow', () => {
  const at = (iso: string, anchor?: Date) => {
    const w = kapsoCycleWindow(new Date(iso), anchor)
    return [w.fromUtc.toISOString(), w.toUtc.toISOString()]
  }

  it('el ciclo vigente: del 21/11 al 21/12 a las 02:04:39 ART', () => {
    expect(at('2026-11-28T12:00:00Z')).toEqual([
      '2026-11-21T05:04:39.000Z',
      '2026-12-21T05:04:39.000Z',
    ])
    expect(kapsoCycleWindow(new Date('2026-11-28T12:00:00Z')).startDay).toBe('2026-11-21')
  })

  it('el 1 del mes no reinicia nada: sigue el mismo ciclo', () => {
    expect(at('2026-12-01T12:00:00Z')).toEqual(at('2026-11-30T12:00:00Z'))
  })

  it('el corte es un instante: un segundo antes sigue el ciclo anterior', () => {
    expect(kapsoCycleWindow(new Date('2026-12-21T05:04:38Z')).startDay).toBe('2026-11-21')
    expect(kapsoCycleWindow(new Date('2026-12-21T05:04:39Z')).startDay).toBe('2026-12-21')
  })

  it('cruza el año', () => {
    expect(at('2027-01-05T12:00:00Z')).toEqual([
      '2026-12-21T05:04:39.000Z',
      '2027-01-21T05:04:39.000Z',
    ])
  })

  describe('día de corte que no existe en el mes', () => {
    const anchor = new Date('2026-12-31T15:00:00Z')

    it('en febrero corta el último día', () => {
      expect(at('2027-02-10T12:00:00Z', anchor)).toEqual([
        '2027-01-31T15:00:00.000Z',
        '2027-02-28T15:00:00.000Z',
      ])
    })

    it('después de febrero vuelve al 31, y en abril corta el 30', () => {
      expect(at('2027-03-15T12:00:00Z', anchor)).toEqual([
        '2027-02-28T15:00:00.000Z',
        '2027-03-31T15:00:00.000Z',
      ])
      expect(at('2027-04-15T12:00:00Z', anchor)).toEqual([
        '2027-03-31T15:00:00.000Z',
        '2027-04-30T15:00:00.000Z',
      ])
    })

    it('en año bisiesto febrero corta el 29', () => {
      expect(at('2028-02-29T16:00:00Z', anchor)).toEqual([
        '2028-02-29T15:00:00.000Z',
        '2028-03-31T15:00:00.000Z',
      ])
    })

    it('el último día corto, antes de la hora del corte, es del ciclo anterior', () => {
      expect(kapsoCycleWindow(new Date('2027-02-28T14:59:59Z'), anchor).startDay).toBe('2027-01-31')
    })
  })
})

describe('projectCycle', () => {
  // Ciclo de 30 días (21/11 → 21/12).
  const window = kapsoCycleWindow(new Date('2026-11-28T12:00:00Z'))
  const afterDays = (days: number) => new Date(window.fromUtc.getTime() + days * 86_400_000)

  it('proyección lineal sobre el largo del ciclo', () => {
    const r = projectCycle({ total: 500, limit: 2000, window, now: afterDays(10) })
    expect(r.projected).toBeCloseTo(1500, 5)
    expect(r.crossingDate).toBeNull()
  })

  it('un ciclo de 31 días proyecta distinto que uno de 30', () => {
    const now = new Date('2026-12-31T05:04:39Z')
    const long = kapsoCycleWindow(now)
    const r = projectCycle({ total: 500, limit: 99999, window: long, now })
    expect(r.projected).toBeCloseTo(1550, 5)
  })

  it('el día de cruce puede caer en el mes siguiente al del arranque', () => {
    // 100 por día contra 2000: 20 días después del 21/11.
    const r = projectCycle({ total: 1000, limit: 2000, window, now: afterDays(10) })
    expect(r.projected).toBeCloseTo(3000, 5)
    expect(r.crossingDate).toBe('2026-12-11')
  })

  it('recién arrancado no explota: el piso de días transcurridos es 1', () => {
    const r = projectCycle({ total: 10, limit: 2000, window, now: afterDays(0.01) })
    expect(r.projected).toBeCloseTo(300, 5)
    expect(r.crossingDate).toBeNull()
  })

  it('sin mensajes: proyección 0 y sin día de cruce', () => {
    const r = projectCycle({ total: 0, limit: 2000, window, now: afterDays(10) })
    expect(r).toEqual({ projected: 0, crossingDate: null })
  })

  it('pasarse por poco da el último día del ciclo, no uno posterior', () => {
    const r = projectCycle({ total: 1999, limit: 2000, window, now: afterDays(29.9) })
    // 00:02 ART del 21/12, dos horas antes del corte.
    expect(r.crossingDate).toBe('2026-12-21')
  })
})

describe('pickOpsAlerts', () => {
  const NOW = new Date('2026-11-28T15:07:00Z')
  const base = { now: NOW, cycleTotal: 0, backlog: 0, botErrorPaused: 0 }
  const limit = KAPSO_PLAN.messagesPerCycle

  it('sin nada para avisar, no hay alertas', () => {
    expect(pickOpsAlerts({ ...base, cycleTotal: limit * 0.79 })).toEqual([])
  })

  it('80%: kapso-80 con el día en que arrancó el ciclo', () => {
    const alerts = pickOpsAlerts({ ...base, cycleTotal: limit * 0.8 })
    expect(alerts.map((a) => a.key)).toEqual(['kapso-80:2026-11-21'])
    expect(alerts[0]?.lines[0]).toContain('21 de diciembre')
  })

  it('80% y 100% en el mismo tick: un solo mail, el de 100', () => {
    const alerts = pickOpsAlerts({ ...base, cycleTotal: limit })
    expect(alerts.map((a) => a.key)).toEqual(['kapso-100:2026-11-21'])
  })

  it('cambiar de mes no repite el aviso; un ciclo nuevo sí puede avisar', () => {
    const keyAt = (iso: string) =>
      pickOpsAlerts({ ...base, now: new Date(iso), cycleTotal: limit })[0]?.key
    expect(keyAt('2026-12-01T15:00:00Z')).toBe('kapso-100:2026-11-21')
    expect(keyAt('2026-12-22T15:00:00Z')).toBe('kapso-100:2026-12-21')
  })

  it('backlog: clave por hora ART', () => {
    const alerts = pickOpsAlerts({ ...base, backlog: 3 })
    expect(alerts.map((a) => a.key)).toEqual(['backlog:2026-11-28T12'])
  })

  it('bot_error: clave por hora ART, y la hora cruza el día (00:30 ART = 03:30 UTC)', () => {
    const alerts = pickOpsAlerts({
      ...base,
      now: new Date('2026-10-22T03:30:00Z'),
      botErrorPaused: 2,
    })
    expect(alerts.map((a) => a.key)).toEqual(['bot-error:2026-10-22T00'])
  })

  it('21:00 ART del 21 (00:00 UTC del 22) sigue siendo el día 21', () => {
    const alerts = pickOpsAlerts({
      ...base,
      now: new Date('2026-10-22T00:10:00Z'),
      backlog: 1,
    })
    expect(alerts[0]?.key).toBe('backlog:2026-10-21T21')
  })

  it('todas juntas, y los mails no llevan datos personales', () => {
    const alerts = pickOpsAlerts({ cycleTotal: limit, backlog: 4, botErrorPaused: 1, now: NOW })
    expect(alerts.map((a) => a.key)).toEqual([
      'kapso-100:2026-11-21',
      'backlog:2026-11-28T12',
      'bot-error:2026-11-28T12',
    ])
    for (const a of alerts) {
      expect(a.subject.length).toBeGreaterThan(0)
      expect(a.lines.join(' ')).not.toMatch(/\d{10,}/)
    }
  })
})

describe('classifyNumberHealth', () => {
  const healthy: KapsoNumberHealth = {
    status: 'healthy',
    connection: 'CONNECTED',
    messaging: 'AVAILABLE',
    accessOk: true,
    failingChecks: [],
  }

  it('404 (null): caído, Kapso ya no tiene el número', () => {
    expect(classifyNumberHealth(null)).toEqual({ kind: 'down', cause: 'no_existe' })
  })

  it.each([
    [{ status: 'unhealthy', connection: 'DISCONNECTED' }, 'desconectado'],
    [{ status: 'unhealthy', accessOk: false, messaging: null }, 'sin_acceso'],
    [{ status: 'unhealthy', messaging: 'BLOCKED' }, 'bloqueado'],
    [{ status: 'unhealthy' }, 'otro'],
    [{ status: 'degraded', connection: 'DISCONNECTED' }, 'desconectado'],
    [{ status: 'healthy', messaging: 'BLOCKED' }, 'bloqueado'],
  ] as const)('%o es caído por %s', (patch, cause) => {
    expect(classifyNumberHealth({ ...healthy, ...patch })).toEqual({ kind: 'down', cause })
  })

  it('desconectado gana sobre bloqueado: se arregla reconectando', () => {
    expect(
      classifyNumberHealth({ ...healthy, connection: 'DISCONNECTED', messaging: 'BLOCKED' }),
    ).toEqual({ kind: 'down', cause: 'desconectado' })
  })

  it('degraded (LIMITED, nombre sin aprobar) no es caído', () => {
    expect(classifyNumberHealth({ ...healthy, status: 'degraded', messaging: 'LIMITED' })).toEqual({
      kind: 'degraded',
    })
  })

  it('`status: error` es desconocido, no caído', () => {
    expect(
      classifyNumberHealth({
        status: 'error',
        connection: null,
        messaging: null,
        accessOk: null,
        failingChecks: [],
      }),
    ).toEqual({ kind: 'unknown' })
  })

  it('sano es ok', () => {
    expect(classifyNumberHealth(healthy)).toEqual({ kind: 'ok' })
  })
})
