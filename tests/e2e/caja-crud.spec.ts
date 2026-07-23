/**
 * E2E — Caja CRUD (audit T5, fase F04)
 *
 * Happy path + 3 edge cases for the admin caja UI:
 *   #1  Happy — register movement: /caja?date=TEST_DATE → "+ Agregar movimiento" → fill form → "Guardar"
 *              → row appears in table.
 *   #2  Edge — close day (type-to-confirm): "Cerrar caja" → confirm button disabled until typing "CERRAR" →
 *              type it → confirm → "Caja cerrada" badge shown.
 *   #3  Edge — closed-day guard: a pre-closed day hides the write actions (CajaActions returns null
 *              when isClosed) so neither a movement nor a second close can be issued from the UI.
 *              The server-side idempotency guard ("ya fue cerrada") is covered by the integration
 *              test daily-close-idempotency.
 *   #4  Edge — close with difference requires note: balance > 0, declared cash differs → note required →
 *              assert error without note, then fill note → success.
 *
 * ISOLATION STRATEGY: Each test uses its OWN dedicated past date (2019-03-10..14), far from today,
 * so they never collide with real data, with each other (fullyParallel), or with the pre-existing
 * daily-close-idempotency integration test (which uses today). Note: cash_flows has no `date`
 * column — the ART-local date of `occurred_at` defines the day; cleanup deletes by that UTC range.
 * Cleanup removes cash_flows + daily_cash_closes + daily_cash_opens for the test date in `finally`.
 *
 * #5 (Fase 5, migr. 049) — apertura de caja: "Abrir caja" (fondo 1000) → ingreso en efectivo →
 *              cerrar declarando el efectivo esperado exacto → CierreCard v2 ("el efectivo
 *              cuadró" + fila "Fondo inicial" en el <dl>).
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

// Use dedicated dates per test group — well in the past and unique to these specs.
// One date per test so fullyParallel workers never collide on the same day.
// TEST_DATE_MOVE: register-movement happy test.
const TEST_DATE_MOVE = '2019-03-10'
// TEST_DATE_CLOSE: close day (type-to-confirm) test.
const TEST_DATE_CLOSE = '2019-03-11'
// TEST_DATE_DIFF: close-with-difference test.
const TEST_DATE_DIFF = '2019-03-12'
// TEST_DATE_CLOSED: pre-closed-day guard test.
const TEST_DATE_CLOSED = '2019-03-13'
// TEST_DATE_OPEN: open-day (fondo inicial) → close-matches-expected test.
const TEST_DATE_OPEN = '2019-03-14'

// ── Service-role client factory ──────────────────────────────────────────────
function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for E2E caja tests',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// cash_flows has no `date` column — rows belong to the ART-local date of `occurred_at`
// (see cashflow.service.ts). The ART day D spans UTC [D 03:00, D+1 03:00).
function artDayUtcRange(date: string): { gte: string; lt: string } {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return {
    gte: `${date}T03:00:00.000Z`,
    lt: `${next.toISOString().slice(0, 10)}T03:00:00.000Z`,
  }
}

async function cleanupCajaDate(
  supabase: ReturnType<typeof makeServiceClient>,
  date: string,
): Promise<void> {
  // cash_flows: delete by occurred_at range (no `date` column). daily_cash_closes: has `date`.
  const { gte, lt } = artDayUtcRange(date)
  const { error: cfErr } = await supabase
    .from('cash_flows')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .gte('occurred_at', gte)
    .lt('occurred_at', lt)
  if (cfErr) throw new Error(`Cleanup cash_flows failed: ${cfErr.message}`)

  const { error: dcErr } = await supabase
    .from('daily_cash_closes')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('date', date)
  if (dcErr) throw new Error(`Cleanup daily_cash_closes failed: ${dcErr.message}`)

  // daily_cash_opens (migr. 049): harmless no-op for dates that never opened.
  const { error: doErr } = await supabase
    .from('daily_cash_opens')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('date', date)
  if (doErr) throw new Error(`Cleanup daily_cash_opens failed: ${doErr.message}`)
}

// Seed a cash_flow row directly so the balance is non-zero before close.
async function seedCashFlow(
  supabase: ReturnType<typeof makeServiceClient>,
  date: string,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('cash_flows').insert({
    id,
    tenant_id: TENANT_ID,
    type: 'income',
    category: 'other',
    method: 'cash',
    amount: 100000, // 1000 ARS
    description: 'E2E seed movement',
    // No `date` column — the ART-local date of occurred_at defines the day.
    // 10:00Z = 07:00 ART → ART-date === `date`.
    occurred_at: `${date}T10:00:00.000Z`,
    registered_by: STAFF_USER_ID, // FK to staff_users (NOT NULL)
  })
  if (error) throw new Error(`Service-role cash_flow INSERT failed: ${error.message}`)
}

// Seed a daily_cash_close to simulate an already-closed day.
async function seedDailyClose(
  supabase: ReturnType<typeof makeServiceClient>,
  date: string,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('daily_cash_closes').insert({
    id,
    tenant_id: TENANT_ID,
    date,
    total_income: 100000,
    total_adjustments: 0,
    balance: 100000,
    declared_cash: 100000, // NOT NULL (default 0) — pass an explicit value, never null
    diff_amount: 0, // real column is `diff_amount`, NOT `diff`; NOT NULL
    note: null,
    closed_by: STAFF_USER_ID,
    closed_at: `${date}T23:00:00.000Z`,
  })
  if (error) throw new Error(`Service-role daily_cash_closes INSERT failed: ${error.message}`)
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 1 — Happy: register a movement
// ════════════════════════════════════════════════════════════════════════════
test.describe('caja — happy: register movement', () => {
  test(
    '/caja?date=TEST_DATE → "+ Agregar movimiento" → fill → "Guardar" → row appears in table @critical',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto(`/caja?date=${TEST_DATE_MOVE}`)
        await expect(page.getByRole('heading', { name: 'Caja y Cantina', exact: true })).toBeVisible({ timeout: 15_000 })

        // Open the movement modal.
        await page.getByRole('button', { name: '+ Agregar movimiento' }).click()

        // Dialog title: "Agregar movimiento".
        // Use heading role: the trigger button is "+ Agregar movimiento" so
        // getByText would match both (strict mode).
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Agregar movimiento' })).toBeVisible()

        // Chips (pages/caja.md §7): "Ingreso" y "Efectivo" ya vienen
        // seleccionados por defecto; solo se elige la categoría "Otro ingreso".
        const dialog = page.getByRole('dialog')
        await dialog.getByRole('button', { name: 'Otro ingreso' }).click()
        await page.locator('#cf-amount').fill('1000')
        await page.locator('#cf-desc').fill('Pago E2E test movimiento')

        // Submit.
        await page.getByRole('button', { name: 'Guardar' }).click()

        // Dialog closes on success.
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

        // The new row should appear in the movements table.
        await expect(page.getByRole('cell', { name: 'Pago E2E test movimiento' })).toBeVisible({ timeout: 10_000 })

        // El rediseño movió el resumen "Ingresos/Egresos" adentro del modal de
        // cierre (CloseDayButton) y del recibo post-cierre (CierreCard) — ya no
        // vive en la página principal. El equivalente visible acá es la sección
        // "Desglose por método" (solo se renderiza cuando hay al menos un método
        // con movimientos), que recalcula con el que acabamos de crear. Solo
        // verificamos que la sección apareció; el monto exacto depende del
        // formatter del server.
        await expect(page.getByRole('heading', { name: 'Desglose por método' })).toBeVisible()
      } finally {
        await context.close()
        // Clean up all cash_flows for this test date.
        await cleanupCajaDate(supabase, TEST_DATE_MOVE)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 2 — Edge: close day with type-to-confirm
// ════════════════════════════════════════════════════════════════════════════
test.describe('caja — edge: close day (type-to-confirm)', () => {
  test(
    '"Cerrar caja" → confirm button disabled until typing CERRAR → type it → confirm → "Caja cerrada" badge @critical',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const seedId = randomUUID()
      const context = await browser.newContext()
      try {
        // Pre-seed a cash_flow so the day has a non-zero balance (makes it closeable with meaning).
        await seedCashFlow(supabase, TEST_DATE_CLOSE, seedId)

        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto(`/caja?date=${TEST_DATE_CLOSE}`)
        await expect(page.getByRole('heading', { name: 'Caja y Cantina', exact: true })).toBeVisible({ timeout: 15_000 })

        // Open "Cerrar caja" dialog.
        await page.getByRole('button', { name: 'Cerrar caja' }).click()

        // Dialog title starts with "Cerrar caja del"
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByText(/Cerrar caja del/i)).toBeVisible()

        // Confirm button should be disabled before typing the phrase.
        const confirmBtn = page.getByRole('button', { name: 'Cerrar caja' }).last()
        await expect(confirmBtn).toBeDisabled()

        // The label contains "Escribí ... CERRAR".
        await expect(page.getByText(/Escribí/i)).toBeVisible()
        await expect(page.getByText(/CERRAR/)).toBeVisible()

        // Type an incorrect phrase — button still disabled.
        await page.locator('#confirm-phrase').fill('cerrar')
        await expect(confirmBtn).toBeDisabled()

        // Type the exact phrase.
        await page.locator('#confirm-phrase').fill('CERRAR')
        await expect(confirmBtn).not.toBeDisabled()

        // Confirm.
        await confirmBtn.click()

        // Dialog closes and the "Caja cerrada" badge appears.
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/Caja cerrada/i).first()).toBeVisible({ timeout: 10_000 })
      } finally {
        await context.close()
        await cleanupCajaDate(supabase, TEST_DATE_CLOSE)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 3 — Edge: idempotency — adding movement to already-closed day
// ════════════════════════════════════════════════════════════════════════════
test.describe('caja — edge: closed-day guard (no writes on a closed day)', () => {
  test(
    'pre-closed day → "Caja cerrada" badge shown and write actions (movimiento / cerrar) are hidden',
    async ({ browser, adminStorageState }) => {
      // A closed day must not accept new movements or a second close. The UI enforces this by
      // hiding CajaActions entirely (it returns null when isClosed=true), so there is no button
      // to issue a write — that is the guard we assert here. The server-side guard
      // ("La caja … ya fue cerrada", thrown by createCashFlow / closeDailyRegister) is covered
      // by the integration test daily-close-idempotency.
      const supabase = makeServiceClient()
      const closeId = randomUUID()
      const context = await browser.newContext()
      try {
        await seedDailyClose(supabase, TEST_DATE_CLOSED, closeId)

        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto(`/caja?date=${TEST_DATE_CLOSED}`)
        await expect(page.getByRole('heading', { name: 'Caja y Cantina', exact: true })).toBeVisible({ timeout: 15_000 })

        // The "Caja cerrada" badge must appear — CajaActions is hidden (isClosed=true).
        await expect(page.getByText(/Caja cerrada/i).first()).toBeVisible()

        // Write actions must NOT be present (CajaActions returns null when closed).
        await expect(page.getByRole('button', { name: '+ Agregar movimiento' })).not.toBeVisible()
        await expect(page.getByRole('button', { name: 'Cerrar caja' })).not.toBeVisible()
      } finally {
        await context.close()
        await cleanupCajaDate(supabase, TEST_DATE_CLOSED)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 4 — Edge: close with difference requires note
// ════════════════════════════════════════════════════════════════════════════
test.describe('caja — edge: close with difference requires note', () => {
  test(
    'balance > 0, declared cash differs → note required → error without note → fill note → success',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const seedId = randomUUID()
      const context = await browser.newContext()
      try {
        // Pre-seed a cash_flow so balance > 0.
        await seedCashFlow(supabase, TEST_DATE_DIFF, seedId)

        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto(`/caja?date=${TEST_DATE_DIFF}`)
        await expect(page.getByRole('heading', { name: 'Caja y Cantina', exact: true })).toBeVisible({ timeout: 15_000 })

        // Open "Cerrar caja".
        await page.getByRole('button', { name: 'Cerrar caja' }).click()
        await expect(page.getByRole('dialog')).toBeVisible()

        // Enter a declared cash that differs from the real balance.
        // Real balance is 1000 ARS (100000 centavos), declare 500 ARS → diff = -500.
        await page.locator('#declared').fill('500')

        // The difference warning must appear.
        await expect(page.getByText(/Diferencia/i)).toBeVisible()
        await expect(page.getByText(/nota es obligatoria/i)).toBeVisible()

        // Type "CERRAR" to enable confirm.
        await page.locator('#confirm-phrase').fill('CERRAR')

        // Confirm with empty note → should fail with error.
        const confirmBtn = page.getByRole('button', { name: 'Cerrar caja' }).last()
        await confirmBtn.click()

        // Error: "Hay diferencia: la nota es obligatoria."
        await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByRole('alert')).toContainText(/nota es obligatoria/i)

        // Dialog stays open.
        await expect(page.getByRole('dialog')).toBeVisible()

        // Now fill the note and try again.
        await page.locator('#close-note').fill('Diferencia detectada en E2E')
        await confirmBtn.click()

        // Success: dialog closes, badge appears.
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/Caja cerrada/i).first()).toBeVisible({ timeout: 10_000 })
      } finally {
        await context.close()
        await cleanupCajaDate(supabase, TEST_DATE_DIFF)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 5 — Happy: open day (fondo inicial) → close matches expected cash (v2)
// ════════════════════════════════════════════════════════════════════════════
test.describe('caja — happy: apertura + cierre v2 (efectivo esperado)', () => {
  test(
    'abrir caja con fondo 1000 → ingreso en efectivo → cerrar declarando el esperado exacto → "el efectivo cuadró" + Fondo inicial',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await page.goto(`/caja?date=${TEST_DATE_OPEN}`)
        await expect(page.getByRole('heading', { name: 'Caja y Cantina', exact: true })).toBeVisible({ timeout: 15_000 })

        // ── 1. Abrir caja con fondo $1000 ────────────────────────────────────
        await page.getByRole('button', { name: 'Abrir caja' }).click()
        const openDialog = page.getByRole('dialog')
        await expect(openDialog).toBeVisible()
        await page.locator('#opening-cash').fill('1000')
        await openDialog.getByRole('button', { name: 'Abrir caja' }).click()
        await expect(openDialog).not.toBeVisible({ timeout: 10_000 })

        // La card ahora muestra el fondo guardado y el botón pasa a "Corregir".
        await expect(page.getByText(/Fondo inicial:/)).toBeVisible({ timeout: 10_000 })
        await expect(page.getByRole('button', { name: 'Corregir' })).toBeVisible()

        // ── 2. Registrar un ingreso en efectivo de $1000 ─────────────────────
        await page.getByRole('button', { name: '+ Agregar movimiento' }).click()
        const movDialog = page.getByRole('dialog')
        await expect(movDialog).toBeVisible()
        await movDialog.getByRole('button', { name: 'Otro ingreso' }).click()
        await page.locator('#cf-amount').fill('1000')
        await page.locator('#cf-desc').fill('Ingreso E2E apertura')
        await page.getByRole('button', { name: 'Guardar' }).click()
        await expect(movDialog).not.toBeVisible({ timeout: 10_000 })
        await expect(page.getByRole('cell', { name: 'Ingreso E2E apertura' })).toBeVisible({ timeout: 10_000 })

        // ── 3. Cerrar declarando el efectivo esperado exacto: fondo 1000 + ────
        //      ingreso cash 1000 = esperado 2000.
        await page.getByRole('button', { name: 'Cerrar caja' }).click()
        const closeDialog = page.getByRole('dialog')
        await expect(closeDialog).toBeVisible()
        await page.locator('#declared').fill('2000')
        // Sin diferencia: la nota sigue opcional (no aparece el aviso ámbar).
        await expect(page.getByText(/Diferencia de.*efectivo esperado/i)).not.toBeVisible()
        await page.locator('#confirm-phrase').fill('CERRAR')
        await closeDialog.getByRole('button', { name: 'Cerrar caja' }).click()
        await expect(closeDialog).not.toBeVisible({ timeout: 10_000 })

        // ── 4. CierreCard v2: "el efectivo cuadró" + fila "Fondo inicial" ────
        await expect(page.getByRole('heading', { name: 'Caja cerrada — el efectivo cuadró' })).toBeVisible({
          timeout: 10_000,
        })
        await expect(page.getByText('Fondo inicial')).toBeVisible()
      } finally {
        await context.close()
        await cleanupCajaDate(supabase, TEST_DATE_OPEN)
      }
    },
  )
})
