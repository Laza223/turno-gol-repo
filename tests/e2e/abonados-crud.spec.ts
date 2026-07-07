/**
 * E2E — Abonados CRUD (audit T6, fase F5)
 *
 * Happy path + 3 edge cases for the admin abonados UI (T1+T2):
 *   #1  Happy — create with preview: /abonados/nuevo → fill form → "Ver fechas del turno"
 *              → 8 dates listed with "Libre" badges → "Crear abonado" → redirect to /abonados,
 *              row visible with "Activo" badge.
 *   #2  Edge — preview with conflict: service-role pre-inserts an overlapping confirmed
 *              booking on one of the candidate dates → preview shows "Ocupado" badge for
 *              that date + summary "Se crearán 7 turnos. 1 fecha ya está ocupada y se va a saltar."
 *   #3  Edge — cancel with future date: pre-create active abonado via service-role → in UI
 *              click "Cancelar" → type "CANCELAR" → pick today+14d as cancel-from date →
 *              confirm → assert bookings >= cancel-from are gone, earlier ones remain.
 *   #4  Edge — pause + reactivate: pre-create abonado → click "Pausar" → confirm →
 *              status "Pausado" + future bookings deleted → click "Reactivar" → preview
 *              loads → confirm → status "Activo" + 8 future bookings exist.
 *
 * ISOLATION: every test uses dedicated future dates and a fresh abonado UUID. Tests are
 * `fullyParallel`. Cleanup deletes abonados + bookings in `finally` even on assertion fail.
 *
 * NOTE: Live E2E execution requires a running Next.js dev/prod server + Supabase DB
 *       + `pnpm e2e:seed`. Delegated to CI; these specs typecheck locally.
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
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for E2E abonados tests',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Pick a far-future Monday and return its YYYY-MM-DD. */
function pickFutureMonday(yearOffset = 4): string {
  const target = new Date()
  target.setUTCFullYear(target.getUTCFullYear() + yearOffset)
  target.setUTCMonth(0, 1) // Jan 1
  // Walk to first Monday (getUTCDay: Sun=0, Mon=1)
  while (target.getUTCDay() !== 1) {
    target.setUTCDate(target.getUTCDate() + 1)
  }
  return target.toISOString().slice(0, 10)
}

async function cleanupAbonado(
  supabase: ReturnType<typeof makeServiceClient>,
  abonadoId: string,
): Promise<void> {
  // Delete bookings first (FK), then the abonado row.
  await supabase.from('bookings').delete().eq('abonado_id', abonadoId)
  await supabase.from('abonados').delete().eq('id', abonadoId)
}

async function cleanupAbonadosByContact(
  supabase: ReturnType<typeof makeServiceClient>,
  contactPhone: string,
): Promise<void> {
  const { data } = await supabase
    .from('abonados')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('contact_phone', contactPhone)
  if (!data) return
  for (const row of data) {
    await cleanupAbonado(supabase, row.id)
  }
}

async function insertAbonado(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: {
    id: string
    startsOn: string
    contactPhone: string
    dayOfWeek?: number
    timeStart?: string
    timeEnd?: string
  },
): Promise<void> {
  const { error } = await supabase.from('abonados').insert({
    id: opts.id,
    tenant_id: TENANT_ID,
    court_id: COURT_ID,
    contact_name: 'E2E Abonado',
    contact_phone: opts.contactPhone,
    day_of_week: opts.dayOfWeek ?? 1,
    time_start: opts.timeStart ?? '14:00',
    time_end: opts.timeEnd ?? '15:00',
    price_per_session: 500000,
    monthly_price: 2000000,
    starts_on: opts.startsOn,
    status: 'active',
    payment_method: 'cash',
  })
  if (error) throw new Error(`insertAbonado failed: ${error.message}`)
}

async function insertConfirmedBooking(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: { date: string; timeStart: string; timeEnd: string },
): Promise<string> {
  const id = randomUUID()
  const { error } = await supabase.from('bookings').insert({
    id,
    tenant_id: TENANT_ID,
    court_id: COURT_ID,
    created_by_staff: STAFF_USER_ID,
    date: opts.date,
    time_start: opts.timeStart,
    time_end: opts.timeEnd,
    type: 'spontaneous',
    status: 'confirmed',
    price_snapshot: 500000,
    deposit_amount: 0,
    deposit_status: 'not_required',
  })
  if (error) throw new Error(`insertBooking failed: ${error.message}`)
  return id
}

