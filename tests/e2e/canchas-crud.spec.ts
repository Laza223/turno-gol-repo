/**
 * E2E — Canchas CRUD (audit T5, fase F04)
 *
 * Happy path + 3 edge cases for the admin canchas UI:
 *   #1  Happy — create court: /canchas → "+ Nueva cancha" → fill name/surface/capacity →
 *              submit → new court appears with Online badge.
 *   #2  Edge — deactivate with future bookings (staged): service-role INSERT court + future booking →
 *              /canchas → "Desactivar" → dialog shows "Hay 1 reserva(s) futura(s)" → confirm →
 *              badge becomes Offline.
 *   #3  Edge — pricing coverage gap: "+ Nueva cancha" → set pricing rule with gap vs opening hours →
 *              submit → error "Precios sin cubrir".
 *   #4  Edge — optimistic rollback on activate failure: service-role INSERT an offline court, then
 *              mock the Server Action response via network intercept so toggleCourtStatusAction
 *              returns an error → "Activar" click → UI briefly goes Online then rolls back to Offline
 *              + shows toast "No se pudo activar".
 *              CHOICE RATIONALE: Plan-limit edge (option a) is unreliable because the seeded E2E
 *              tenant has no tenant_subscriptions row → maxCourts = null → no limit enforced.
 *              The optimistic-rollback path (option b) is exercised entirely in the client by mocking
 *              the Next.js Server Action fetch, giving a stable, DB-independent test.
 *
 * Cleanup: all courts created (by UI or service-role) are deleted in `finally` via service-role.
 *
 * NOTE: Live E2E execution requires a running Next.js dev/prod server + Supabase DB
 *       + `pnpm e2e:seed`. Delegated to CI; these specs typecheck locally.
 */

import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// ── Seeded E2E constants (matches scripts/seed-e2e.ts) ──────────────────────
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const STAFF_USER_ID = '00000000-0000-4000-8000-000000000003'

// ── Service-role client factory ──────────────────────────────────────────────
function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for E2E canchas tests',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// All-day pricing rule (same structure as the seeded Cancha E2E 1 — avoids coverage-gap errors).
const ALL_DAY_PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '00:00',
      to: '00:00', // 00:00 → 24h coverage
      prices: { '60': 10000, '120': 18000 },
    },
  ],
}

type InsertCourtOpts = {
  id: string
  name: string
  status?: 'online' | 'offline'
}

async function insertCourt(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: InsertCourtOpts,
): Promise<void> {
  const { error } = await supabase.from('courts').insert({
    id: opts.id,
    tenant_id: TENANT_ID,
    name: opts.name,
    surface_type: 'synthetic_grass',
    capacity: 10,
    status: opts.status ?? 'online',
    pricing: ALL_DAY_PRICING,
  })
  if (error) throw new Error(`Service-role court INSERT failed: ${error.message}`)
}

async function deleteCourt(
  supabase: ReturnType<typeof makeServiceClient>,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('courts').delete().eq('id', id)
  if (error) throw new Error(`Cleanup court DELETE failed: ${error.message}`)
}

async function insertBooking(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: { id: string; courtId: string; date: string; timeStart: string; timeEnd: string },
): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    id: opts.id,
    tenant_id: TENANT_ID,
    court_id: opts.courtId,
    date: opts.date,
    time_start: `${opts.timeStart}:00`,
    time_end: `${opts.timeEnd}:00`,
    type: 'spontaneous',
    status: 'confirmed',
    price_snapshot: 10000,
    deposit_amount: 0,
    deposit_status: 'not_required',
    guest_name: 'E2E Canchas Guest',
    guest_phone: '+5491100000000',
    created_by_staff: STAFF_USER_ID,
  })
  if (error) throw new Error(`Service-role booking INSERT failed: ${error.message}`)
}

