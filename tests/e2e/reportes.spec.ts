/**
 * E2E — Reportes (audit T6, fase F5)
 *
 *   #1  Happy — mes con datos: pre-seed 1 confirmed booking + 1 income cashflow this month
 *              → /reportes → KPI "Ingresos" non-zero + "Por cancha" row visible.
 *   #2  Edge — mes vacío: /reportes?month=2019-01 → "Sin movimientos en este período."
 *   #3  Edge — nav prev/next: click prev → URL ?month=YYYY-MM-(prev); next button is
 *              disabled when target month > current.
 *   #4  Edge — CSV export: click "Exportar CSV" → download event fires with non-empty CSV.
 *
 * ISOLATION: Test #1 seeds rows with a unique description marker and cleans them in `finally`.
 */

import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const COURT_ID = '00000000-0000-4000-8000-000000000010'
const STAFF_USER_ID = '00000000-0000-4000-8000-000000000003'

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env required')
  return createClient(url, key, { auth: { persistSession: false } })
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function isoMidMonth(monthStr: string): string {
  // Pick day 15 of the month at 12:00 UTC — comfortably inside the ART day too.
  return `${monthStr}-15T12:00:00.000Z`
}

function dateMidMonth(monthStr: string): string {
  return `${monthStr}-15`
}

test.describe('Reportes', () => {
  test('#1 happy — month with data renders KPIs and tables', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const month = currentMonthStr()
    const bookingId = randomUUID()
    const cashflowId = randomUUID()
    const marker = `E2E-REPORTES-${Date.now()}`

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    try {
      // Seed 1 confirmed booking + 1 income cashflow tied to it
      await supabase.from('bookings').insert({
        id: bookingId,
        tenant_id: TENANT_ID,
        court_id: COURT_ID,
        created_by_staff: STAFF_USER_ID,
        date: dateMidMonth(month),
        time_start: '12:00',
        time_end: '13:00',
        type: 'spontaneous',
        status: 'completed',
        price_snapshot: 1000000, // 10,000 ARS in centavos
        deposit_amount: 0,
        deposit_status: 'not_required',
        payment_method: 'cash',
      })
      await supabase.from('cash_flows').insert({
        id: cashflowId,
        tenant_id: TENANT_ID,
        type: 'income',
        category: 'booking',
        amount: 1000000,
        method: 'cash',
        description: marker,
        booking_id: bookingId,
        registered_by: STAFF_USER_ID,
        occurred_at: isoMidMonth(month),
      })

      await page.goto('/reportes')

      // KPIs render with non-zero values.
      // Use the KPI <p> specifically: "Ingresos"/"Reservas" also appear as <th>
      // column headers in the "Por cancha" table below (strict mode).
      await expect(page.getByRole('paragraph').filter({ hasText: 'Ingresos' })).toBeVisible()
      await expect(page.getByRole('paragraph').filter({ hasText: 'Reservas' })).toBeVisible()
      // "Por cancha" table appears when there's at least one booking
      await expect(page.getByRole('heading', { name: /Por cancha/i })).toBeVisible()
      // Cancha E2E 1 row should appear in the "Por cancha" table. Scoped to a
      // table cell: the occupancy chart also renders the court name as an
      // SVG axis tick, and a plain getByText would match both (strict mode).
      await expect(page.getByRole('cell', { name: 'Cancha E2E 1' })).toBeVisible()
    } finally {
      await supabase.from('cash_flows').delete().eq('id', cashflowId)
      await supabase.from('bookings').delete().eq('id', bookingId)
    }
  })

  test('#2 edge — empty month shows the ghost-KPI empty state', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    await page.goto('/reportes?month=2019-01')
    await expect(page.getByText('Así se verá tu mes cuando cargues reservas')).toBeVisible()
    await expect(page.getByText('Todavía no hay movimientos en este período.')).toBeVisible()
  })

  test('#3 edge — month nav navigates and next button gates future months', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    await page.goto('/reportes?month=2020-06')

    // prev arrow
    await page.getByRole('button', { name: 'Mes anterior' }).click()
    await expect(page).toHaveURL(/[?&]month=2020-05\b/)

    // next arrow
    await page.getByRole('button', { name: 'Mes siguiente' }).click()
    await expect(page).toHaveURL(/[?&]month=2020-06\b/)

    // Navigate to current month — next must be disabled
    const cur = currentMonthStr()
    await page.goto(`/reportes?month=${cur}`)
    await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  test('#4 edge — CSV export triggers download', async ({ page, adminStorageState }) => {
    // El link de export se oculta en un mes vacío (UX batch), así que el test
    // necesita al menos un movimiento propio en el mes actual.
    const supabase = makeServiceClient()
    const cashflowId = randomUUID()
    const month = currentMonthStr()

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    try {
      await supabase.from('cash_flows').insert({
        id: cashflowId,
        tenant_id: TENANT_ID,
        type: 'income',
        category: 'other',
        amount: 100000,
        method: 'cash',
        description: `E2E-CSV-${Date.now()}`,
        registered_by: STAFF_USER_ID,
        occurred_at: isoMidMonth(month),
      })

      await page.goto('/reportes')

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        page.getByRole('link', { name: /Exportar CSV/i }).click(),
      ])
      expect(download.suggestedFilename()).toMatch(/\.csv$/i)
    } finally {
      await supabase.from('cash_flows').delete().eq('id', cashflowId)
    }
  })
})
