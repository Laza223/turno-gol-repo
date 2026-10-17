import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { makeServiceClient, E2E_COURT_ID } from '../../_helpers/player-seed'
import { cleanupBookingsByIds, tomorrowDateIsoArt } from '../../_helpers/booking-seed'
import { fetchMagicLinkFromInbucket } from '../../_helpers/inbucket'

/**
 * TG-HP-101 — Alta jugador NUEVO al reservar.
 * Rol: Jugador. Prereq: sin sesión, email nuevo (sin fila en `players`), slot
 * libre tenant Demo cancha ...010.
 *
 * Página anónima. Flujo REAL de magic link vía Inbucket (:54324) — ver
 * `_helpers/inbucket.ts`. Desde el PR 2.3b2 el enlace del mail vuelve DIRECTO a la
 * pantalla de confirmar y, sin seña, la reserva se confirma sola: aterriza en
 * `/reserva/{id}/exito` (sin pasar por `/verify`). El caso fino de esa confirmación
 * (otro navegador, vínculo adulterado, recarga) está en `player-intent-confirm.spec.ts`.
 *
 * Evidence anchors: reservar/page.tsx (vínculo de intención), LoginGate.tsx (gate de email:
 * nombre + email, sin apellido; "Revisá tu email" con foco), reservar/actions.ts
 * (sendPlayerMagicLink, createBookingAndCheckout), api/auth/callback/route.ts
 * (provisionPlayerAndRedirect), reservar/components/AutoConfirm.tsx,
 * player.service.ts:24-65.
 */

const TENANT_SLUG = 'e2e-complejo-demo'
const TIME = '12:00'

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
    let bookingId: string | undefined

    try {
      await page.goto(reservarUrl(date))
      await expect(page.getByRole('heading', { name: 'Confirmá tu reserva' })).toBeVisible()

      // Sin sesión → LoginGate (no ConfirmBookingButton). Nombre y email, sin apellido.
      await expect(page.getByRole('heading', { name: 'Entrá para reservar' })).toBeVisible()
      await expect(page.getByLabel('Apellido')).toHaveCount(0)

      await page.getByLabel('Nombre').fill('Juan')
      await page.getByLabel('Email').fill(newEmail)
      await page.getByRole('checkbox').check()

      const sinceMs = Date.now()
      await page.getByRole('button', { name: 'Continuar con mi email' }).click()
      // Anti-doble-submit: SubmitButton deshabilita el botón mientras corre la action.

      const sentTitle = page.getByRole('heading', { name: 'Revisá tu email', level: 2 })
      await expect(sentTitle).toBeVisible({ timeout: 10_000 })
      // El foco pasa al título (el formulario desapareció).
      await expect(sentTitle).toBeFocused()
      await expect(page.getByText(`Te mandamos un enlace a ${newEmail}.`)).toBeVisible()
      // Sin seña: al tocar el enlace la reserva queda confirmada (no hay que volver a tocar nada).
      await expect(page.getByText('Cuando lo toques, tu reserva queda confirmada.')).toBeVisible()

      const link = await fetchMagicLinkFromInbucket(newEmail, sinceMs)
      await page.goto(link)

      // Callback: verifyOtp + getOrCreatePlayer (INSERT nuevo) + redirect DIRECTO a /reservar con el
      // vínculo firmado → confirma sola → /exito. Ya no hay "¡Cuenta confirmada!" en el medio.
      await expect(page).toHaveURL(/\/reserva\/[0-9a-f-]{36}\/exito/, { timeout: 20_000 })
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('heading', { name: '¡Cuenta confirmada!' })).toHaveCount(0)
      bookingId = /\/reserva\/([0-9a-f-]{36})\/exito/.exec(page.url())?.[1]

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
      // Sin apellido en la pantalla: el servidor lo recibe vacío.
      expect(player?.last_name ?? '').toBe('')
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
      // Limpieza: no es caso de plata — el email es sintético por corrida, se borra siempre. La
      // reserva primero: `bookings.player_id` apunta a la fila de `players`.
      const sb = makeServiceClient()
      if (bookingId) await cleanupBookingsByIds(sb, [bookingId])
      await sb.from('players').delete().eq('email', newEmail.toLowerCase())
      const authRows = await runSql<{ id: string }>('SELECT id FROM auth.users WHERE email = $1', [
        newEmail.toLowerCase(),
      ])
      for (const row of authRows) {
        await sb.auth.admin.deleteUser(row.id)
      }
    }
  })
})