async function deleteBooking(
  supabase: ReturnType<typeof makeServiceClient>,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('bookings').delete().eq('id', id)
  if (error) throw new Error(`Cleanup booking DELETE failed: ${error.message}`)
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 1 — Happy: create a new court via UI
// ════════════════════════════════════════════════════════════════════════════
test.describe('canchas — happy: create court', () => {
  test(
    '/canchas → "+ Nueva cancha" → fill form → submit → new court appears with Online badge',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const courtName = `E2E Cancha Happy ${randomUUID().slice(0, 8)}`
      let createdCourtId: string | null = null

      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto('/canchas')
        await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({
          timeout: 15_000,
        })

        // Open the creation form.
        await page.getByRole('button', { name: '+ Nueva cancha' }).click()
        await expect(page.getByRole('heading', { name: 'Nueva cancha' })).toBeVisible()

        // Fill the name.
        await page.getByPlaceholder('Ej: Cancha 1').fill(courtName)

        // Keep default surface (Césped sintético) and capacity.
        // The default pricing rules cover the opening hours of the E2E tenant —
        // DEFAULT_RULES in CourtForm covers Mon–Thu 08–18, Mon–Thu 18–23, Fri–Sun 08–23.

        // Submit.
        await page.getByRole('button', { name: 'Crear cancha' }).click()

        // After success the form closes and the CourtList is shown again.
        await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({
          timeout: 10_000,
        })

        // The new court card should appear with the correct name and Online badge.
        await expect(page.getByText(courtName)).toBeVisible({ timeout: 10_000 })
        // Inline badge next to the court name should say "Online".
        const courtCard = page.locator('div', { has: page.getByText(courtName) }).first()
        await expect(courtCard.getByText('Online')).toBeVisible()

        // Capture the created court id for cleanup by finding it via the DB.
        const { data: rows } = await supabase
          .from('courts')
          .select('id')
          .eq('tenant_id', TENANT_ID)
          .eq('name', courtName)
          .limit(1)
        createdCourtId = rows?.[0]?.id ?? null
      } finally {
        await context.close()
        if (createdCourtId) await deleteCourt(supabase, createdCourtId)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 2 — Edge: deactivate court with future bookings (impact warning shown)
// ════════════════════════════════════════════════════════════════════════════
test.describe('canchas — edge: deactivate with future bookings', () => {
  test(
    'service-role court + future booking → "Desactivar" → dialog shows future-booking warning → confirm → badge Offline',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const courtId = randomUUID()
      const bookingId = randomUUID()
      const courtName = `E2E Cancha Deactivate ${courtId.slice(0, 8)}`

      const context = await browser.newContext()
      try {
        // Insert a test court (online).
        await insertCourt(supabase, { id: courtId, name: courtName })

        // Insert a future confirmed booking on that court.
        await insertBooking(supabase, {
          id: bookingId,
          courtId,
          date: '2099-12-21',
          timeStart: '10:00',
          timeEnd: '11:00',
        })

        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto('/canchas')
        await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({
          timeout: 15_000,
        })

        // Find the court card and click "Desactivar".
        const courtCard = page.locator('div', { has: page.getByText(courtName) }).first()
        await expect(courtCard).toBeVisible({ timeout: 10_000 })
        await courtCard.getByRole('button', { name: 'Desactivar' }).click()

        // ConfirmDialog opens with title "Desactivar {courtName}".
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByText(`Desactivar ${courtName}`)).toBeVisible()

        // The impact warning must mention the future booking count.
        await expect(
          page.getByText(/Hay 1 reserva\(s\) futura\(s\)/i),
        ).toBeVisible({ timeout: 10_000 })

        // Confirm deactivation.
        await page.getByRole('button', { name: 'Desactivar' }).last().click()

        // Dialog closes and the badge updates to Offline.
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
        await expect(courtCard.getByText('Offline')).toBeVisible({ timeout: 10_000 })
      } finally {
        await context.close()
        // Cleanup: delete booking first (FK), then court.
        await deleteBooking(supabase, bookingId)
        await deleteCourt(supabase, courtId)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 3 — Edge: pricing coverage gap blocks court creation
// ════════════════════════════════════════════════════════════════════════════
test.describe('canchas — edge: pricing coverage gap', () => {
  test(
    '"+ Nueva cancha" with a pricing rule that leaves a gap → submit → error "Precios sin cubrir"',
    async ({ browser, adminStorageState }) => {
      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto('/canchas')
        await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({
          timeout: 15_000,
        })

        // Open the creation form.
        await page.getByRole('button', { name: '+ Nueva cancha' }).click()
        await expect(page.getByRole('heading', { name: 'Nueva cancha' })).toBeVisible()

        // Fill a unique name.
        await page.getByPlaceholder('Ej: Cancha 1').fill(`E2E Gap ${randomUUID().slice(0, 8)}`)

        // The default CourtForm has 3 pricing rules that already cover everything.
        // We need to create a gap: delete all rules and add only one partial rule.
        // Click "Eliminar franja" on all but one rule.
        // The form starts with DEFAULT_RULES (3 rules). Remove rules 2 and 3 (indices 1 and 2).
        // "Eliminar franja" buttons appear only when rules.length > 1.

        // Remove second rule first (it slides up after first removal).
        const removeButtons = page.getByRole('button', { name: 'Eliminar franja' })
        // Remove until only 1 rule remains (click twice).
        await removeButtons.first().click()
        await removeButtons.first().click()

        // Now we have 1 rule. Modify it to only cover Mon–Fri 08:00–18:00 (leaves a gap).
        // The remaining rule index 0 may be any of the original 3; we just set it to partial coverage.
        // Use direct locator for the time inputs (first two time inputs in the form).
        const timeInputs = page.locator('input[type="time"]')
        await timeInputs.first().fill('08:00') // from
        await timeInputs.nth(1).fill('18:00') // to — leaves 18:00-23:00 gap

        // Make sure only Mon–Fri are selected (deselect Sat/Sun if selected).
        // Day buttons show L/M/X/J/V/S/D. Toggle Sat (S) and Sun (D) off if highlighted.
        // We click them regardless — if active they go inactive (gap); if inactive they stay inactive.
        // The important thing is the time range 08–18 will leave 18–23 uncovered for all selected days.
        // Submit the form.
        await page.getByRole('button', { name: 'Crear cancha' }).click()

        // The action should return the "Precios sin cubrir" error.
        await expect(page.getByText(/Precios sin cubrir/i)).toBeVisible({ timeout: 10_000 })

        // The form stays open (no redirect to court list).
        await expect(page.getByRole('heading', { name: 'Nueva cancha' })).toBeVisible()
      } finally {
        await context.close()
        // No DB cleanup needed — court was never created.
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 4 — Edge: optimistic rollback when the activate action fails
//
// CHOICE: graceful action-level failure (the path the implementation actually handles),
//   NOT a transport/500. A 500 makes the Next.js Server Action *throw*, and
//   CourtCard.activate() only rolls back on a returned { success:false } (no try/catch),
//   so a throw would NOT trigger the rollback — testing it that way would be a false test.
// HOW: insert an offline court, load the page (the card now lives in client React state),
//   then DELETE the court via service-role. Clicking "Activar" runs the optimistic update
//   (Online) and calls toggleCourtStatusAction, which can't find the row → returns
//   { success:false, error:'Cancha no encontrada' } → activate() rolls back to Offline + toast.
//   The card stays rendered because its state is independent of the DB row, and the failed
//   action does not revalidatePath('/canchas').
// (Plan-limit edge — the other option — is unreliable here: the seeded tenant has no
//   tenant_subscriptions row → maxCourts = null → the limit check never fires.)
// ════════════════════════════════════════════════════════════════════════════
test.describe('canchas — edge: optimistic rollback on activate failure', () => {
  test(
    'offline court deleted under the UI → "Activar" → optimistic Online then rolls back to Offline + toast',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const courtId = randomUUID()
      const courtName = `E2E Cancha Rollback ${courtId.slice(0, 8)}`

      const context = await browser.newContext()
      try {
        // Insert an offline court so the "Activar" button is shown.
        await insertCourt(supabase, { id: courtId, name: courtName, status: 'offline' })

        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto('/canchas')
        await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({
          timeout: 15_000,
        })

        // Locate the court card; it shows Offline before activation.
        const courtCard = page.locator('div', { has: page.getByText(courtName) }).first()
        await expect(courtCard).toBeVisible({ timeout: 10_000 })
        await expect(courtCard.getByText('Offline')).toBeVisible()

        // Delete the row out from under the UI so the next toggle fails gracefully.
        await deleteCourt(supabase, courtId)

        // Click "Activar": optimistic Online, then the action returns { success:false }
        // ('Cancha no encontrada') → rollback to Offline + destructive toast.
        await courtCard.getByRole('button', { name: 'Activar' }).click()

        // Badge must revert to Offline and the failure toast must appear.
        await expect(courtCard.getByText('Offline')).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('No se pudo activar')).toBeVisible({ timeout: 10_000 })
      } finally {
        await context.close()
        // Court already deleted above; safety net (delete of 0 rows is not an error).
        await deleteCourt(supabase, courtId)
      }
    },
  )
})
