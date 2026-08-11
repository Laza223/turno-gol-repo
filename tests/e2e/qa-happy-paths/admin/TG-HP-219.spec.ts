/**
 * TG-HP-219 — Jugadores `/jugadores`: ficha + indicador de softban activo.
 * Rol: Admin/manager (requireOperatorStaff). Prereq: jugador con vínculo activo
 * (player_tenant_relationships) + fila vigente en tenant_player_bans.
 *
 * Usa un jugador DEDICADO (no el E2E_PLAYER_ID compartido) para no contaminar
 * el fixture canónico con un ban — otros specs que loguean como
 * e2e-player@turnogol.test asumen que NO está bloqueado.
 *
 * Ejercita también "Levantar bloqueo" (BanPlayerControls) — cierra el loop
 * completo del manual (banner → botón → toast → banner desaparece).
 *
 * No-plata: se limpia player + PTR + ban en finally.
 * Evidencia: src/app/(admin)/jugadores/[playerId]/JugadorProfileView.tsx:68-167,
 * src/app/(admin)/jugadores/[playerId]/BanPlayerControls.tsx:36-135,
 * src/modules/bans/ban.service.ts:1-58.
 */
import { randomUUID } from 'node:crypto'
import { test, expect } from '../../fixtures'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

test.describe('TG-HP-219 — ficha jugador + indicador de softban', () => {
  test('admin ve el indicador de bloqueo activo y lo levanta desde la ficha', async ({
    browser,
    adminStorageState,
  }) => {
    const playerId = randomUUID()
    const playerEmail = `qa-hp-219-${playerId.slice(0, 8)}@turnogol.test`
    const playerFirstName = 'QA'
    const playerLastName = `Softban219-${playerId.slice(0, 8)}`
    const fullName = `${playerFirstName} ${playerLastName}`
    const banReason = 'Ausencias reiteradas (2+ en 90 días)'

    await runSql(
      `INSERT INTO players (id, email, first_name, last_name, status, agreed_to_terms_at, terms_version)
       VALUES ($1, $2, $3, $4, 'active', NOW(), 'v1')`,
      [playerId, playerEmail, playerFirstName, playerLastName],
    )
    await runSql(
      `INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count, noshow_count, last_no_show_at)
       VALUES ($1, $2, 3, 2, NOW() - interval '2 days')`,
      [E2E_TENANT_ID, playerId],
    )
    await runSql(
      `INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_until, banned_by)
       VALUES ($1, $2, $3, NOW() + interval '14 days', NULL)`,
      [E2E_TENANT_ID, playerId, banReason],
    )

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/jugadores')
      await expect(page.getByRole('heading', { name: 'Jugadores' })).toBeVisible({
        timeout: 15_000,
      })

      const searchInput = page.getByLabel('Buscar jugadores')
      await searchInput.fill(fullName)
      await searchInput.press('Enter')
      await page.waitForURL(/\/jugadores\?q=/, { timeout: 10_000 })

      // ResponsiveList renderiza cards (mobile) Y tabla (desktop) a la vez —
      // ambas coexisten en el DOM, toggleadas por CSS. La tabla va primero
      // (responsive-list.tsx:19) y es la visible en el viewport desktop.
      await page
        .getByRole('link', { name: new RegExp(fullName) })
        .first()
        .click()
      await page.waitForURL(new RegExp(`/jugadores/${playerId}$`), { timeout: 10_000 })

      await expect(page.getByRole('heading', { name: fullName })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('Bloqueado para reservar online')).toBeVisible()
      await expect(page.getByText(banReason)).toBeVisible()

      const liftButton = page.getByRole('button', { name: 'Levantar bloqueo' })
      await expect(liftButton).toBeVisible()
      await liftButton.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('heading', { name: 'Levantar bloqueo' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Levantar bloqueo' }).click()

      await expect(page.getByText('Bloqueo levantado', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('Bloqueado para reservar online')).not.toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('button', { name: 'Bloquear jugador' })).toBeVisible()

      // ── DB assertion ──────────────────────────────────────────────────────
      const banRows = await runSql<{ banned_until: string }>(
        `SELECT banned_until FROM tenant_player_bans WHERE tenant_id = $1 AND player_id = $2`,
        [E2E_TENANT_ID, playerId],
      )
      expect(banRows).toHaveLength(1)
      expect(new Date(banRows[0]!.banned_until).getTime()).toBeLessThanOrEqual(Date.now() + 5_000)

      await writeEvidence('TG-HP-219', {
        status: 'pass',
        playerId,
        playerEmail,
        fullName,
        banReasonSeeded: banReason,
        bannedUntilAfterLift: banRows[0]?.banned_until,
      })
    } finally {
      await context.close()
      await runSql(`DELETE FROM tenant_player_bans WHERE tenant_id = $1 AND player_id = $2`, [
        E2E_TENANT_ID,
        playerId,
      ])
      await runSql(
        `DELETE FROM player_tenant_relationships WHERE tenant_id = $1 AND player_id = $2`,
        [E2E_TENANT_ID, playerId],
      )
      await runSql(`DELETE FROM players WHERE id = $1`, [playerId])
    }
  })
})
