import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { insertPlayerBooking, makeServiceClient, E2E_PLAYER_ID } from '../../_helpers/player-seed'
import { cleanupBookingsByIds } from '../../_helpers/booking-seed'

/**
 * TG-HP-113 — Reseña post-partido.
 * Rol: Jugador logueado. Prereq: booking propio status='completed' sin
 * reseña previa (has_review=false).
 *
 * Evidence anchors: LeaveReviewButton.tsx:19-132, mis-reservas/page.tsx:61,
 * MisReservasView.tsx:279-283, api/player/reviews/route.ts.
 */

const PAST_DATE = '2026-05-20'
const TIME_START = '18:00'
const TIME_END = '19:00'
const TENANT_NAME = 'E2E Complejo Demo'

test.describe('TG-HP-113 — Reseña post-partido', () => {
  test('deja una reseña de 5 estrellas con comentario → toast + persiste en DB', async ({
    browser,
    playerStorageState,
  }) => {
    const sb = makeServiceClient()
    const bookingId = await insertPlayerBooking(sb, {
      date: PAST_DATE,
      timeStart: TIME_START,
      timeEnd: TIME_END,
      status: 'completed',
    })

    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto('/mis-reservas?tab=historial')
      await expect(page.getByRole('heading', { name: 'Mis reservas', level: 1 })).toBeVisible()

      const card = page.locator('li').filter({ hasText: `${TIME_START}–${TIME_END}` })
      await expect(card).toBeVisible()
      await expect(card.getByText('Jugada')).toBeVisible()

      await card.getByRole('button', { name: 'Dejar reseña' }).click()
      await expect(
        page.getByRole('heading', { name: `¿Cómo estuvo ${TENANT_NAME}?` }),
      ).toBeVisible()

      // Elegir 5 estrellas.
      await page.getByRole('radio', { name: '5 estrellas' }).click()
      await expect(page.getByRole('radio', { name: '5 estrellas' })).toHaveAttribute(
        'aria-checked',
        'true',
      )

      const comment = 'QA TG-HP-113: cancha impecable, buena atención.'
      await page.locator('#review-comment').fill(comment)
      await expect(page.getByText(`${comment.length}/500`)).toBeVisible()

      const submitBtn = page.getByRole('button', { name: 'Publicar reseña' })
      await submitBtn.click()
      // Anti-doble-submit: disabled={pending} vía useState local (LeaveReviewButton.tsx:120-126).

      await expect(page.getByText('¡Gracias por tu reseña!')).toBeVisible({ timeout: 10_000 })
      // Dialog se cierra + router.refresh() → el botón "Dejar reseña" ya no aparece.
      await expect(
        page.getByRole('heading', { name: `¿Cómo estuvo ${TENANT_NAME}?` }),
      ).not.toBeVisible()
      await expect(card.getByRole('button', { name: 'Dejar reseña' })).not.toBeVisible({
        timeout: 8_000,
      })

      const { data: review, error } = await sb
        .from('reviews')
        .select('booking_id, player_id, rating, comment')
        .eq('booking_id', bookingId)
        .maybeSingle()

      expect(error).toBeNull()
      expect(review?.player_id).toBe(E2E_PLAYER_ID)
      expect(review?.rating).toBe(5)
      expect(review?.comment).toBe(comment)

      await writeEvidence('TG-HP-113', {
        status: 'pass',
        bookingId,
        db: review,
        notes:
          'POST /api/player/reviews respondió ok (res.ok) — código exacto (200/201) no inspeccionado, ver GAP del manual.',
      })
    } finally {
      await ctx.close()
      await sb.from('reviews').delete().eq('booking_id', bookingId)
      await cleanupBookingsByIds(sb, [bookingId])
    }
  })
})
