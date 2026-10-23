import { describe, expect, it } from 'vitest'
import {
  KAPSO_PLAN_MONTHLY_MESSAGES,
  monthWindowArt,
  projectMonth,
  tokensToUsd,
} from '@/modules/super-admin/whatsapp-monitor.service'
import {
  classifyNumberHealth,
  pickOpsAlerts,
} from '@/modules/super-admin/whatsapp-ops-alerts.service'
import type { KapsoNumberHealth } from '@/lib/kapso/platform'

describe('tokensToUsd (Claude Haiku 5.5: 0,10 / 0,01 / 0,50 USD por millón)', () => {
  it('un millón de cada tipo suma 0,61', () => {
    expect(tokensToUsd({ input: 1e6, cached: 1e6, output: 1e6 })).toBeCloseTo(0.61, 10)
  })

  it('cada tipo se cobra a su precio', () => {
    expect(tokensToUsd({ input: 1e6, cached: 0, output: 0 })).toBeCloseTo(0.1, 10)
    expect(tokensToUsd({ input: 0, cached: 1e6, output: 0 })).toBeCloseTo(0.01, 10)
    expect(tokensToUsd({ input: 0, cached: 0, output: 1e6 })).toBeCloseTo(0.5, 10)
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
    // 01:00 ART del 1/11 = 04:00 UTC. 23:30 ART del 31/10 = 02:30 UTC del 1/11.
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

describe('projectMonth', () => {
  it('proyección lineal: 500 en 10 días de un mes de 31 días', () => {
    // 11/10 03:00 UTC = 10 días justos transcurridos desde 01/10 03:00 UTC.
    const now = new Date('2026-10-11T03:00:00Z')
    const r = projectMonth({ total: 500, limit: 2000, window: monthWindowArt(now), now })
    expect(r.projected).toBeCloseTo(1550, 5)
    expect(r.crossingDay).toBeNull()
  })

  it('mes de 30 vs 31 días: mismo ritmo, distinta proyección', () => {
    const oct = new Date('2026-10-11T03:00:00Z')
    const nov = new Date('2026-11-11T03:00:00Z')
    const a = projectMonth({ total: 600, limit: 99999, window: monthWindowArt(oct), now: oct })
    const b = projectMonth({ total: 600, limit: 99999, window: monthWindowArt(nov), now: nov })
    expect(a.projected).toBeCloseTo(1860, 5)
    expect(b.projected).toBeCloseTo(1800, 5)
  })

  it('día de cruce: 100 por día contra un límite de 2000 cruza el día 20', () => {
    const now = new Date('2026-10-11T03:00:00Z')
    const r = projectMonth({ total: 1000, limit: 2000, window: monthWindowArt(now), now })
    expect(r.projected).toBeCloseTo(3100, 5)
    expect(r.crossingDay).toBe(20)
  })

  it('el primer día no explota: el piso de días transcurridos es 1', () => {
    const now = new Date('2026-10-01T03:05:00Z')
    const r = projectMonth({ total: 10, limit: 2000, window: monthWindowArt(now), now })
    expect(r.projected).toBeCloseTo(310, 5)
    expect(r.crossingDay).toBeNull()
  })

  it('sin mensajes: proyección 0 y sin día de cruce', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    const r = projectMonth({ total: 0, limit: 2000, window: monthWindowArt(now), now })
    expect(r).toEqual({ projected: 0, crossingDay: null })
  })

  it('el día de cruce nunca pasa del último día del mes', () => {
    const now = new Date('2026-11-29T03:00:00Z')
    // 28 días transcurridos, 1990 mensajes: ritmo 71/día → cruza el 29, dentro de noviembre.
    const r = projectMonth({ total: 1990, limit: 2000, window: monthWindowArt(now), now })
    expect(r.crossingDay).not.toBeNull()
    expect(r.crossingDay).toBeLessThanOrEqual(30)
  })
})

describe('pickOpsAlerts', () => {
  const NOW = new Date('2026-10-21T15:07:00Z') // 12:07 ART
  const base = { now: NOW, monthTotal: 0, backlog: 0, botErrorPaused: 0 }
  const limit = KAPSO_PLAN_MONTHLY_MESSAGES

  it('sin nada para avisar, no hay alertas', () => {
    expect(pickOpsAlerts({ ...base, monthTotal: limit * 0.79 })).toEqual([])
  })

  it('80%: kapso-80 con el mes ART', () => {
    const alerts = pickOpsAlerts({ ...base, monthTotal: limit * 0.8 })
    expect(alerts.map((a) => a.key)).toEqual(['kapso-80:2026-10'])
  })

  it('80% y 100% en el mismo tick: un solo mail, el de 100', () => {
    const alerts = pickOpsAlerts({ ...base, monthTotal: limit })
    expect(alerts.map((a) => a.key)).toEqual(['kapso-100:2026-10'])
  })

  it('el mes de la clave es el ART: 23:30 ART del 31 sigue siendo octubre', () => {
    const alerts = pickOpsAlerts({
      ...base,
      now: new Date('2026-11-01T02:30:00Z'),
      monthTotal: limit,
    })
    expect(alerts[0]?.key).toBe('kapso-100:2026-10')
  })

  it('backlog: clave por hora ART', () => {
    const alerts = pickOpsAlerts({ ...base, backlog: 3 })
    expect(alerts.map((a) => a.key)).toEqual(['backlog:2026-10-21T12'])
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
    const alerts = pickOpsAlerts({ monthTotal: limit, backlog: 4, botErrorPaused: 1, now: NOW })
    expect(alerts.map((a) => a.key)).toEqual([
      'kapso-100:2026-10',
      'backlog:2026-10-21T12',
      'bot-error:2026-10-21T12',
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
    // Los checks se miran solos: no se confía en que Kapso los refleje en el `status`.
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
