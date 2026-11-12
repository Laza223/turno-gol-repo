import { randomUUID } from 'node:crypto'
import { test, expect } from '../../fixtures'
import { writeEvidence, getSql } from '../_qa/evidence'
import { deleteFreshAdminTenants } from '../../_helpers/fresh-tenant-cleanup'
import { suppressPushPrompt } from '../_qa/session'

// Mismo id que scripts/seed-e2e.ts (E2E.freshStaffUserId) — ver capture-screenshots.spec.ts.
const FRESH_STAFF_USER_ID = '00000000-0000-4000-8000-000000000005'

/**
 * TG-HP-203: Wizard por rutas `/onboarding/[paso]` (5 pasos + resumen). Sigue vigente para el
 * alta asistida del super-admin y para quien quedó a mitad de camino; el alta pública de
 * /register (complejo primero, cuenta al final) la cubre TG-HP-202.
 * Rol: Admin (dueño). requireAdminStaffAction en los pasos 2-5.
 * Prereq: sesión de e2e-admin-fresh@turnogol.test (0 tenants) → freshAdminStorageState.
 * Flujo: Paso 1 Complejo (nombre y dirección) → Paso 2 Canchas (Fútbol 5 = 1) →
 *   Paso 3 Horarios (08 a 00) → Paso 4 Precios → Paso 5 Tu complejo (3 toques) →
 *   Resumen → /onboarding/listo → /dashboard.
 * La dirección se carga "a mano" para no depender de Georef (un tercero).
 * Evidence anchors: src/app/onboarding/[paso]/page.tsx, actions.ts, resumen/page.tsx,
 *   StepComplejo.tsx, StepCanchas.tsx, StepHorarios.tsx, StepPrecios.tsx, StepTuComplejo.tsx.
 */
test.describe('TG-HP-203 — Onboarding wizard 5 pasos', () => {
  test('fresh admin completes the 5-step wizard and lands on /dashboard with tenant + court created', async ({
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

      // ── Paso 1 — Tu complejo: nombre y dirección ─────────────────────
      await expect(page.getByRole('heading', { name: '¿Cómo se llama tu complejo?' })).toBeVisible({
        timeout: 10_000,
      })
      await page.getByLabel(/nombre del complejo/i).fill(tenantName)
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page.getByRole('heading', { name: /¿Dónde queda/i })).toBeVisible()
      await page.getByRole('button', { name: /escribir ciudad y provincia a mano/i }).click()
      await page.getByLabel('Dirección').fill('Av. Test QA 203')
      await page.getByLabel('Ciudad').fill('Luján')
      await page.getByRole('combobox', { name: /provincia/i }).click()
      await page.getByRole('option', { name: 'Buenos Aires' }).click()
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // ── Paso 2 — Canchas (Fútbol 5 = 1 por defecto) ──────────────────
      await expect(page.getByText(/Paso 2 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // ── Paso 3 — Horarios (08 a 00 por defecto) ──────────────────────
      await expect(page.getByText(/Paso 3 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // ── Paso 4 — Precios ─────────────────────────────────────────────
      await expect(page.getByText(/Paso 4 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByRole('textbox', { name: /precio del turno/i }).fill('20000')
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // ── Paso 5 — Tu complejo: tres toques, cada opción avanza sola ───
      await expect(page.getByText(/Paso 5 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByRole('radio', { name: 'En un cuaderno o planilla' }).click()
      await page.getByRole('radio', { name: 'Sí' }).click()
      await page.getByRole('radio', { name: 'No' }).click()

      // ── Resumen ──────────────────────────────────────────────────────
      await expect(page).toHaveURL(/\/onboarding\/resumen/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: '¿Está todo bien?' })).toBeVisible()
      await page.getByRole('button', { name: /abrir mi complejo/i }).click()

      // ── Cierre peak-end ──────────────────────────────────────────────
      await expect(page).toHaveURL(/\/onboarding\/listo/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: /Tu complejo está online/i })).toBeVisible({
        timeout: 10_000,
      })

      await page.getByRole('link', { name: /Ir a mi panel/i }).click()
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
      await expect(page.getByText(tenantName).first()).toBeVisible({ timeout: 10_000 })

      // DB: tenant + tenant_staff_members + cancha creados por las Server Actions del wizard.
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
          settings: {
            onboarding_completed?: boolean
            booking_intake?: string
            has_fixed_teams?: boolean
            canteen_enabled?: boolean
          }
          opening_hours: unknown
        }>
        expect(tenantRows).toHaveLength(1)
        const tenant = tenantRows[0]!
        expect(tenant.settings.onboarding_completed).toBe(true)
        expect(tenant.settings.booking_intake).toBe('notebook')
        expect(tenant.settings.has_fixed_teams).toBe(true)
        expect(tenant.settings.canteen_enabled).toBe(false)

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
            'tenants + tenant_staff_members (Paso 1) + settings.onboarding_draft_courts (Paso 2) + opening_hours UPDATE (Paso 3) + courts INSERT (Paso 4) + settings.booking_intake/has_fixed_teams/canteen_enabled (Paso 5) + settings.onboarding_completed=true (resumen)',
          notes: 'settings.onboarding_completed marcado por finishOnboardingAction.',
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