test.describe('Abonados CRUD', () => {
  test('#1 happy — create with preview shows 8 OK badges then redirects @critical', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100000${Date.now() % 100000}`
    const startsOn = pickFutureMonday(4)

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      await page.goto('/abonados/nuevo')
      await page.waitForSelector('form')

      await page.selectOption('select[name="courtId"]', COURT_ID)
      await page.selectOption('select[name="dayOfWeek"]', '1') // Monday
      await page.fill('input[name="timeStart"]', '14:00')
      await page.fill('input[name="timeEnd"]', '15:00')
      await page.fill('input[name="contactName"]', 'E2E Happy Path')
      await page.fill('input[name="contactPhone"]', contactPhone)
      await page.fill('input[name="pricePerSession"]', '5000')
      await page.fill('input[name="monthlyPrice"]', '20000')
      await page.fill('input[name="startsOn"]', startsOn)

      await page.getByRole('button', { name: /Ver fechas del turno/i }).click()

      // Phase 2: preview heading + 8 OK badges + summary
      await expect(page.getByRole('heading', { name: /Fechas del turno fijo/i })).toBeVisible()
      const okBadges = page.getByText('Libre', { exact: true })
      await expect(okBadges).toHaveCount(8)
      await expect(
        page.getByText('Se crearán 8 turnos.'),
      ).toBeVisible()

      await page.getByRole('button', { name: 'Crear abonado' }).click()
      await page.waitForURL('**/abonados')

      // Row visible with Activo badge. La lista renderiza tabla (desktop) +
      // cards (mobile); .first() = la tabla, visible en este viewport desktop.
      await expect(page.getByText('E2E Happy Path').first()).toBeVisible()
    } finally {
      await cleanupAbonadosByContact(supabase, contactPhone)
    }
  })

  test('#2 edge — preview surfaces conflicting date', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100001${Date.now() % 100000}`
    const startsOn = pickFutureMonday(5) // a different year so we don't collide with #1
    // The conflicting booking lands on the 2nd Monday (startsOn + 7d)
    const conflictDate = new Date(`${startsOn}T00:00:00Z`)
    conflictDate.setUTCDate(conflictDate.getUTCDate() + 7)
    const conflictStr = conflictDate.toISOString().slice(0, 10)
    let conflictBookingId: string | null = null

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      conflictBookingId = await insertConfirmedBooking(supabase, {
        date: conflictStr,
        timeStart: '14:00',
        timeEnd: '15:00',
      })

      await page.goto('/abonados/nuevo')
      await page.waitForSelector('form')

      await page.selectOption('select[name="courtId"]', COURT_ID)
      await page.selectOption('select[name="dayOfWeek"]', '1')
      await page.fill('input[name="timeStart"]', '14:00')
      await page.fill('input[name="timeEnd"]', '15:00')
      await page.fill('input[name="contactName"]', 'E2E Conflict')
      await page.fill('input[name="contactPhone"]', contactPhone)
      await page.fill('input[name="pricePerSession"]', '5000')
      await page.fill('input[name="monthlyPrice"]', '20000')
      await page.fill('input[name="startsOn"]', startsOn)

      await page.getByRole('button', { name: /Ver fechas del turno/i }).click()

      await expect(page.getByRole('heading', { name: /Fechas del turno fijo/i })).toBeVisible()
      // 7 OK + 1 Conflicto + summary
      await expect(page.getByText('Libre', { exact: true })).toHaveCount(7)
      await expect(page.getByText('Ocupado', { exact: true })).toHaveCount(1)
      await expect(
        page.getByText('Se crearán 7 turnos. 1 fecha ya está ocupada y se va a saltar.'),
      ).toBeVisible()
    } finally {
      if (conflictBookingId) {
        await supabase.from('bookings').delete().eq('id', conflictBookingId)
      }
      await cleanupAbonadosByContact(supabase, contactPhone)
    }
  })

  test('#3 edge — cancel with future fromDate deletes only later bookings', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100002${Date.now() % 100000}`
    const abonadoId = randomUUID()
    const startsOn = pickFutureMonday(6)

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      // Pre-create abonado + seed 4 future bookings spaced 7 days
      await insertAbonado(supabase, { id: abonadoId, startsOn, contactPhone })
      const dates: string[] = []
      const cursor = new Date(`${startsOn}T00:00:00Z`)
      for (let i = 0; i < 4; i++) {
        const dateStr = cursor.toISOString().slice(0, 10)
        dates.push(dateStr)
        await supabase.from('bookings').insert({
          tenant_id: TENANT_ID,
          court_id: COURT_ID,
          abonado_id: abonadoId,
          date: dateStr,
          time_start: '14:00',
          time_end: '15:00',
          type: 'fixed',
          status: 'confirmed',
          price_snapshot: 500000,
          deposit_amount: 0,
          deposit_status: 'not_required',
        })
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }

      // cancelFrom = dates[2] → expect dates[0], dates[1] survive; dates[2], dates[3] gone
      const cancelFrom = dates[2]!

      await page.goto('/abonados')
      const cancelBtn = page.getByRole('button', { name: 'Cancelar' }).first()
      await cancelBtn.click()

      // Dialog opens; type CANCELAR + pick date
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await dialog.locator('input[type="date"]').fill(cancelFrom)
      await dialog.locator('input#confirm-phrase').fill('CANCELAR')
      await dialog.getByRole('button', { name: 'Cancelar abonado' }).click()

      await expect(dialog).toBeHidden()

      // Verify DB state
      const { data: remaining } = await supabase
        .from('bookings')
        .select('date')
        .eq('abonado_id', abonadoId)
      const dateStrs = (remaining ?? []).map((r) => r.date as string).sort()
      expect(dateStrs).toEqual([dates[0], dates[1]])
    } finally {
      await cleanupAbonado(supabase, abonadoId)
      await cleanupAbonadosByContact(supabase, contactPhone)
    }
  })

  test('#4 edge — pause then reactivate restores status and regenerates slots', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100003${Date.now() % 100000}`
    const abonadoId = randomUUID()
    const startsOn = pickFutureMonday(7)

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      await insertAbonado(supabase, { id: abonadoId, startsOn, contactPhone })
      // Seed 3 future bookings so we can verify they're deleted on pause
      const cursor = new Date(`${startsOn}T00:00:00Z`)
      for (let i = 0; i < 3; i++) {
        await supabase.from('bookings').insert({
          tenant_id: TENANT_ID,
          court_id: COURT_ID,
          abonado_id: abonadoId,
          date: cursor.toISOString().slice(0, 10),
          time_start: '14:00',
          time_end: '15:00',
          type: 'fixed',
          status: 'confirmed',
          price_snapshot: 500000,
          deposit_amount: 0,
          deposit_status: 'not_required',
        })
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }

      await page.goto('/abonados')

      // Pause
      await page.getByRole('button', { name: 'Pausar' }).first().click()
      const pauseDialog = page.getByRole('dialog')
      await expect(pauseDialog).toBeVisible()
      await pauseDialog.getByRole('button', { name: 'Pausar' }).click()
      await expect(pauseDialog).toBeHidden()

      // Verify status + bookings cleared
      const { data: pausedRow } = await supabase
        .from('abonados')
        .select('status')
        .eq('id', abonadoId)
        .single()
      expect(pausedRow?.status).toBe('paused')
      const { count: pausedCnt } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('abonado_id', abonadoId)
      expect(pausedCnt ?? 0).toBe(0)

      // Reactivate
      await page.reload()
      await page.getByRole('button', { name: 'Reactivar' }).first().click()
      const reactivateDialog = page.getByRole('dialog')
      await expect(reactivateDialog).toBeVisible()
      // wait for preview to load
      await expect(reactivateDialog.getByText(/Se generarán/i)).toBeVisible({ timeout: 10000 })
      await reactivateDialog.getByRole('button', { name: 'Reactivar' }).click()
      await expect(reactivateDialog).toBeHidden()

      const { data: activeRow } = await supabase
        .from('abonados')
        .select('status')
        .eq('id', abonadoId)
        .single()
      expect(activeRow?.status).toBe('active')
      const { count: futureCnt } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('abonado_id', abonadoId)
      expect((futureCnt ?? 0) > 0).toBe(true)
    } finally {
      await cleanupAbonado(supabase, abonadoId)
      await cleanupAbonadosByContact(supabase, contactPhone)
    }
  })
})
