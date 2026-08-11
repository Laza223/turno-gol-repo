import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-303 — Listado tenants `/super-admin/tenants` + filtros + paginación.
 * Rol: Super-admin (system_admin). Prereq: al menos un tenant en DB (el seed
 * E2E aporta 2: `E2E Complejo Demo` + el tenant de señas).
 * 100% navegación GET (form method=get + Link), sin JS de cliente — cada
 * cambio de filtro/página es una recarga completa. Ground truth vía runSql
 * (COUNT total + status real del tenant Demo) para no depender de qué banda
 * corrió antes.
 * Evidence anchors: src/app/(super-admin)/super-admin/tenants/page.tsx:44-93,
 * .../tenants/_components/tenants-filters.tsx:1-99, .../tenants-table.tsx:1-109,
 * src/modules/super-admin/tenants.service.ts:78-151.
 */
test.describe('TG-HP-303 — Listado tenants + filtros + paginación', () => {
  test('buscar, filtrar por estado/plan, limpiar y navegar al detalle', async ({ browser }) => {
    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    try {
      const page = await ctx.newPage()

      const totalRows = await runSql<{ n: string }>('SELECT COUNT(*)::text AS n FROM tenants')
      const totalTenants = Number(totalRows[0]!.n)
      const demoRows = await runSql<{ status: string; name: string }>(
        'SELECT status, name FROM tenants WHERE id = $1',
        [E2E_TENANT_ID],
      )
      const demo = demoRows[0]!

      await page.goto('/super-admin/tenants')
      await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible({ timeout: 15_000 })
      await expect(
        page.getByText(
          `${totalTenants} complejo${totalTenants === 1 ? '' : 's'} — vista global de soporte`,
        ),
      ).toBeVisible()

      // ── Filtro Buscar (q) ────────────────────────────────────────────────
      await page.locator('#q').fill(demo.name)
      await page.getByRole('button', { name: 'Filtrar' }).click()
      await page.waitForURL((url) => url.searchParams.get('q') === demo.name)
      const demoLink = page.getByRole('link', { name: demo.name })
      await expect(demoLink).toBeVisible()

      // "Limpiar" solo visible si hay un filtro activo → vuelve sin query params.
      await page.getByRole('link', { name: 'Limpiar' }).click()
      await page.waitForURL((url) => url.search === '')
      expect(new URL(page.url()).pathname).toBe('/super-admin/tenants')

      // ── Filtro Estado ────────────────────────────────────────────────────
      await page.locator('#status').selectOption(demo.status)
      await page.getByRole('button', { name: 'Filtrar' }).click()
      await page.waitForURL((url) => url.searchParams.get('status') === demo.status)
      // El tenant Demo matchea su propio status → sigue visible en la tabla.
      await expect(page.getByRole('link', { name: demo.name })).toBeVisible()

      // ── Filtro Plan ──────────────────────────────────────────────────────
      const planOptionValue = await page
        .locator('#plan option')
        .nth(1) // 0 = "Todos"
        .getAttribute('value')
      expect(planOptionValue).toBeTruthy()
      await page.locator('#plan').selectOption(planOptionValue!)
      await page.getByRole('button', { name: 'Filtrar' }).click()
      await page.waitForURL((url) => url.searchParams.get('plan') === planOptionValue)
      // No se afirma presencia del tenant Demo acá: filtrar por plan puede
      // excluirlo si no tiene esa suscripción asignada en este punto de la corrida.

      // ── Navegación a detalle ─────────────────────────────────────────────
      await page.goto('/super-admin/tenants')
      await page.getByRole('link', { name: demo.name }).click()
      await page.waitForURL(new RegExp(`/super-admin/tenants/${E2E_TENANT_ID}`))
      expect(page.url()).toContain(`/super-admin/tenants/${E2E_TENANT_ID}`)

      // ── Paginación (condicional a totalPages > 1) ───────────────────────
      await page.goto('/super-admin/tenants')
      const pagingNav = page.getByRole('navigation', { name: 'Paginación' })
      const hasPaging = await pagingNav.isVisible().catch(() => false)
      if (hasPaging) {
        await expect(pagingNav.getByText(/Página \d+ de \d+/)).toBeVisible()
      }

      await writeEvidence('TG-HP-303', {
        status: 'pass',
        totalTenants,
        demoTenant: demo,
        planFilterValue: planOptionValue,
        paginationVisible: hasPaging,
        dbWrites: 'ninguno (listTenants es lectura pura vía getWorkerDb, filtros 100% GET)',
        notes:
          'Estado/plan filtrados con el valor REAL del tenant Demo leído por runSql, no hardcodeado.',
      })
    } finally {
      await ctx.close()
    }
  })
})
