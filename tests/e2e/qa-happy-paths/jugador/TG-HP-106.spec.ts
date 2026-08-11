import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { insertPlayerBooking, makeServiceClient } from '../../_helpers/player-seed'
import { cleanupBookingsByIds, tomorrowDateIsoArt } from '../../_helpers/booking-seed'

/**
 * TG-HP-106 — Pago PENDIENTE → /reserva/[id]/pendiente (watcher).
 * Rol: Jugador logueado. Prereq: booking con status='pending_payment' recién
 * creado (tenant Seña), sin resolver aún. Slot 18:00 mañana.
 *
 * Semillo el booking DIRECTO en pending_payment (en vez de navegar todo el
 * flujo de checkout) porque el caso es sobre el WATCHER, no sobre cómo se
 * llega a pending_payment (ya cubierto por TG-HP-104/105) — el manual mismo
 * dice "Navegar (o ser redirigido)".
 *
 * Evidence anchors: pendiente/page.tsx:24-59, PaymentStatusWatcher.tsx:37-60,
 * 67-114,196-217, api/player/bookings/[id]/status/route.ts:12-46.
 */

const SENA_TENANT_ID = '00000000-0000-4000-8000-000000000030'
const SENA_COURT_ID = '00000000-0000-4000-8000-000000000031'
const TIME_START = '18:00'
const TIME_END = '19:00'

test.describe('TG-HP-106 — Pago PENDIENTE → watcher', () => {
  test('muestra "Confirmando tu pago…" y flipea a confirmado sin reload cuando llega el webhook', async ({
    browser,
    playerStorageState,
    request,
  }) => {
    const sb = makeServiceClient()
    const date = tomorrowDateIsoArt()
    const bookingId = await insertPlayerBooking(sb, {
      date,
      timeStart: TIME_START,
      timeEnd: TIME_END,
      tenantId: SENA_TENANT_ID,
      courtId: SENA_COURT_ID,
      status: 'pending_payment',
      depositStatus: 'pending',
      depositAmount: 5000,
    })

    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto(`/reserva/${bookingId}/pendiente`)

      // h2 "Confirmando tu pago…" + texto + countdown mm:ss.
      await expect(page.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('Esto puede tardar unos segundos.')).toBeVisible()
      await expect(page.getByText(/\d:\d\d/).first()).toBeVisible({ timeout: 5_000 })

      // DB: sigue pending_payment hasta que llegue el webhook.
      const { data: pendingBooking, error: pendingErr } = await sb
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single()
      expect(pendingErr).toBeNull()
      expect(pendingBooking?.status).toBe('pending_payment')

      // Webhook fuera de banda (simula que MP confirma mientras el jugador ya
      // está en /pendiente) — mismo patrón probado en booking-flow.spec.ts S3.
      const webhookSecret = process.env.MP_WEBHOOK_SECRET ?? 'test-webhook-secret'
      const webhookResp = await request.post(`/api/webhooks/mercadopago?tenant=${SENA_TENANT_ID}`, {
        headers: { 'x-webhook-secret': webhookSecret },
        data: {
          id: `mock-evt-approved-${bookingId}`,
          type: 'payment',
          data: { id: `MOCK-APPROVED-${bookingId}` },
        },
      })
      expect(webhookResp.ok()).toBeTruthy()

      // UI-sin-reload: el watcher hace polling cada 3s (backoff hasta 30s) y
      // debe flipear SOLO, sin que el test recargue la página.
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 30_000,
      })

      const { data: confirmedBooking, error: confirmedErr } = await sb
        .from('bookings')
        .select('status, deposit_status, deposit_amount')
        .eq('id', bookingId)
        .single()
      expect(confirmedErr).toBeNull()
      expect(confirmedBooking?.status).toBe('confirmed')
      expect(confirmedBooking?.deposit_status).toBe('paid')
      expect(confirmedBooking?.deposit_amount).toBe(5000)

      await writeEvidence('TG-HP-106', {
        status: 'pass',
        bookingId,
        db_before_webhook: pendingBooking,
        db_after_webhook: confirmedBooking,
        finalUrl: page.url(),
        notes:
          'Watcher flipeó a confirmado vía polling (sin router.refresh() ni reload manual) ' +
          'tras un webhook fuera de banda — misma técnica que booking-flow.spec.ts S3.',
      })
    } finally {
      await ctx.close()
      await cleanupBookingsByIds(sb, [bookingId])
    }
  })
})
