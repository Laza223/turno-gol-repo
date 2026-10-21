import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures'
import type { Browser, Page } from '@playwright/test'
import { runSql } from './qa-happy-paths/_qa/evidence'
import {
  E2E_COURT_ID,
  cleanupBookingsByIds,
  makeServiceClient,
  tomorrowDateIsoArt,
} from './_helpers/booking-seed'
import { fetchMagicLinkFromInbucket } from './_helpers/inbucket'

/**
 * La reserva se confirma sola al volver del ingreso (PR 2.3b2). Complejo Demo, sin seña.
 *
 * Entra por magic link de verdad (Inbucket :54324). Cada caso usa su hora y un email nuevo, así no
 * pisa a los demás specs (que usan 10, 12, 13, 16 y 17) ni se pisan entre sí.
 *
 * - mismo navegador: el enlace aterriza en /exito, sin /verify en el medio;
 * - otro navegador con el mismo mail (decisión del dueño: funciona siempre): también;
 * - vínculo adulterado o de otro email: la pantalla normal, con el botón, sin reserva;
 * - recargar o volver a abrir la pantalla: una sola fila en la base.
 */

const TENANT_SLUG = 'e2e-complejo-demo'
const EXITO = /\/reserva\/([0-9a-f-]{36})\/exito/

const reservarUrl = (date: string, time: string) =>
  `/${TENANT_SLUG}/reservar?court=${E2E_COURT_ID}&date=${date}&time=${time}&dur=60`

const newEmail = () => `e2e-intent-${randomUUID().slice(0, 8)}@turnogol.test`

/** Llena el ingreso de /reservar y pide el enlace. Devuelve el enlace del mail. */
async function requestLink(page: Page, email: string, date: string, time: string) {
  await page.goto(reservarUrl(date, time))
  // Sin sesión el botón de acción abre el ingreso en un modal.
  await page.getByRole('button', { name: 'Reservar' }).click()
  await expect(page.getByRole('heading', { name: 'Entrá para reservar' })).toBeVisible()
  // Sin seña: la línea de apoyo promete la confirmación.
  await expect(page.getByText('Entrás y la reserva queda confirmada.')).toBeVisible()

  await page.getByLabel('Email').fill(email)
  const sinceMs = Date.now()
  await page.getByRole('button', { name: 'Continuar con mi email' }).click()

  await expect(page.getByRole('heading', { name: 'Revisá tu email', level: 2 })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('Cuando lo toques, tu reserva queda confirmada.')).toBeVisible()
  return fetchMagicLinkFromInbucket(email, sinceMs)
}

/** Las filas vivas de ese turno, por jugador (por email), vía service role. */
async function bookingsOf(email: string, date: string, time: string) {
  return runSql<{ id: string; status: string }>(
    `SELECT b.id, b.status
       FROM bookings b JOIN players p ON p.id = b.player_id
      WHERE p.email = $1 AND b.court_id = $2 AND b.date = $3 AND b.time_start = $4::time`,
    [email.toLowerCase(), E2E_COURT_ID, date, time],
  )
}

async function cleanup(email: string, ids: string[]) {
  const sb = makeServiceClient()
  await cleanupBookingsByIds(sb, ids)
  await sb.from('players').delete().eq('email', email.toLowerCase())
  const authRows = await runSql<{ id: string }>('SELECT id FROM auth.users WHERE email = $1', [
    email.toLowerCase(),
  ])
  for (const row of authRows) await sb.auth.admin.deleteUser(row.id)
}

/** Un navegador nuevo, sin cookies. */
async function freshPage(browser: Browser) {
  const ctx = await browser.newContext()
  return { ctx, page: await ctx.newPage() }
}

