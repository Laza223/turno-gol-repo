import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'

/**
 * TG-HP-302 — Pulso `/super-admin`.
 * Rol: Super-admin (system_admin). Prereq: sesión super-admin activa. No
 * requiere tenant_subscriptions (MRR puede dar $0 sin datos — Hallazgo #4).
 * Ground truth vía runSql (COUNT/SUM directos, mismas tablas y filtros que
 * `getDashboardData()`) para que el assert de "datos reales" no dependa del
 * estado dejado por otras bandas/casos previos de esta corrida.
 * Evidence anchors: src/app/(super-admin)/super-admin/page.tsx:1-23,
 * src/app/(super-admin)/super-admin/_components/dashboard-view.tsx:64-216,
 * src/modules/super-admin/dashboard.service.ts:73-203.
 */
test.describe('TG-HP-302 — Pulso', () => {
  test('4 números + secciones renderizan con datos reales de DB', async ({ browser }) => {
    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    try {
      const page = await ctx.newPage()
      await page.goto('/super-admin')
      await expect(page.getByRole('heading', { name: 'Pulso' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText('Cómo viene la plataforma hoy y esta semana.')).toBeVisible()

      // ── Ground truth ────────────────────────────────────────────────────
      const totalRows = await runSql<{ n: string }>('SELECT COUNT(*)::text AS n FROM tenants')
      const totalTenants = Number(totalRows[0]!.n)

      const mrrRows = await runSql<{ mrr: string }>(`
        SELECT COALESCE(SUM(CASE WHEN ts.billing_cycle = 'annual' THEN p.price_annual ELSE p.price_monthly END), 0)::text AS mrr
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

      // ── Los 4 números (StatCard, contenedor .card-premium) ──────────────
      for (const label of [
        'Jugadores nuevos',
        'Reservas online',
        'Cargadas por el complejo',
        'Complejos con movimiento',
      ]) {
        await expect(page.locator('.card-premium').filter({ hasText: label })).toBeVisible({
          timeout: 15_000,
        })
      }

      // ── Secciones ────────────────────────────────────────────────────────
      await expect(page.getByRole('heading', { name: 'Últimos 14 días' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Reservas online' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Jugadores nuevos' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Plata' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Altas de la semana' })).toBeVisible()
      await expect(page.getByRole('heading', { name: /Alta de complejos/ })).toBeVisible()
      await expect(page.getByText('Salud técnica')).toBeVisible()

      // Plata: ingreso mensual y total de complejos contra el ground truth.
      const moneySection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Plata' }) })
      await expect(moneySection).toContainText(expectedMrrText)
      await expect(moneySection).toContainText(`Complejos: ${totalTenants} en total`)

      await writeEvidence('TG-HP-302', {
        status: 'pass',
        groundTruth: { totalTenants, mrrCents, expectedMrrText },
        dbWrites: 'ninguno (vista read-only, export const dynamic = force-dynamic)',
        notes:
          'MRR y Tenants verificados contra SUM/COUNT directos (misma query shape que dashboard.service.ts).',
      })
    } finally {
      await ctx.close()
    }
  })
})
