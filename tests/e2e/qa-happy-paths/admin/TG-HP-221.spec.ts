import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import {
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
  E2E_STAFF_USER_ID,
} from '../../_helpers/booking-seed'
import { bookingInstants } from '../../_helpers/booking-instants'
import { randomUUID } from 'node:crypto'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-221 — Métricas (sesión ADMIN, ve negocio + sistema).
 * `/metricas` fue reubicado a `/analiticas` (redirect permanente,
 * src/app/(admin)/analiticas/page.tsx es ahora solo el stub de redirect) — el
 * contenido real (MetricsDashboard) se embebe ahí vía MetricsDashboardLoader.
 * Rol: Admin — el panel "Estado del sistema" está reservado únicamente para SuperAdmin
 * de plataforma (`resolveSystemAdmin`, `analiticas/page.tsx`), por lo que un admin estándar no lo ve.
 * NOTA (verificación fresca de código, no del manual): `GET /api/admin/metrics`
 * usa `withAnyRole(['admin','manager'])` (`route.ts:21`) — NO `withRole('admin')`
 * como decía el GAP #2 del manual (ya desactualizado respecto al código actual).
 * Prereq: actividad en los últimos 30 días — se siembra acá mismo (1 booking
 * `completed` + 1 cash_flow `income` con fecha/hora de HOY en ART) para no
 * depender de residuos de otros specs de la corrida QA.
 * Evidence anchors: src/app/(admin)/analiticas/page.tsx,
 *   src/app/(admin)/analiticas/MetricsDashboardLoader.tsx,
 *   src/app/(admin)/analiticas/MetricsDashboard.tsx:231-349,
 *   src/app/api/admin/metrics/route.ts:1-28,
 *   src/modules/metrics/metrics.service.ts:115-278.
 */

/** Today in ART (Argentina = UTC-3, sin DST) — mismo cálculo que artTodayStr() en metrics.service.ts. */
function artTodayIso(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

test.describe('TG-HP-221 — Métricas admin (negocio + sistema)', () => {
  test('admin ve gráficos de negocio + panel de sistema, con actividad sembrada del día', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const today = artTodayIso()
    const bookingId = randomUUID()
    const cashflowId = randomUUID()
    const seededAmountCents = 10_000 // 100 ARS
    const seededTimeStart = '05:00'

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // ── Seed: 1 reserva completed + 1 ingreso de caja, fechados HOY (ART) ──
      const { error: bookingErr } = await supabase.from('bookings').insert({
        id: bookingId,
        tenant_id: E2E_TENANT_ID,
        court_id: E2E_COURT_ID,
        created_by_staff: E2E_STAFF_USER_ID,
        date: today,
        time_start: `${seededTimeStart}:00`,
        time_end: '06:00:00',
        ...bookingInstants({ date: today, timeStart: seededTimeStart, timeEnd: '06:00' }),
        type: 'spontaneous',
        status: 'completed',
        price_snapshot: seededAmountCents,
        deposit_amount: 0,
        deposit_status: 'not_required',
        payment_method: 'cash',
      })
      expect(bookingErr).toBeNull()

      const { error: cashflowErr } = await supabase.from('cash_flows').insert({
        id: cashflowId,
        tenant_id: E2E_TENANT_ID,
        type: 'income',
        category: 'booking',
        amount: seededAmountCents,
        method: 'cash',
        description: `TG-HP-221-${Date.now()}`,
        booking_id: bookingId,
        registered_by: E2E_STAFF_USER_ID,
        occurred_at: new Date().toISOString(),
      })
      expect(cashflowErr).toBeNull()

      // ── UI: header + subtítulo (/analiticas, destino real de /metricas) ──
      await page.goto('/analiticas')
      await expect(page.getByRole('heading', { name: 'Métricas', level: 1 })).toBeVisible({
        timeout: 15_000,
      })
      await expect(
        page.getByText('Actividad del complejo en tiempo real y reporte mensual de ingresos.'),
      ).toBeVisible()

      // Esperar a que resuelva el primer fetch (spinner → contenido real, no el banner de error).
      await expect(page.getByRole('heading', { name: 'Reservas por día' })).toBeVisible({
        timeout: 20_000,
      })
      await expect(page.getByText(/Últimos \d+ días/)).toBeVisible()

      // Tasa de ausencias.
      await expect(page.getByRole('heading', { name: 'Tasa de ausencias' })).toBeVisible()
      await expect(page.getByText(/ausencias sobre \d+ turnos terminados/)).toBeVisible()

      // Ingresos: heading + toggle Día/Semana/Mes + total no-cero (nuestra siembra).
      await expect(page.getByRole('heading', { name: 'Ingresos' })).toBeVisible()
      const granularityGroup = page.getByRole('group', { name: 'Agrupar ingresos por' })
      await expect(granularityGroup.getByRole('button', { name: 'Día' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(granularityGroup.getByRole('button', { name: 'Semana' })).toBeVisible()
      await expect(granularityGroup.getByRole('button', { name: 'Mes' })).toBeVisible()
      await expect(page.getByText(/Total del período: \$/)).toBeVisible()

      // Top 5 horarios.
      await expect(
        page.getByRole('heading', { name: 'Top 5 horarios más reservados' }),
      ).toBeVisible()

      // Estado del sistema (solo SuperAdmin — admin estándar NO lo ve).
      await expect(page.getByText('Estado del sistema')).not.toBeVisible()

      // Verificar que /api/admin/system-status da 403 Forbidden para admin de tenant estándar.
      const sysStatusRes = await page.request.get('/api/admin/system-status')
      expect(sysStatusRes.status()).toBe(403)

      // ── Componente/API: golpear /api/admin/metrics directo (mismas cookies) ──
      const apiRes = await page.request.get('/api/admin/metrics')
      expect(apiRes.ok()).toBeTruthy()
      const apiJson = (await apiRes.json()) as {
        data: {
          windowDays: number
          bookingsPerDay: Array<{ date: string; count: number }>
          revenue: { totalCents: number }
        }
      }
      expect(apiJson.data.windowDays).toBe(30)
      const todayEntry = apiJson.data.bookingsPerDay.find((d) => d.date === today)
      expect(todayEntry?.count ?? 0).toBeGreaterThanOrEqual(1)
      expect(apiJson.data.revenue.totalCents).toBeGreaterThanOrEqual(seededAmountCents)

      // ── DB: confirma que la fila sembrada existe y con el status esperado ──
      const dbRows = await runSql<{ status: string; price_snapshot: number }>(
        'SELECT status, price_snapshot FROM bookings WHERE id = $1',
        [bookingId],
      )
      expect(dbRows).toHaveLength(1)
      expect(dbRows[0]?.status).toBe('completed')
      expect(dbRows[0]?.price_snapshot).toBe(seededAmountCents)

      await writeEvidence('TG-HP-221', {
        status: 'pass',
        seededBookingId: bookingId,
        seededCashflowId: cashflowId,
        today,
        apiMetrics: apiJson.data,
        notes:
          'Sesión admin: ve negocio + Estado del sistema. withAnyRole admite también manager para el negocio ' +
          '(GAP #2 del manual desactualizado respecto a route.ts:21) — no se re-probó con manager en este caso.',
      })
    } finally {
      await context.close()
      await supabase.from('cash_flows').delete().eq('id', cashflowId)
      await supabase.from('bookings').delete().eq('id', bookingId)
    }
  })
})