test.describe('Reserva que se confirma sola al volver del ingreso', () => {
  test('mismo navegador: el enlace del mail aterriza en /exito, sin pasar por /verify', async ({
    browser,
  }) => {
    const email = newEmail()
    const date = tomorrowDateIsoArt()
    const time = '15:00'
    const { ctx, page } = await freshPage(browser)
    const ids: string[] = []

    try {
      const link = await requestLink(page, email, date, time)
      const visited: string[] = []
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname)
      })

      await page.goto(link)
      await expect(page).toHaveURL(EXITO, { timeout: 20_000 })
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible()
      // Directo: nunca pasó por la pantalla de "¡Cuenta confirmada!".
      expect(visited).not.toContain('/verify')

      const rows = await bookingsOf(email, date, time)
      ids.push(...rows.map((r) => r.id))
      expect(rows).toHaveLength(1)
      expect(rows[0]!.status).toBe('confirmed')
      // El vínculo no queda en la barra de direcciones.
      expect(page.url()).not.toContain('booking_intent')
    } finally {
      await ctx.close()
      await cleanup(email, ids)
    }
  })

  test('otro navegador con el mismo mail: también se confirma sola', async ({ browser }) => {
    const email = newEmail()
    const date = tomorrowDateIsoArt()
    const time = '14:00'
    const gate = await freshPage(browser)
    const other = await freshPage(browser)
    const ids: string[] = []

    try {
      const link = await requestLink(gate.page, email, date, time)

      // El mail se abre en OTRO navegador, sin ninguna cookie del que pidió el enlace.
      await other.page.goto(link)
      await expect(other.page).toHaveURL(EXITO, { timeout: 20_000 })
      await expect(other.page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible()

      const rows = await bookingsOf(email, date, time)
      ids.push(...rows.map((r) => r.id))
      expect(rows).toHaveLength(1)
      expect(rows[0]!.status).toBe('confirmed')
      // El navegador que pidió el enlace sigue en "Revisá tu email": no se enteró de nada.
      await expect(gate.page.getByRole('heading', { name: 'Revisá tu email' })).toBeVisible()
    } finally {
      await gate.ctx.close()
      await other.ctx.close()
      await cleanup(email, ids)
    }
  })

  test('vínculo adulterado: la pantalla normal con el botón, y NO se reserva nada', async ({
    browser,
  }) => {
    const email = newEmail()
    const date = tomorrowDateIsoArt()
    const time = '18:00'
    const { ctx, page } = await freshPage(browser)
    const ids: string[] = []

    try {
      const link = new URL(await requestLink(page, email, date, time))
      // Se cambia la firma del vínculo dentro del `next` del enlace (el token_hash queda intacto).
      const next = new URL(link.searchParams.get('next')!, 'http://localhost')
      const token = next.searchParams.get('booking_intent')!
      const flipped = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`
      next.searchParams.set('booking_intent', flipped)
      link.searchParams.set('next', `${next.pathname}${next.search}`)

      await page.goto(link.toString())
      // Entró (sesión) pero NO confirmó sola: está en la pantalla de confirmar, con su botón.
      await expect(page).toHaveURL(new RegExp(`/${TENANT_SLUG}/reservar`), { timeout: 20_000 })
      await expect(page.getByRole('button', { name: 'Reservar' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Entrá para reservar' })).toHaveCount(0)
      await expect(page.getByText('Confirmando tu reserva…')).toHaveCount(0)
      // Y la pantalla dice qué hacer: la promesa de "queda confirmada" no se cumplió.
      await expect(page.getByText('Tocá Reservar para terminar.')).toBeVisible()
      // Dar tiempo a que un envío indebido ocurra antes de mirar la base.
      await page.waitForTimeout(1500)
      expect(await bookingsOf(email, date, time)).toHaveLength(0)

      // Y el botón sigue funcionando a mano.
      await page.getByRole('button', { name: 'Reservar' }).click()
      await expect(page).toHaveURL(EXITO, { timeout: 20_000 })
      ids.push(...(await bookingsOf(email, date, time)).map((r) => r.id))
      expect(ids).toHaveLength(1)
    } finally {
      await ctx.close()
      await cleanup(email, ids)
    }
  })

  test('vínculo de otro email: la pantalla normal con el botón, sin reservar', async ({
    browser,
    playerStorageState,
  }) => {
    const owner = newEmail()
    const date = tomorrowDateIsoArt()
    const time = '19:00'
    const gate = await freshPage(browser)
    const ids: string[] = []
    // Otra persona, ya con sesión (el jugador del seed), abre un enlace que no es suyo.
    const intruder = await browser.newContext()
    await intruder.addCookies(JSON.parse(playerStorageState).cookies)

    try {
      const link = new URL(await requestLink(gate.page, owner, date, time))
      const next = link.searchParams.get('next')! // trae el booking_intent del dueño del mail

      const page = await intruder.newPage()
      await page.goto(next)
      await expect(page.getByRole('button', { name: 'Reservar' })).toBeVisible()
      await expect(page.getByText('Confirmando tu reserva…')).toHaveCount(0)
      await expect(page.getByText('Tocá Reservar para terminar.')).toBeVisible()
      await page.waitForTimeout(1500)
      await expect(page).toHaveURL(new RegExp(`/${TENANT_SLUG}/reservar`))
      const rows = await runSql<{ n: string }>(
        `SELECT count(*)::text AS n FROM bookings
          WHERE court_id = $1 AND date = $2 AND time_start = $3::time`,
        [E2E_COURT_ID, date, time],
      )
      expect(rows[0]!.n).toBe('0')
    } finally {
      await gate.ctx.close()
      await intruder.close()
      await cleanup(owner, ids)
    }
  })

  test('recargar o volver a abrir la pantalla: una sola fila, y vuelve a /exito', async ({
    browser,
  }) => {
    const email = newEmail()
    const date = tomorrowDateIsoArt()
    const time = '11:00'
    const { ctx, page } = await freshPage(browser)
    const ids: string[] = []

    try {
      const link = await requestLink(page, email, date, time)
      await page.goto(link)
      await expect(page).toHaveURL(EXITO, { timeout: 20_000 })
      ids.push(...(await bookingsOf(email, date, time)).map((r) => r.id))
      expect(ids).toHaveLength(1)

      // Volver a la pantalla de confirmar (Atrás, un favorito, una recarga): el turno es suyo, así
      // que va a /exito en vez de decirle "ya no está disponible".
      await page.goto(reservarUrl(date, time))
      await expect(page).toHaveURL(EXITO, { timeout: 15_000 })
      await expect(page.getByText('Ese turno ya no está disponible')).toHaveCount(0)
      await page.reload()
      await expect(page).toHaveURL(EXITO)

      expect(await bookingsOf(email, date, time)).toHaveLength(1)
    } finally {
      await ctx.close()
      await cleanup(email, ids)
    }
  })
})
