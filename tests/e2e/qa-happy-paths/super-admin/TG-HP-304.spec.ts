import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-304 — Detalle tenant `/super-admin/tenants/[id]`: 4 tabs.
 * Rol: Super-admin (system_admin). Prereq: tenant Demo (`E2E_TENANT_ID`).
 * Solo lectura (Resumen/Suscripción/Actividad) — no muta estado. Ground truth
 * vía runSql para cada tab, así el spec es correcto sin importar en qué status/
 * con o sin fila de tenant_subscriptions haya quedado el tenant Demo por otras
 * bandas/casos que corrieron antes en esta misma corrida (los tabs 305-310 sí
 * mutan ese estado — este caso no asume ninguno en particular).
 * Evidence anchors: src/app/(super-admin)/super-admin/tenants/[id]/page.tsx:38-133,
 * .../_components/resumen-tab.tsx:12-157, .../suscripcion-tab.tsx:11-82,
 * .../actividad-tab.tsx:12-140, src/modules/super-admin/tenants.service.ts:196-458.
 */
test.describe('TG-HP-304 — Detalle tenant: 4 tabs', () => {
  test('Resumen, Suscripción, Actividad y Acciones renderizan con datos reales', async ({
    browser,
  }) => {
    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    try {
      const page = await ctx.newPage()

      // ── Ground truth ────────────────────────────────────────────────────
      const tenantRows = await runSql<{
        name: string
        slug: string
        email: string
        status: string
      }>('SELECT name, slug, email, status FROM tenants WHERE id = $1', [E2E_TENANT_ID])
      const tenant = tenantRows[0]!

      const courtsRows = await runSql<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM courts WHERE tenant_id = $1',
        [E2E_TENANT_ID],
      )
      const courtsCount = Number(courtsRows[0]!.n)

      const staffRows = await runSql<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM tenant_staff_members WHERE tenant_id = $1',
        [E2E_TENANT_ID],
      )
      const staffCount = Number(staffRows[0]!.n)

      const subRows = await runSql<{ status: string; plan_name: string }>(
        `SELECT ts.status, p.name AS plan_name
         FROM tenant_subscriptions ts JOIN plans p ON p.id = ts.plan_id
         WHERE ts.tenant_id = $1`,
        [E2E_TENANT_ID],
      )
      const subscription = subRows[0] ?? null

      const auditCountRows = await runSql<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM audit_logs WHERE tenant_id = $1',
        [E2E_TENANT_ID],
      )
      const auditCount = Number(auditCountRows[0]!.n)

      // ── Tab Resumen (default) ───────────────────────────────────────────
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}`)
      await expect(page.getByRole('heading', { name: tenant.name, exact: false })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(`${tenant.slug} · ${tenant.email}`)).toBeVisible()

      await expect(page.getByRole('heading', { name: 'Soporte' })).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Entrar como este complejo' }),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Datos del complejo' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(
        page.getByText(
          'Softban por reincidencia: 2ª ausencia en 90 días bloquea 14 días para reservar online',
        ),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: `Canchas (${courtsCount})` })).toBeVisible()
      await expect(page.getByRole('heading', { name: `Staff (${staffCount})` })).toBeVisible()

      // ── Tab Suscripción ──────────────────────────────────────────────────
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=suscripcion`)
      if (subscription === null) {
        await expect(
          page.getByText(
            'El complejo no tiene fila en tenant_subscriptions (todavía no inició la suscripción SaaS).',
          ),
        ).toBeVisible({ timeout: 15_000 })
      } else {
        await expect(page.getByRole('heading', { name: 'Estado de la suscripción' })).toBeVisible({
          timeout: 15_000,
        })
        await expect(page.getByText(subscription.plan_name, { exact: false })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Dunning y pagos' })).toBeVisible()
      }

      // ── Tab Actividad ────────────────────────────────────────────────────
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=actividad`)
      await expect(
        page.getByRole('heading', { name: `Audit trail (${auditCount})` }),
      ).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Últimas 10 reservas' })).toBeVisible()

      // ── Tab Acciones ─────────────────────────────────────────────────────
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)
      await expect(
        page.getByRole('heading', { name: 'Forzar transición de estado' }),
      ).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Extender trial' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Cambiar plan sin cobro' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Editar settings del complejo' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Resetear contraseña de staff' })).toBeVisible()

      await writeEvidence('TG-HP-304', {
        status: 'pass',
        tenant,
        courtsCount,
        staffCount,
        subscription,
        auditCount,
        dbWrites: 'ninguno (getTenantDetail/getTenantActivity son lectura pura)',
        notes:
          'Tab Suscripción con branch condicional según haya o no fila en tenant_subscriptions ' +
          '(Hallazgo #4: el seed E2E no crea esa fila por defecto).',
      })
    } finally {
      await ctx.close()
    }
  })
})
