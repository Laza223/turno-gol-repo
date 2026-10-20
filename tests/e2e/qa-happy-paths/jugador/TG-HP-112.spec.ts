import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { makeServiceClient, E2E_PLAYER_ID, E2E_TENANT_ID } from '../../_helpers/player-seed'

/**
 * TG-HP-112 — Favoritos (player_favorites / FavoritesList en /configuracion).
 * Rol: Jugador logueado. Prereq: al menos 1 tenant público visible en
 * /explorar (tenant Demo, "E2E Complejo Demo").
 *
 * Evidence anchors: FavoriteButton.tsx, api/player/favorites/toggle/route.ts,
 * configuracion/FavoritesList.tsx, configuracion/page.tsx (loadFavorites), perfil/page.tsx (redirect).
 */

const TENANT_NAME = 'E2E Complejo Demo'

test.describe('TG-HP-112 — Favoritos', () => {
  test('marcar en /explorar se ve en /configuracion; quitar saca la fila', async ({
    browser,
    playerStorageState,
  }) => {
    const sb = makeServiceClient()
    // Defensivo: barre cualquier favorito residual de una corrida previa.
    await sb
      .from('player_favorites')
      .delete()
      .eq('player_id', E2E_PLAYER_ID)
      .eq('tenant_id', E2E_TENANT_ID)

    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto(`/explorar?q=${encodeURIComponent(TENANT_NAME)}`)

      const card = page.locator('article').filter({ hasText: TENANT_NAME })
      await expect(card.getByRole('heading', { name: TENANT_NAME })).toBeVisible()

      const heartBtn = card.getByRole('button', { name: 'Guardar en favoritos' })
      await expect(heartBtn).toBeVisible()
      // FavoriteButton es OPTIMISTA: togglea la UI ANTES de que resuelva el fetch.
      // Esperar la respuesta REAL del POST antes de leer la DB — si no, el SELECT
      // corre en carrera con el insert server-side en vuelo.
      const [toggleRes] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes('/api/player/favorites/toggle') && r.request().method() === 'POST',
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

      // /perfil?tab=favoritos redirige a la sección Favoritos de la Cuenta, que lista el tenant.
      await page.goto('/perfil?tab=favoritos')
      await expect(page).toHaveURL(/\/configuracion#favoritos$/)
      await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()
      const favorites = page.locator('section#favoritos')
      await expect(favorites.getByRole('link', { name: new RegExp(TENANT_NAME) })).toBeVisible()
      // Fila compacta: sin tarjeta ni precios.
      await expect(favorites.locator('article')).toHaveCount(0)

      // Quitar desde la Cuenta: la fila desaparece al instante (sin recargar).
      const [untoggleRes] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes('/api/player/favorites/toggle') && r.request().method() === 'POST',
        ),
        favorites.getByRole('button', { name: `Quitar ${TENANT_NAME} de favoritos` }).click(),
      ])
      expect(untoggleRes.ok()).toBeTruthy()
      await expect(favorites.getByRole('link', { name: new RegExp(TENANT_NAME) })).toHaveCount(0)
      await expect(favorites.getByText('Todavía no guardaste ningún complejo.')).toBeVisible()

      const { data: favRowAfter, error: favErrAfter } = await sb
        .from('player_favorites')
        .select('player_id')
        .eq('player_id', E2E_PLAYER_ID)
        .eq('tenant_id', E2E_TENANT_ID)
        .maybeSingle()
      expect(favErrAfter).toBeNull()
      expect(favRowAfter).toBeNull()

      // Recargar confirma que la lista server-rendered ya no lo trae.
      await page.reload()
      await expect(page.getByText('Todavía no guardaste ningún complejo.')).toBeVisible()

      await writeEvidence('TG-HP-112', {
        status: 'pass',
        db_after_favorite: favRow,
        db_after_unfavorite: favRowAfter,
        notes:
          'Toggle real vía POST /api/player/favorites/toggle; player_favorites RLS por ' +
          'app.current_player_id. Round-trip completo: marcar en /explorar, ver en /configuracion, ' +
          'quitar en /configuracion (la fila desaparece al instante), sigue vacío tras reload.',
      })
    } finally {
      await ctx.close()
      await sb
        .from('player_favorites')
        .delete()
        .eq('player_id', E2E_PLAYER_ID)
        .eq('tenant_id', E2E_TENANT_ID)
    }
  })
})
