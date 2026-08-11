import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import { tomorrowDateIsoArt, E2E_STAFF_USER_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-228 — Push al admin cuando llega una reserva online con seña
 * confirmada (Web Push) + horario silencioso 00:00–08:00 (hora del complejo).
 * Rol: cualquier staff con push habilitado — se enqueuea a TODOS los
 * `push_subscriptions` del tenant, sin gate de rol (`push.service.ts:32-33`).
 *
 * ALCANCE (best-effort, ver nota abajo): el disparo real de
 * `notifyAdminPush` en este repo SOLO ocurre en el camino de reserva CON
 * seña confirmada por MP (webhook / expiry / reconcile — grep confirmado,
 * `notifyAdminBookingConfirmed` no se llama desde la reserva SIN seña de
 * confirmación instantánea). Por eso el disparo se hace vía el mismo tenant
 * "E2E Complejo Seña" (`...030`, `requires_deposit:true`) y el mismo checkout
 * mock MP que ya usa `tests/e2e/booking-flow.spec.ts` S1 (`mockPay` → POST
 * real a `/api/webhooks/mercadopago` → `MP_MOCK_ENABLED` procesa inline →
 * `notifyAdminBookingConfirmed` → `notifyAdminPush`). Se usa el jugador
 * seedeado (`playerStorageState`) — no hay otra forma de generar una reserva
 * online real. Fecha=mañana (día distinto al `getTestDate()`=+2d de
 * booking-flow.spec.ts) + horario 20:00 para minimizar choque de slot con
 * esa otra corrida; sigue existiendo riesgo residual de choque con otra
 * banda de la corrida QA que use el mismo court/fecha/hora — no controlable
 * desde este spec.
 *
 * Lo que se verifica es el ENQUEUE server-side (fila en `pgboss.job`,
 * `name='push-send'`, con `startafter` correcto según horario silencioso) —
 * NO la entrega end-to-end al navegador: no hay worker de pg-boss corriendo
 * en este harness (`pnpm dev` solamente) y VAPID puede no estar configurado
 * en este entorno. Si `VAPID_*` no está seteado se deja nota explícita — el
 * enqueue en sí NO depende de VAPID (`notifyAdminPush` no lo referencia,
 * solo lo usa el worker de envío real, `src/lib/web-push.ts`).
 *
 * Evidence anchors: src/modules/notifications/push.service.ts:1-157,
 *   src/modules/notifications/push-quiet-hours.ts:1-107,
 *   src/modules/payments/mp-webhook.handler.ts:206-210,
 *   src/app/mock-mp/checkout/actions.ts:43-99.
 */

const DEPOSIT_TENANT_ID = '00000000-0000-4000-8000-000000000030'
const DEPOSIT_TENANT_SLUG = 'e2e-complejo-sena'
const DEPOSIT_COURT_ID = '00000000-0000-4000-8000-000000000031'
const ART_TIMEZONE = 'America/Argentina/Buenos_Aires'

function reservarUrl(date: string, time: string): string {
  return `/${DEPOSIT_TENANT_SLUG}/reservar?court=${DEPOSIT_COURT_ID}&date=${date}&time=${time}&dur=60`
}

function extractBookingId(url: string): string {
  const m = /booking=([0-9a-f-]{36})/i.exec(url)
  if (!m?.[1]) throw new Error(`No se pudo extraer bookingId de la URL: ${url}`)
  return m[1]
}

/** Hora local (0-23) en la timezone del complejo — ART fijo UTC-3, sin DST. */
function localHour(now: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, hour: '2-digit' })
  return Number(dtf.format(now)) % 24
}

