import { randomUUID } from 'node:crypto'
import { test, expect } from '../../fixtures'
import { writeEvidence, getSql } from '../_qa/evidence'
import { deleteFreshAdminTenants } from '../../_helpers/fresh-tenant-cleanup'
import { suppressPushPrompt } from '../_qa/session'

// Mismo id que scripts/seed-e2e.ts (E2E.freshStaffUserId) — ver capture-screenshots.spec.ts.
const FRESH_STAFF_USER_ID = '00000000-0000-4000-8000-000000000005'

/**
 * TG-HP-203 — Onboarding wizard (4 pasos), camino "Sin seña".
 * Rol: Admin (dueño) — requireAdminStaffAction en pasos 2-4.
 * Prereq: sesión de e2e-admin-fresh@turnogol.test (0 tenants) → freshAdminStorageState.
 * Flujo: Paso 1 Identidad → Paso 2 Horarios (default) → Paso 3 Canchas (precio) →
 *   Paso 4 Señas ("Sin seña por ahora") → /onboarding/listo → /dashboard.
 * Evidence anchors: src/app/onboarding/page.tsx:24-87, actions.ts:42-254,
 *   StepIdentity.tsx:68-160, StepCourts.tsx:94-158, StepPayments.tsx:82-203.
 */
test.describe('TG-HP-203 — Onboarding wizard 4 pasos', () => {
  test('fresh admin completes the 4-step wizard and lands on /dashboard with tenant + court created', async ({
    browser,
    freshAdminStorageState,
  }) => {
    const uniq = randomUUID().slice(0, 8)
    const tenantName = `Complejo E2E QA-203 ${uniq}`

    // Pre-limpieza: si una corrida previa dejó al fresh admin con un tenant a
    // medio onboarding, el wizard lo manda directo a un paso posterior y el
    // heading del Paso 1 nunca aparece (mismo gotcha documentado en
    // capture-screenshots.spec.ts:59-68 — idempotente, no depende de que la
    // corrida anterior haya llegado a su `finally`).
    const bootSql = getSql()
    try {
      await deleteFreshAdminTenants(bootSql, FRESH_STAFF_USER_ID)
    } finally {
      await bootSql.end({ timeout: 5 })
    }

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(freshAdminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/onboarding')
      await expect(page).toHaveURL(/\/onboarding/)

      // ── Paso 1 — Tu complejo ──────────────────────────────────────────
      await expect(page.getByRole('heading', { name: /Tu complejo/i })).toBeVisible({
        timeout: 10_000,
      })
      await page.locator('#identity-name').fill(tenantName)
      await page.locator('#identity-address').fill('Av. Test QA 203')
      await page.locator('#identity-city').fill('Luján')
      await page.locator('#identity-province').selectOption({ label: 'Buenos Aires' })
      await page.locator('#identity-phone').fill('1122334455')
      await page.locator('#identity-email').fill(`qa-203-${uniq}@turnogol.test`)
      await page.getByRole('button', { name: /Continuar/i }).click()

      // ── Paso 2 — Horarios (defaults saneados, Continuar sin tocar nada) ─
      await expect(page.getByText(/Paso 2 de 4/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: /Continuar/i }).click()

      // ── Paso 3 — Canchas (draft precargado, solo falta el precio) ──────
      await expect(page.getByText(/Paso 3 de 4/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('heading', { name: /Tus canchas/i })).toBeVisible()
      await page.getByPlaceholder(/20\.000/).fill('20.000')
      await page.getByRole('button', { name: /^Continuar$/i }).click()

      // ── Paso 4 — Señas: "Sin seña por ahora" ────────────────────────────
      await expect(page.getByText(/Paso 4 de 4/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByText(/Sin seña por ahora/i).click()
      await page.getByRole('button', { name: /Terminar y ver mi complejo/i }).click()

      // ── Cierre peak-end ──────────────────────────────────────────────
      await expect(page).toHaveURL(/\/onboarding\/listo/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: /Tu complejo está online/i })).toBeVisible({
        timeout: 10_000,
      })

      await page.getByRole('link', { name: /Ir a mi panel/i }).click()
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
      await expect(page.getByText(tenantName).first()).toBeVisible({ timeout: 10_000 })

      // DB: tenant + tenant_staff_members + cancha creados por las 4 Server Actions.
      const sql = getSql()
      try {
        const tenantRows = (await sql`
          SELECT t.id, t.name, t.settings, t.opening_hours
          FROM tenants t
          JOIN tenant_staff_members tsm ON tsm.tenant_id = t.id
          WHERE tsm.staff_user_id = ${FRESH_STAFF_USER_ID} AND t.name = ${tenantName}
        `) as unknown as Array<{
          id: string
          name: string
          settings: { onboarding_completed?: boolean }
          opening_hours: unknown
        }>
        expect(tenantRows).toHaveLength(1)
        const tenant = tenantRows[0]!
        expect(tenant.settings.onboarding_completed).toBe(true)

        const courtRows = (await sql`
          SELECT id, name, pricing FROM courts WHERE tenant_id = ${tenant.id}
        `) as unknown as Array<{ id: string; name: string; pricing: unknown }>
        expect(courtRows.length).toBeGreaterThanOrEqual(1)
        expect(courtRows[0]?.name).toBe('Cancha 1')

        await writeEvidence('TG-HP-203', {
          status: 'pass',
          tenantName,
          tenantRow: tenant,
          courtRow: courtRows[0],
          dbWrites:
            'tenants (Paso 1) + tenant_staff_members + opening_hours UPDATE (Paso 2) + courts INSERT (Paso 3) + settings.onboarding_completed=true (Paso 4)',
          notes: 'Camino "Sin seña" — settings.onboarding_completed marcado por finishOnboardingAction.',
        })
      } finally {
        await sql.end({ timeout: 5 })
      }
    } finally {
      await context.close()
      // El fresh admin es fixture compartida — cualquier spec que complete el
      // wizard tiene que barrer el/los tenant(s) creados en su afterAll
      // (fresh-tenant-cleanup.ts, comentario de por qué vive ahí).
      const cleanupSql = getSql()
      try {
        await deleteFreshAdminTenants(cleanupSql, FRESH_STAFF_USER_ID)
      } finally {
        await cleanupSql.end({ timeout: 5 })
      }
    }
  })
})
