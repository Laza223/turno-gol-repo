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
 * Evidence anchors: src/app/(super-admin)/super-admin/tenants/page.tsx,
 * .../tenants/_components/tenants-filters.tsx, .../tenants-table.tsx,
 * src/modules/super-admin/tenants.service.ts (listTenants).
 */
test.describe('TG-HP-303 — Listado tenants + filtros + paginación', () => {
  test('buscar, filtrar por estado, limpiar y navegar al detalle', async ({ browser }) => {
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

      // El filtro por plan se eliminó con el precio por cancha (decisión
      // 2026-09-17): `plans` quedó con una sola fila activa, así que filtraba
      // todo o nada. La columna "Plan" de la tabla pasó a ser "Canchas".
      await expect(page.locator('#plan')).toHaveCount(0)
      await expect(page.getByRole('columnheader', { name: 'Canchas' })).toBeVisible()

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
        paginationVisible: hasPaging,
        dbWrites: 'ninguno (listTenants es lectura pura vía getWorkerDb, filtros 100% GET)',
        notes:
          'Estado filtrado con el valor REAL del tenant Demo leído por runSql, no hardcodeado. El filtro por plan ya no existe (precio por cancha).',
      })
    } finally {
      await ctx.close()
    }
  })
})
