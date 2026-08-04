import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, suppressPushPrompt } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-226 — Equipo `/settings/equipo`: invitar miembro (rol manager) + gate solo-admin.
 * Rol: solo Admin ve/muta `/settings/equipo` (`requireAdminStaff`, `page.tsx:14` +
 * `assertActorIsAdmin` dentro de cada Server Action, `actions.ts:115-134`).
 * Prereq: sesión admin del tenant Demo.
 * Flujo: botón "Agregar miembro del equipo" (label real en código —
 * `InviteStaffButton.tsx:20` — distinto del "Invitar miembro" del manual) →
 * dialog → Nombre/Apellido/Email + rol Encargado (preseleccionado,
 * `DEFAULT_INVITE_ROLE='manager'`) → Enviar invitación.
 * Gate: se mintea sesión para el manager recién invitado (ya provisionado en
 * Supabase Auth por `inviteUserByEmail`, con `app_metadata.role='manager'`
 * seteado por la propia action) y se confirma que `/settings/equipo` y `/settings/*`
 * redirigen a `/dashboard` (`SettingsLayout` + `requireAdminStaff`) — y de ahí,
 * por D5 (Fase 2: "Hoy" es solo del admin), `/dashboard` rebota una segunda vez
 * a `/grilla` para un manager, así que la URL final observada es `/grilla`.
 * NO-PLATA: se borra `tenant_staff_members`/`staff_users` del invitado en
 * `finally` (mismo alcance de limpieza que `staff-crud.spec.ts`, que tampoco
 * borra el auth user creado — deuda preexistente, no de este spec).
 * Evidence anchors: src/app/(admin)/settings/equipo/actions.ts:1-256,
 *   src/app/(admin)/settings/equipo/InviteStaffDialog.tsx:58-158,
 *   src/app/(admin)/settings/layout.tsx:1-13, src/modules/settings/equipo/roles.ts:1-22.
 */
test.describe('TG-HP-226 — Equipo: invitar Encargado + gate solo-admin', () => {
  test('admin invita a un manager → fila activa en DB; el manager no accede a /settings/equipo ni /settings', async ({
    browser,
    adminStorageState,
  }) => {
    const email = `e2e-qa-hp226-${Date.now()}@turnogol.test`
    const adminContext = await browser.newContext()
    await suppressPushPrompt(adminContext)
    let managerContext: BrowserContext | null = null

    try {
      await adminContext.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await adminContext.newPage()

      await page.goto('/settings/equipo')
      await page.getByRole('button', { name: 'Agregar miembro del equipo' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Invitar miembro del equipo' })).toBeVisible()

      await page.fill('input[name="firstName"]', 'QA')
      await page.fill('input[name="lastName"]', 'Encargado226')
      await page.fill('input[name="email"]', email)
      // Encargado (manager) viene preseleccionado — DEFAULT_INVITE_ROLE (roles.ts:22).
      await expect(page.locator('input[name="role"][value="manager"]')).toBeChecked()

      await page.getByRole('button', { name: 'Enviar invitación' }).click()

      // exact:true: 'Invitación enviada' matchea el toast <div> Y el <span role="status"
      // aria-live> del announcer ("Notification Invitación enviada…") → strict violation.
      await expect(page.getByText('Invitación enviada', { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })

      // Lista dual tabla+cards: .first() = la tabla, visible en desktop (mismo patrón que staff-crud.spec.ts).
      await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 })

      const row = page.locator('tr').filter({ hasText: email })
      await expect(row.getByText('Encargado', { exact: true })).toBeVisible()
      await expect(row.getByText('Activo', { exact: true })).toBeVisible()

      // ── DB layer ────────────────────────────────────────────────────────
      const [member] = await runSql<{ role: string; is_active: boolean; staff_user_id: string }>(
        `SELECT tsm.role, tsm.is_active, tsm.staff_user_id
         FROM tenant_staff_members tsm
         JOIN staff_users su ON su.id = tsm.staff_user_id
         WHERE tsm.tenant_id = $1 AND su.email = $2`,
        [E2E_TENANT_ID, email],
      )
      expect(member?.role).toBe('manager')
      expect(member?.is_active).toBe(true)

      // ── Gate: mintear sesión para el manager recién invitado ──────────────
      managerContext = await newAuthedContext(browser, email)
      await suppressPushPrompt(managerContext)
      const managerPage = await managerContext.newPage()

      await managerPage.goto('/settings/equipo')
      await expect(managerPage).toHaveURL(/\/grilla/, { timeout: 15_000 })

      await managerPage.goto('/settings/reservas')
      await expect(managerPage).toHaveURL(/\/grilla/, { timeout: 15_000 })

      await writeEvidence('TG-HP-226', {
        status: 'pass',
        invitedEmail: email,
        dbRow: member,
        gate: 'manager GET /settings/equipo → /dashboard (requireAdminStaff) → /grilla (D5); manager GET /settings/reservas → /dashboard (SettingsLayout requireAdminStaff) → /grilla (D5)',
      })
    } finally {
      await runSql(
        'DELETE FROM tenant_staff_members WHERE tenant_id = $1 AND staff_user_id = (SELECT id FROM staff_users WHERE email = $2)',
        [E2E_TENANT_ID, email],
      )
      await runSql('DELETE FROM staff_users WHERE email = $1', [email])
      await adminContext.close()
      if (managerContext) await managerContext.close()
    }
  })
})
