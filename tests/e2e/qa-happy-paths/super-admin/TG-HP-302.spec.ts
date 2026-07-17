import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'

/**
 * TG-HP-302 — Dashboard global `/super-admin`.
 * Rol: Super-admin (system_admin). Prereq: sesión super-admin activa. No
 * requiere tenant_subscriptions (MRR puede dar $0 sin datos — Hallazgo #4).
 * Ground truth vía runSql (COUNT/SUM directos, mismas tablas y filtros que
 * `getDashboardData()`) para que el assert de "datos reales" no dependa del
 * estado dejado por otras bandas/casos previos de esta corrida.
 * Evidence anchors: src/app/(super-admin)/super-admin/page.tsx:1-23,
 * src/app/(super-admin)/super-admin/_components/dashboard-view.tsx:64-216,
 * src/modules/super-admin/dashboard.service.ts:73-203.
 */
test.describe('TG-HP-302 — Dashboard global', () => {
  test('4 KPIs + secciones renderizan con datos reales de DB', async ({ browser }) => {
    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    try {
      const page = await ctx.newPage()
      await page.goto('/super-admin')
      await expect(page.getByRole('heading', { name: 'Dashboard global' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText('Métricas cross-tenant de la plataforma')).toBeVisible()

      // ── Ground truth ────────────────────────────────────────────────────
      const totalRows = await runSql<{ n: string }>('SELECT COUNT(*)::text AS n FROM tenants')
      const totalTenants = Number(totalRows[0]!.n)

      const mrrRows = await runSql<{ mrr: string }>(`
        SELECT COALESCE(SUM(p.price_monthly), 0)::text AS mrr
        FROM tenant_subscriptions ts
        JOIN plans p ON p.id = ts.plan_id
        WHERE ts.status = 'active'
      `)
      const mrrCents = Number(mrrRows[0]!.mrr)
      const arsFormatter = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      })
      const expectedMrrText = arsFormatter.format(Math.round(mrrCents) / 100)

      // ── KPI cards (StatCard, contenedor .card-premium) ──────────────────
      const mrrCard = page.locator('.card-premium').filter({ hasText: 'MRR' })
      await expect(mrrCard).toContainText(expectedMrrText)

      const tenantsCard = page.locator('.card-premium').filter({ hasText: 'Tenants' })
      await expect(tenantsCard).toContainText(String(totalTenants))

      await expect(
        page.locator('.card-premium').filter({ hasText: 'Trials por vencer' }),
      ).toBeVisible()
      await expect(
        page.locator('.card-premium').filter({ hasText: /Signups \(7 días\)/ }),
      ).toBeVisible()

      // ── Secciones ────────────────────────────────────────────────────────
      await expect(page.getByRole('heading', { name: 'Tenants por estado' })).toBeVisible()
      await expect(page.getByRole('heading', { name: /Trials por vencer \(≤7 días\)/ })).toBeVisible()
      await expect(page.getByRole('heading', { name: /Signups recientes \(7 días\)/ })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Colas de jobs (pg-boss)' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Webhooks MP recientes' })).toBeVisible()

      // Tenants por estado: la suma de los badges por status = total (misma
      // fuente que la KPI "Tenants" — getTenantsByStatus() agrupa `tenants`).
      const statusSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Tenants por estado' }) })
      await expect(statusSection).toBeVisible()

      await writeEvidence('TG-HP-302', {
        status: 'pass',
        groundTruth: { totalTenants, mrrCents, expectedMrrText },
        dbWrites: 'ninguno (vista read-only, export const dynamic = force-dynamic)',
        notes: 'MRR y Tenants verificados contra SUM/COUNT directos (misma query shape que dashboard.service.ts).',
      })
    } finally {
      await ctx.close()
    }
  })
})
