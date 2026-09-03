import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo #3 (campaña de mutación, docs/qa/TEST_AUDIT.md), decisión del
// dueño 2026-09-03: el push se queda, y dice lo mismo que el mail.
//
// `cashClosed` es un booleano — sale de `todayClose !== null` en
// home.service.ts, o sea prueba que HUBO cierre, no que la caja haya CUADRADO.
// El push afirmaba "caja cerrada sin diferencia" con ese booleano: un cierre
// con faltante o sobrante de efectivo disparaba igual el "sin diferencia".
// El mail (templates/daily-summary.ts) nunca tuvo el problema: dice "caja
// cerrada" a secas. Este test ata los dos canales al MISMO texto para que no
// vuelvan a divergir.

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: () => sqlMock,
  withTenantContext: vi.fn(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn({})),
}))
vi.mock('@/modules/home/home.service', () => ({ getHoyData: vi.fn() }))
vi.mock('@/modules/notifications/push.service', () => ({ notifyAdminPush: vi.fn() }))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

type SqlMock = ReturnType<typeof vi.fn> & ((...args: unknown[]) => Promise<unknown[]>)

const TENANT_ROW = {
  id: 'tenant-1',
  opening_hours: {},
  closed_dates: null,
  closes_next_day: false,
  // El mail es OPT-IN, default false (settings.daily_summary_email_opt_in):
  // sin prenderlo en Configuración → Avisos no sale ningún mail.
  daily_summary_email_opt_in: null,
}

let sqlMock: SqlMock

import { runDailySummarySweep } from '@/shared/jobs/workers/daily-summary.worker'
import { getHoyData } from '@/modules/home/home.service'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { renderDailySummary } from '@/modules/notifications/templates/daily-summary'

function hoyData(cashClosed: boolean) {
  return {
    numbers: {
      collectedTodayCents: 18450000,
      occupancy: { occupied: 11, available: 12 },
      cashClosed,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sqlMock = vi.fn(() => Promise.resolve([TENANT_ROW])) as SqlMock
})

describe('daily summary — el push no afirma más de lo que el booleano prueba', () => {
  it('caja cerrada: dice "caja cerrada" y NUNCA "sin diferencia" (cashClosed no prueba que cuadró)', async () => {
    vi.mocked(getHoyData).mockResolvedValue(hoyData(true) as never)

    await runDailySummarySweep()

    expect(notifyAdminPush).toHaveBeenCalledTimes(1)
    const [, payload] = (notifyAdminPush as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { summaryLabel: string },
    ]
    expect(payload.summaryLabel).toContain('caja cerrada')
    expect(payload.summaryLabel).not.toContain('sin diferencia')
  })

  it('caja sin cerrar: el texto no cambia', async () => {
    vi.mocked(getHoyData).mockResolvedValue(hoyData(false) as never)

    await runDailySummarySweep()

    const [, payload] = (notifyAdminPush as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { summaryLabel: string },
    ]
    expect(payload.summaryLabel).toContain('caja sin cerrar todavía')
  })

  it('push y mail dicen EXACTAMENTE lo mismo de la caja (un solo criterio, dos canales)', async () => {
    for (const cashClosed of [true, false]) {
      vi.clearAllMocks()
      vi.mocked(getHoyData).mockResolvedValue(hoyData(cashClosed) as never)

      await runDailySummarySweep()

      const [, payload] = (notifyAdminPush as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { summaryLabel: string },
      ]
      // El template del mail es la fuente de verdad del texto.
      const mail = renderDailySummary({
        dateLabel: 'x',
        collectedArs: '0',
        occupiedLabel: '0/0',
        cashClosed,
      })
      const mailCajaLabel = cashClosed ? 'caja cerrada' : 'caja sin cerrar todavía'
      expect(mail.text).toContain(mailCajaLabel)
      expect(payload.summaryLabel).toContain(mailCajaLabel)
      expect(payload.summaryLabel).not.toContain('sin diferencia')
    }
  })

  it('sin opt-in de mail (default) no se encola ningún email', async () => {
    vi.mocked(getHoyData).mockResolvedValue(hoyData(true) as never)

    await runDailySummarySweep()

    expect(enqueueTenantOwnerNotification).not.toHaveBeenCalled()
  })
})