test.describe('TG-HP-228 — Push admin (reserva online con seña) + quiet hours', () => {
  test('reserva online con seña confirmada encola push-send para la suscripción del admin', async ({
    browser,
    playerStorageState,
  }) => {
    const vapidConfigured = Boolean(
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
    )

    const subscriptionEndpoint = `https://qa-hp-228.example.com/sub-${Date.now()}`
    const [sub] = await runSql<{ id: string }>(
      `INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        DEPOSIT_TENANT_ID,
        E2E_STAFF_USER_ID,
        subscriptionEndpoint,
        'qa-hp-228-p256dh-key',
        'qa-hp-228-auth-key',
      ],
    )
    const subscriptionId = sub?.id
    if (!subscriptionId) throw new Error('No se pudo sembrar push_subscriptions')

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    let bookingId: string | null = null

    try {
      await context.addCookies(JSON.parse(playerStorageState).cookies)
      const page = await context.newPage()

      const date = tomorrowDateIsoArt()
      const now = new Date()

      await page.goto(reservarUrl(date, '20:00'))
      await expect(page.getByRole('heading', { name: /confirmá tu reserva/i })).toBeVisible({
        timeout: 15_000,
      })

      await page.getByRole('button', { name: 'Pagar seña y reservar' }).click()
      await expect(page).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15_000 })
      bookingId = extractBookingId(page.url())

      // mockPay hace POST real a /api/webhooks/mercadopago y AWAIT antes de
      // redirigir — bajo MP_MOCK_ENABLED el webhook procesa inline, incluido
      // notifyAdminBookingConfirmed → notifyAdminPush (mp-webhook.handler.ts:210).
      await page.getByRole('button', { name: 'Pagar (aprobado)' }).click()
      await expect(page).toHaveURL(new RegExp(`/reserva/${bookingId}/exito`), { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 10_000,
      })

      // ── DB layer: el job de push quedó encolado para nuestra suscripción ──
      const jobs = await runSql<{
        id: string
        data: { subscription_id: string; payload: { type: string; bookingId?: string } }
        startafter: string
      }>(
        `SELECT id, data, startafter FROM pgboss.job WHERE name = 'push-send' AND data->>'subscription_id' = $1`,
        [subscriptionId],
      )
      expect(jobs.length).toBeGreaterThanOrEqual(1)
      const job = jobs[0]!
      expect(job.data.payload.type).toBe('booking.confirmed_online')

      // Horario silencioso 00:00–08:00 ART: en madrugada el envío se agenda para
      // las 08:00 locales (11:00 UTC, ART fijo UTC-3); fuera de madrugada, envío
      // inmediato (startafter ~ ahora).
      const hourNow = localHour(now, ART_TIMEZONE)
      const inQuietHours = hourNow < 8
      const startAfter = new Date(job.startafter)

      if (inQuietHours) {
        expect(startAfter.getUTCHours()).toBe(11) // 08:00 ART = 11:00 UTC
      } else {
        const deltaMs = Math.abs(startAfter.getTime() - now.getTime())
        expect(deltaMs).toBeLessThan(5 * 60 * 1000)
      }

      await writeEvidence('TG-HP-228', {
        status: 'pass',
        bookingId,
        subscriptionId,
        vapidConfigured,
        localHourArt: hourNow,
        inQuietHours,
        pgBossJob: { id: job.id, startafter: job.startafter, payloadType: job.data.payload.type },
        notes:
          'Se verificó el ENQUEUE server-side (pgboss.job) del push, no la entrega end-to-end al ' +
          'navegador — no hay worker de pg-boss corriendo en este harness (solo `pnpm dev`) y el enqueue ' +
          'no depende de VAPID (solo lo usa el worker de envío real). ' +
          (vapidConfigured
            ? 'VAPID_* está configurado en este entorno.'
            : 'VAPID_* NO está configurado en este entorno — la entrega real al navegador no se puede validar aquí; ' +
              'el gate de enqueue (este test) sigue siendo válido porque no depende de VAPID.'),
      })
    } finally {
      await context.close()
      await runSql(`DELETE FROM pgboss.job WHERE data->>'subscription_id' = $1`, [subscriptionId])
      await runSql('DELETE FROM push_subscriptions WHERE id = $1', [subscriptionId])
      if (bookingId) {
        await runSql('UPDATE bookings SET payment_id = NULL, payment_method = NULL WHERE id = $1', [
          bookingId,
        ])
        await runSql('DELETE FROM payments WHERE booking_id = $1', [bookingId])
        await runSql('DELETE FROM bookings WHERE id = $1', [bookingId])
      }
    }
  })
})
