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
 * src/app/(admin)/metricas/page.tsx). UI llevada al rediseño "Canchas
 * primero" del 2026-09-26 (AnaliticasView.tsx): el `<h1>Métricas` quedó
 * `sr-only`, arriba va el board del mes (MonthBoard) y "Últimos 30 días"
 * (MetricsDashboard, cliente) quedó solo con horarios más pedidos y
 * ausencias — los gráficos (Reservas por día, Ingresos con toggle
 * Día/Semana/Mes, Top 5 horarios, Tasa de ausencias) se sacaron de la UI,
 * aunque `getTenantMetrics` sigue calculando esos mismos campos para el
 * chequeo de API de abajo.
 * Rol: Admin — el panel "Estado del sistema" está reservado únicamente para SuperAdmin
 * de plataforma (`resolveSystemAdmin`, `analiticas/page.tsx`), por lo que un admin estándar no lo ve.
 * NOTA: `GET /api/admin/metrics` usa `withRole('admin')` desde 2026-09-19 (antes
 * `withAnyRole(['admin','manager'])`): las métricas del negocio son solo del dueño
 * (`tests/integration/admin-metrics-route-guard.test.ts` cubre el 403 del encargado).
 * Prereq: actividad en los últimos 30 días — se siembra acá mismo (1 booking
 * `completed` + 1 cash_flow `income` con fecha/hora de HOY en ART) para no
 * depender de residuos de otros specs de la corrida QA.
 * Evidence anchors: src/app/(admin)/analiticas/page.tsx,
 *   src/app/(admin)/analiticas/AnaliticasView.tsx,
 *   src/app/(admin)/analiticas/MetricsDashboard.tsx,
 *   src/app/api/admin/metrics/route.ts,
 *   src/modules/metrics/metrics.service.ts.
 */

/** Today in ART (Argentina = UTC-3, sin DST) — mismo cálculo que artTodayStr() en metrics.service.ts. */
function artTodayIso(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

test.describe('TG-HP-221 — Métricas admin (negocio + sistema)', () => {
  test('admin ve el board del mes + últimos 30 días + panel de sistema, con actividad sembrada del día', async ({
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

      // ── UI: board del mes (/analiticas, destino real de /metricas). El
      // `<h1>Métricas` quedó `sr-only` en el rediseño "Canchas primero"
      // (2026-09-26) — el título visible en contenido es el `<h2>` del mes.
      await page.goto('/analiticas')
      await expect(page.getByRole('heading', { name: /^Entró en/ })).toBeVisible({
        timeout: 15_000,
      })

      // Esperar a que resuelva el primer fetch de "Últimos 30 días" (spinner →
      // contenido real, no el banner de error): horarios más pedidos y ausencias.
      await expect(page.getByRole('heading', { name: 'Últimos 30 días' })).toBeVisible({
        timeout: 20_000,
      })
      await expect(page.getByRole('heading', { name: 'Horarios más pedidos' })).toBeVisible()

      // Ausencias — nuestro booking `completed` cuenta como turno terminado.
      await expect(page.getByRole('heading', { name: 'Ausencias' })).toBeVisible()
      await expect(page.getByText(/% · \d+ de \d+ turnos terminados/)).toBeVisible()

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
          'Sesión admin: ve negocio + Estado del sistema. El encargado ya no accede: ' +
          "withRole('admin') en route.ts, cubierto por admin-metrics-route-guard.test.ts.",
      })
    } finally {
      await context.close()
      await supabase.from('cash_flows').delete().eq('id', cashflowId)
      await supabase.from('bookings').delete().eq('id', bookingId)
    }
  })
})
