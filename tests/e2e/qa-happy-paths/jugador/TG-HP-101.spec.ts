import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { makeServiceClient, E2E_COURT_ID } from '../../_helpers/player-seed'
import { tomorrowDateIsoArt } from '../../_helpers/booking-seed'

/**
 * TG-HP-101 — Alta jugador NUEVO al reservar.
 * Rol: Jugador. Prereq: sin sesión, email nuevo (sin fila en `players`), slot
 * libre tenant Demo cancha ...010.
 *
 * Página anónima. Flujo REAL de magic link vía Inbucket (:54324) — ver
 * fetchMagicLinkFromInbucket más abajo: primer uso AUTOMATIZADO de la REST
 * API de Inbucket en este repo (hasta ahora solo se había verificado a
 * mano/MCP browser, ver docs/planning/protocolo-lanzamiento/AUDIT_01_public.md
 * y AUDIT_02_auth.md). Un verificador con contexto fresco debería correr este
 * spec primero y tratar la parte de Inbucket como no probada hasta
 * confirmarlo en runtime.
 *
 * Evidence anchors: reservar/page.tsx:118-131, LoginGate.tsx:41-42,50-51,68-71,
 * reservar/actions.ts:49-80, api/auth/callback/route.ts:54,71-100,
 * player.service.ts:24-65, verify/page.tsx:16-19,117-121,
 * verify/SuccessRedirect.tsx:5,19-21,32-34.
 */

const TENANT_SLUG = 'e2e-complejo-demo'
const TIME = '12:00'
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

function reservarUrl(date: string): string {
  return `/${TENANT_SLUG}/reservar?court=${E2E_COURT_ID}&date=${date}&time=${TIME}&dur=60`
}

test.describe('TG-HP-101 — Alta jugador nuevo al reservar', () => {
  test('completa el gate de email, confirma el magic link y vuelve logueado a /reservar', async ({
    browser,
  }) => {
    // Email nuevo por corrida — no puede haber fila previa en `players`.
    const newEmail = `e2e-qa-newplayer-${randomUUID().slice(0, 8)}@turnogol.test`
    const date = tomorrowDateIsoArt()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    try {
      await page.goto(reservarUrl(date))
      await expect(page.getByRole('heading', { name: 'Confirmá tu reserva' })).toBeVisible()

      // Sin sesión → LoginGate (no ConfirmBookingButton).
      await expect(page.getByRole('heading', { name: 'Confirmá con tu email' })).toBeVisible()

      await page.locator('input[name="firstName"]').fill('Juan')
      await page.locator('input[name="lastName"]').fill('Pérez')
      await page.locator('input[name="email"]').fill(newEmail)
      await page.locator('input[name="terms"]').check()

      const sinceMs = Date.now()
      await page.getByRole('button', { name: 'Continuar con email' }).click()
      // Anti-doble-submit: disabled={pending} vía useFormStatus (LoginGate.tsx:16-22).

      await expect(page.getByRole('heading', { name: 'Revisá tu email', level: 2 })).toBeVisible({
        timeout: 10_000,
      })
      await expect(
        page.getByText(`Te enviamos un enlace a ${newEmail}. Hacé click para confirmar tu reserva.`),
      ).toBeVisible()

      const link = await fetchMagicLinkFromInbucket(newEmail, sinceMs)
      await page.goto(link)

      // Callback: verifyOtp + getOrCreatePlayer (INSERT nuevo) + redirect a /verify?intent=booking.
      await expect(page.getByRole('heading', { name: '¡Cuenta confirmada!' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('Volvé para terminar tu reserva.')).toBeVisible()

      await page.getByRole('link', { name: 'Continuar con mi reserva' }).click()

      // Aterriza de nuevo en /reservar, ahora con sesión → ConfirmBookingButton en vez de LoginGate.
      await page.waitForURL(new RegExp(`/${TENANT_SLUG}/reservar`), { timeout: 10_000 })
      await expect(
        page.getByRole('button', { name: /Confirmar reserva|Pagar seña y reservar/ }),
      ).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('heading', { name: 'Confirmá con tu email' })).not.toBeVisible()

      // DB: fila NUEVA en players (email lower-cased, nombre, declaración jurada).
      const sb = makeServiceClient()
      const { data: player, error } = await sb
        .from('players')
        .select('id, email, first_name, last_name, agreed_to_terms_at, terms_version, status')
        .eq('email', newEmail.toLowerCase())
        .single()

      expect(error).toBeNull()
      expect(player?.email).toBe(newEmail.toLowerCase())
      expect(player?.first_name).toBe('Juan')
      expect(player?.last_name).toBe('Pérez')
      expect(player?.agreed_to_terms_at).toBeTruthy()
      expect(player?.terms_version).toBeTruthy()
      expect(player?.status).toBe('active')

      await writeEvidence('TG-HP-101', {
        status: 'pass',
        newEmail,
        db: player,
        finalUrl: page.url(),
        notes:
          'Flujo real vía Inbucket (fetchMagicLinkFromInbucket) — primer uso automatizado de la ' +
          'REST API de Inbucket en este repo, verificar en runtime. getOrCreatePlayer tomó la ' +
          'rama INSERT (email nuevo, generado por corrida con randomUUID).',
      })
    } finally {
      await ctx.close()
      // Limpieza: no es caso de plata — el email es sintético por corrida, se borra siempre.
      const sb = makeServiceClient()
      await sb.from('players').delete().eq('email', newEmail.toLowerCase())
      const authRows = await runSql<{ id: string }>(
        'SELECT id FROM auth.users WHERE email = $1',
        [newEmail.toLowerCase()],
      )
      for (const row of authRows) {
        await sb.auth.admin.deleteUser(row.id)
      }
    }
  })
})
