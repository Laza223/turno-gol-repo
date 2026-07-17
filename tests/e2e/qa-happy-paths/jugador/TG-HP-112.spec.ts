import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { makeServiceClient, E2E_PLAYER_ID, E2E_TENANT_ID } from '../../_helpers/player-seed'

/**
 * TG-HP-112 — Favoritos (player_favorites / FavoritesList).
 * Rol: Jugador logueado. Prereq: al menos 1 tenant público visible en
 * /explorar (tenant Demo, "E2E Complejo Demo").
 *
 * Evidence anchors: FavoriteButton.tsx:22-111, api/player/favorites/toggle/route.ts:16-49,
 * FavoritesList.tsx:11-56, perfil/page.tsx:42-57,79,124-129, ProfileHeaderNav.tsx:7.
 */

const TENANT_NAME = 'E2E Complejo Demo'

test.describe('TG-HP-112 — Favoritos', () => {
  test('marcar/desmarcar favorito desde /explorar se refleja en /perfil?tab=favoritos', async ({
    browser,
    playerStorageState,
  }) => {
    const sb = makeServiceClient()
    // Defensivo: barre cualquier favorito residual de una corrida previa.
    await sb.from('player_favorites').delete().eq('player_id', E2E_PLAYER_ID).eq('tenant_id', E2E_TENANT_ID)

    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto(`/explorar?q=${encodeURIComponent(TENANT_NAME)}`)

      const card = page.locator('article').filter({ hasText: TENANT_NAME })
      await expect(card.getByRole('heading', { name: TENANT_NAME })).toBeVisible()

      const heartBtn = card.getByRole('button', { name: 'Guardar en favoritos' })
      await expect(heartBtn).toBeVisible()
      // FavoriteButton es OPTIMISTA: togglea la UI ANTES de que resuelva el fetch
      // (FavoriteButton.tsx:44). Esperar la respuesta REAL del POST antes de leer la
      // DB — si no, el SELECT corre en carrera con el insert server-side en vuelo.
      const [toggleRes] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/player/favorites/toggle') && r.request().method() === 'POST',
        ),
        heartBtn.click(),
      ])
      expect(toggleRes.ok()).toBeTruthy()

      await expect(card.getByRole('button', { name: 'Quitar de favoritos' })).toBeVisible({
        timeout: 5_000,
      })

      const { data: favRow, error: favErr } = await sb
        .from('player_favorites')
        .select('player_id, tenant_id')
        .eq('player_id', E2E_PLAYER_ID)
        .eq('tenant_id', E2E_TENANT_ID)
        .maybeSingle()
      expect(favErr).toBeNull()
      expect(favRow).toBeTruthy()

      // /perfil?tab=favoritos lista el tenant recién marcado.
      await page.goto('/perfil?tab=favoritos')
      await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Favoritos' })).toHaveAttribute('aria-current', 'page')
      const profileCard = page.locator('article').filter({ hasText: TENANT_NAME })
      await expect(profileCard.getByRole('heading', { name: TENANT_NAME })).toBeVisible()

      // Destogglear desde /perfil?tab=favoritos (mismo patrón optimista → esperar POST).
      const [untoggleRes] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/player/favorites/toggle') && r.request().method() === 'POST',
        ),
        profileCard.getByRole('button', { name: 'Quitar de favoritos' }).click(),
      ])
      expect(untoggleRes.ok()).toBeTruthy()
      await expect(profileCard.getByRole('button', { name: 'Guardar en favoritos' })).toBeVisible({
        timeout: 5_000,
      })

      const { data: favRowAfter, error: favErrAfter } = await sb
        .from('player_favorites')
        .select('player_id')
        .eq('player_id', E2E_PLAYER_ID)
        .eq('tenant_id', E2E_TENANT_ID)
        .maybeSingle()
      expect(favErrAfter).toBeNull()
      expect(favRowAfter).toBeNull()

      // El destoggle es optimista en la card, pero la LISTA server-rendered de
      // /perfil solo refleja el cambio en la próxima navegación (no hay
      // revalidatePath explícito, per manual) — recargamos para verlo.
      await page.reload()
      await expect(page.getByText('Sin favoritos todavía')).toBeVisible()
      await expect(page.getByRole('heading', { name: TENANT_NAME })).not.toBeVisible()

      await writeEvidence('TG-HP-112', {
        status: 'pass',
        db_after_favorite: favRow,
        db_after_unfavorite: favRowAfter,
        notes:
          'Toggle real vía POST /api/player/favorites/toggle; player_favorites RLS por ' +
          'app.current_player_id. Round-trip completo: marcar en /explorar, ver en /perfil, ' +
          'desmarcar en /perfil, desaparece tras reload.',
      })
    } finally {
      await ctx.close()
      await sb.from('player_favorites').delete().eq('player_id', E2E_PLAYER_ID).eq('tenant_id', E2E_TENANT_ID)
    }
  })
})
