import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'
import { makeServiceClient, E2E_PLAYER_ID, E2E_PLAYER_EMAIL } from '../../_helpers/player-seed'

/**
 * TG-HP-102 — Login jugador EXISTENTE /ingresar.
 * Rol: Jugador. Prereq: sin sesión activa; jugador ya existe (e2e-player@turnogol.test).
 *
 * Página anónima (NO usa playerStorageState — es justamente el flujo de login).
 * Flujo REAL de magic link vía Inbucket (:54324) — ver fetchMagicLinkFromInbucket
 * más abajo: primer uso AUTOMATIZADO de la REST API de Inbucket en este repo
 * (hasta ahora solo se había verificado a mano/MCP browser, ver
 * docs/planning/protocolo-lanzamiento/AUDIT_02_auth.md). Un verificador con
 * contexto fresco debería correr este spec primero y tratar la parte de
 * Inbucket como no probada hasta confirmarlo en runtime.
 *
 * Evidence anchors: ingresar/page.tsx:100, IngresarForm.tsx:81-84,92-105,150,
 * ingresar/actions.ts:20-45, api/auth/callback/route.ts:73-100,
 * lib/auth-success.ts:21-23, verify/page.tsx:21-24.
 */

const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324'

type InboxListEntry = { id: string; date: string }
type InboxMessage = { body?: { text?: string; html?: string } }

function mailboxOf(email: string): string {
  return email.split('@')[0]!.toLowerCase()
}

/**
 * Lee el mail más reciente llegado a `mailbox` después de `sinceMs` vía la
 * REST API v1 de Inbucket (bundlada con `supabase start`) y devuelve la URL
 * del magic link (`.../api/auth/callback?...&token_hash=...`).
 */
async function fetchMagicLinkFromInbucket(email: string, sinceMs: number): Promise<string> {
  const mailbox = mailboxOf(email)
  const deadline = Date.now() + 20_000
  let lastErr: unknown

  while (Date.now() < deadline) {
    try {
      const listRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`)
      if (listRes.ok) {
        const messages = (await listRes.json()) as InboxListEntry[]
        const fresh = messages.filter((m) => new Date(m.date).getTime() >= sinceMs - 2000)
        const latest = fresh[fresh.length - 1]
        if (latest) {
          const msgRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${latest.id}`)
          if (msgRes.ok) {
            const msg = (await msgRes.json()) as InboxMessage
            const raw = msg.body?.text || msg.body?.html || ''
            const match = /https?:\/\/[^\s"<]+\/api\/auth\/callback\?[^\s"<]+/.exec(raw)
            if (match) return match[0].replace(/&amp;/g, '&')
          }
        }
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(
    `fetchMagicLinkFromInbucket: no llegó mail a ${email} (mailbox=${mailbox}) en 20s. Último error: ${String(lastErr)}`,
  )
}

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
      await page.getByRole('button', { name: 'Enviarme el enlace' }).click()
      // Anti-doble-submit: disabled={pending} vía useFormStatus (IngresarForm.tsx:136-154).

      await expect(page.getByRole('heading', { name: 'Revisá tu email', level: 1 })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(`Te enviamos un enlace de acceso a ${E2E_PLAYER_EMAIL}.`)).toBeVisible()

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
