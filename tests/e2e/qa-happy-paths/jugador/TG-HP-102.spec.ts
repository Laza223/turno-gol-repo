import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'
import { makeServiceClient, E2E_PLAYER_ID, E2E_PLAYER_EMAIL } from '../../_helpers/player-seed'
import { fetchMagicLinkFromInbucket } from '../../_helpers/inbucket'

/**
 * TG-HP-102 — Login jugador EXISTENTE /ingresar.
 * Rol: Jugador. Prereq: sin sesión activa; jugador ya existe (e2e-player@turnogol.test).
 *
 * Página anónima (NO usa playerStorageState — es justamente el flujo de login).
 * Flujo REAL de magic link vía Inbucket (:54324) — ver fetchMagicLinkFromInbucket
 * (_helpers/inbucket.ts): primer uso AUTOMATIZADO de la REST API de Inbucket en este repo
 * (hasta ahora solo se había verificado a mano/MCP browser, ver
 * docs/planning/protocolo-lanzamiento/AUDIT_02_auth.md). Un verificador con
 * contexto fresco debería correr este spec primero y tratar la parte de
 * Inbucket como no probada hasta confirmarlo en runtime.
 *
 * Evidence anchors: ingresar/page.tsx:10-18, IngresarForm.tsx:266-268,292,353-356,
 * ingresar/actions.ts:25-56, api/auth/callback/route.ts:62-148,279-283,
 * lib/auth-success.ts:43-49, verify/VerifyView.tsx:127-131,335-358.
 */

test.describe('TG-HP-102 — Login jugador existente /ingresar', () => {
  test('pide el enlace, lo sigue desde Inbucket → sesión activa en /mis-reservas', async ({
    browser,
  }) => {
    const sb = makeServiceClient()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    try {
      await page.goto('/ingresar')
      await expect(page.getByRole('heading', { name: 'Accedé a tu cuenta' })).toBeVisible()

      await page.locator('#email').fill(E2E_PLAYER_EMAIL)

      const sinceMs = Date.now()
      await page.getByRole('button', { name: 'Mandame el enlace' }).click()
      // Anti-doble-submit: disabled={pending} vía useFormStatus (submit-button.tsx:28-37; botón en IngresarForm.tsx:266-268).

      await expect(page.getByRole('heading', { name: 'Revisá tu email', level: 1 })).toBeVisible({
        timeout: 10_000,
      })
      await expect(
        page.getByText(`Si ${E2E_PLAYER_EMAIL} tiene cuenta, te enviamos un enlace para entrar.`),
      ).toBeVisible()

      const link = await fetchMagicLinkFromInbucket(E2E_PLAYER_EMAIL, sinceMs)
      await page.goto(link)

      // Callback reconoce is_player=true ya seteado (seed) → NO reescribe agreed_terms,
      // redirige a /verify?intent=login (next default '/mis-reservas').
      await expect(page.getByRole('heading', { name: '¡Listo!' })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('Iniciaste sesión correctamente.')).toBeVisible()

      await page.getByRole('link', { name: 'Ir a mis reservas' }).click()
      await page.waitForURL(/\/mis-reservas/, { timeout: 10_000 })
      await expect(page.getByRole('heading', { name: 'Mis reservas', level: 1 })).toBeVisible()

      // DB: NO se insertó un jugador nuevo — sigue siendo la misma fila (id + first_name intactos).
      const { data: player, error } = await sb
        .from('players')
        .select('id, email, first_name, last_name, last_login_at')
        .eq('email', E2E_PLAYER_EMAIL)
        .single()

      expect(error).toBeNull()
      expect(player?.id).toBe(E2E_PLAYER_ID)
      expect(player?.first_name).toBe('E2E') // sin pisar el perfil existente
      expect(new Date(player!.last_login_at!).getTime()).toBeGreaterThanOrEqual(sinceMs - 2000)

      await writeEvidence('TG-HP-102', {
        status: 'pass',
        db: player,
        finalUrl: page.url(),
        notes:
          'Flujo real vía Inbucket (fetchMagicLinkFromInbucket) — primer uso automatizado de la ' +
          'REST API de Inbucket en este repo, verificar en runtime. getOrCreatePlayer tomó la ' +
          'rama existing.length>0 (solo bump de last_login_at, sin INSERT).',
      })
    } finally {
      await ctx.close()
    }
  })
})
