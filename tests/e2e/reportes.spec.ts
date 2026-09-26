/**
 * E2E — Reportes (audit T6, fase F5; UI llevada al rediseño "Canchas primero"
 * del 2026-09-26 — ver AnaliticasView.tsx / MonthBoard.tsx / MonthStepper.tsx)
 *
 *   #1  Happy — mes con datos: pre-seed 1 confirmed booking + 1 income cashflow this month
 *              → /analiticas → el monto entrado se muestra y la cancha sembrada aparece
 *              en el listado "Canchas del mes".
 *   #2  Edge — mes vacío y ya pasado: /analiticas?month=2019-01 → "En enero no hubo cobros".
 *   #3  Edge — nav prev/next: "Mes anterior"/"Mes siguiente" son LINKS que cambian
 *              `?month=`; en el mes en curso "Mes siguiente" pasa a ser un
 *              `<button aria-disabled="true">` (no `disabled`).
 *   #4  Edge — CSV export: "Exportar CSV" es un `<button>` (fetch + blob), no un link
 *              con `href` — el download event sigue disparando igual.
 *
 * ISOLATION: Test #1 seeds rows with a unique description marker and cleans them in `finally`.
 */

import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { bookingInstants } from './_helpers/booking-instants'

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
  test('#1 happy — month with data renders the month board and its court', async ({
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
        // NOT NULL desde el refactor de instantes físicos (ver _helpers/booking-instants.ts).
        ...bookingInstants({ date: dateMidMonth(month), timeStart: '12:00', timeEnd: '13:00' }),
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

      await page.goto('/analiticas')

      // Con datos en el mes se renderiza el board (no el vacío): el `<h2>` de
      // arriba es "Entró en {mes}, hasta hoy" en el mes en curso.
      await expect(page.getByRole('heading', { name: /^Entró en/ })).toBeVisible()
      // "Por cancha" solo aparece con al menos una cancha con cobros, y la
      // cancha sembrada figura en el listado ordenado por plata.
      await expect(page.getByRole('heading', { name: /Por cancha/i })).toBeVisible()
      await expect(
        page.getByRole('list', { name: 'Canchas del mes' }).getByText('Cancha E2E 1'),
      ).toBeVisible()
    } finally {
      await supabase.from('cash_flows').delete().eq('id', cashflowId)
      await supabase.from('bookings').delete().eq('id', bookingId)
    }
  })

  test('#2 edge — empty month shows the honest empty state', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    await page.goto('/analiticas?month=2019-01')
    await expect(page.getByRole('heading', { name: 'En enero no hubo cobros' })).toBeVisible()
  })

  test('#3 edge — month nav navigates and next is gated at the current month', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    await page.goto('/analiticas?month=2020-06')

    // prev arrow (link)
    await page.getByRole('link', { name: 'Mes anterior' }).click()
    await expect(page).toHaveURL(/[?&]month=2020-05\b/)

    // next arrow (link: 2020-05 no es el mes en curso)
    await page.getByRole('link', { name: 'Mes siguiente' }).click()
    await expect(page).toHaveURL(/[?&]month=2020-06\b/)

    // Navegar al mes en curso — "Mes siguiente" pasa a ser un botón apagado,
    // no un link (aria-disabled, no `disabled`: ver MonthStepper.tsx).
    const cur = currentMonthStr()
    await page.goto(`/analiticas?month=${cur}`)
    await expect(page.getByRole('button', { name: 'Mes siguiente' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test('#4 edge — CSV export triggers download', async ({ page, adminStorageState }) => {
    // El botón de export se oculta en un mes vacío (UX batch), así que el test
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

      await page.goto('/analiticas')

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        page.getByRole('button', { name: /Exportar CSV/i }).click(),
      ])
      expect(download.suggestedFilename()).toMatch(/\.csv$/i)
    } finally {
      await supabase.from('cash_flows').delete().eq('id', cashflowId)
    }
  })
})
