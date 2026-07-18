/**
 * TG-HP-212 — Marcar AUSENTE (no-show) → captura seña + softban 2da ausencia/90d.
 * Rol: Admin/manager (requireOperatorStaff). Prereq: reserva confirmed con seña
 * deposit_status='paid', inicio ya pasado, vinculada a un jugador que YA tiene 1
 * no-show previo dentro de NO_SHOW_STRIKE_WINDOW_DAYS=90 días — así esta 2da
 * ausencia dispara el softban de NO_SHOW_SOFTBAN_DAYS=14 días.
 *
 * Usa un jugador DEDICADO (no el E2E_PLAYER_ID compartido con otras bandas/specs)
 * para no contaminar el fixture canónico con un softban real — otros specs que
 * loguean como e2e-player@turnogol.test asumen que NO está bloqueado.
 *
 * CASO DE PLATA — no se limpia nada al final (queda vivo para verificadores).
 * Evidencia: src/app/(admin)/reservas/actions.ts:199-234 (markNoShowAction),
 * src/modules/bookings/booking.cancellation.ts:412-463 (handleNoShow),
 * src/modules/relationships/ptr.service.ts:20,39-138 (applyNoShowStrike/extendSoftban),
 * src/shared/constants.ts:23,29 (NO_SHOW_STRIKE_WINDOW_DAYS, NO_SHOW_SOFTBAN_DAYS).
 */
import { randomUUID } from 'node:crypto'
import { subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { test, expect } from '../../fixtures'
import {
  insertBookingServiceRole,
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
} from '../../_helpers/booking-seed'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

function yesterdayDateIsoArt(): string {
  return formatInTimeZone(subDays(new Date(), 1), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd')
}

test.describe('TG-HP-212 — marcar ausente + softban', () => {
  test('admin marca ausente una 2da vez dentro de 90 días → captura seña + softban 14d', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const yesterday = yesterdayDateIsoArt()
    const playerId = randomUUID()
    const playerEmail = `qa-hp-212-${playerId.slice(0, 8)}@turnogol.test`

    // Jugador dedicado con 1 no-show previo (ayer, dentro de la ventana de 90d)
    // ya registrado en player_tenant_relationships — así esta 2da ausencia
    // dispara el softban.
    await runSql(
      `INSERT INTO players (id, email, first_name, last_name, status, agreed_to_terms_at, terms_version)
       VALUES ($1, $2, 'QA', 'Softban212', 'active', NOW(), 'v1')`,
      [playerId, playerEmail],
    )
    await runSql(
      `INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count, noshow_count, last_no_show_at)
       VALUES ($1, $2, 1, 1, NOW() - interval '10 days')`,
      [E2E_TENANT_ID, playerId],
    )

    const depositAmount = 50_000 // $500
    const bookingId = await insertBookingServiceRole(supabase, {
      tenantId: E2E_TENANT_ID,
      courtId: E2E_COURT_ID,
      date: yesterday,
      timeStart: '11:00:00',
      timeEnd: '12:00:00',
      status: 'confirmed',
      playerId,
      depositAmount,
      depositStatus: 'paid',
    })

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto(`/reservas/${bookingId}`)
      await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
        timeout: 15_000,
      })

      await page.getByRole('button', { name: 'Marcar ausente' }).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('heading', { name: 'Marcar como ausente' })).toBeVisible()
      await expect(page.getByText(/segunda ausencia en 90 días/i)).toBeVisible()

      await page.getByRole('dialog').getByRole('button', { name: 'Marcar ausente' }).click()

      await expect(page.getByText('Marcada como ausente', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
      await expect(page.locator('dd').filter({ hasText: 'Ausente' })).toBeVisible({
        timeout: 10_000,
      })

      // ── DB assertion ──────────────────────────────────────────────────────
      const { data: bookingRow, error: bookingErr } = await supabase
        .from('bookings')
        .select('status, deposit_status')
        .eq('id', bookingId)
        .single()
      expect(bookingErr).toBeNull()
      expect(bookingRow?.status).toBe('no_show')
      expect(bookingRow?.deposit_status).toBe('captured')

      const ptrRows = await runSql<{ noshow_count: number; last_no_show_at: string }>(
        `SELECT noshow_count, last_no_show_at FROM player_tenant_relationships
         WHERE tenant_id = $1 AND player_id = $2`,
        [E2E_TENANT_ID, playerId],
      )
      expect(ptrRows[0]?.noshow_count).toBe(2)

      const banRows = await runSql<{
        reason: string
        banned_until: string
        banned_by: string | null
      }>(
        `SELECT reason, banned_until, banned_by FROM tenant_player_bans
         WHERE tenant_id = $1 AND player_id = $2
           AND (banned_until IS NULL OR banned_until > NOW())`,
        [E2E_TENANT_ID, playerId],
      )
      expect(banRows).toHaveLength(1)
      expect(banRows[0]?.reason).toMatch(/Ausencias reiteradas/i)
      expect(banRows[0]?.banned_by).toBeNull()
      const bannedUntilMs = new Date(banRows[0]!.banned_until).getTime()
      const expectedMs = Date.now() + 14 * 24 * 60 * 60 * 1000
      // Tolerancia de 5 min por el tiempo real que corre el test.
      expect(Math.abs(bannedUntilMs - expectedMs)).toBeLessThan(5 * 60_000)

      await writeEvidence('TG-HP-212', {
        status: 'pass',
        playerId,
        playerEmail,
        bookingId,
        bookingRow,
        ptr: ptrRows[0],
        ban: banRows[0],
        notes:
          'Caso de plata: player + PTR + tenant_player_bans + booking quedan vivos en DB. Jugador dedicado, no el E2E_PLAYER_ID compartido.',
      })
    } finally {
      await context.close()
    }
  })
})
