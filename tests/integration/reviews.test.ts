import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  closeSql,
  getSql,
  withContextRollback,
  withPlayerContext,
} from '@/shared/db/client'
import {
  canReview,
  createReview,
  getAverageRating,
  getReviewsByTenant,
} from '@/modules/reviews/review.service'
import {
  ReviewAlreadyExistsError,
  ReviewBookingNotCompletedError,
  ReviewBookingNotFoundError,
} from '@/modules/reviews/review.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { insertBooking } from '../helpers/factories'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 800000, '120': 1500000 },
    },
  ],
}

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Test'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

// Booking 'completed' propio del jugador (requisito para reseñar). time varía
// para evitar choques de exclusión aunque 'completed' no entra en la restricción.
let seq = 8
async function completedBooking(
  tenantId: string,
  courtId: string,
  playerId: string,
): Promise<string> {
  const h = String(seq++).padStart(2, '0')
  return insertBooking(getSql(), {
    tenantId,
    courtId,
    playerId,
    date: '2027-04-26',
    timeStart: `${h}:00`,
    timeEnd: `${h}:30`,
    status: 'completed',
  })
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('reviews service', () => {
  it('crea una reseña para un booking completado', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const bookingId = await completedBooking(tenant.id, court, player.id)

    const review = await withPlayerContext(player.id, (tx) =>
      createReview(player.id, bookingId, 5, '¡Excelente cancha!', tx),
    )

    expect(review.id).toBeTruthy()
    expect(review.tenantId).toBe(tenant.id)
    expect(review.playerId).toBe(player.id)
    expect(review.bookingId).toBe(bookingId)
    expect(review.rating).toBe(5)
    expect(review.comment).toBe('¡Excelente cancha!')
  })

  it('rechaza una segunda reseña para el mismo booking', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const bookingId = await completedBooking(tenant.id, court, player.id)

    await withPlayerContext(player.id, (tx) =>
      createReview(player.id, bookingId, 4, null, tx),
    )

    await expect(
      withPlayerContext(player.id, (tx) =>
        createReview(player.id, bookingId, 3, 'otra', tx),
      ),
    ).rejects.toBeInstanceOf(ReviewAlreadyExistsError)
  })

  it('rechaza reseñar un booking no completado', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const bookingId = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId: court,
      playerId: player.id,
      status: 'confirmed',
    })

    await expect(
      withPlayerContext(player.id, (tx) =>
        createReview(player.id, bookingId, 5, null, tx),
      ),
    ).rejects.toBeInstanceOf(ReviewBookingNotCompletedError)
  })

  it('rechaza reseñar un booking ajeno', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const owner = await createTestPlayer()
    const intruder = await createTestPlayer()
    const bookingId = await completedBooking(tenant.id, court, owner.id)

    await expect(
      withPlayerContext(intruder.id, (tx) =>
        createReview(intruder.id, bookingId, 5, null, tx),
      ),
    ).rejects.toBeInstanceOf(ReviewBookingNotFoundError)
  })

  it('canReview refleja elegibilidad', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const completed = await completedBooking(tenant.id, court, player.id)
    const pending = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId: court,
      playerId: player.id,
      status: 'pending_payment',
    })

    await withPlayerContext(player.id, async (tx) => {
      expect(await canReview(player.id, completed, tx)).toBe(true)
      expect(await canReview(player.id, pending, tx)).toBe(false)
      await createReview(player.id, completed, 5, null, tx)
      // ya reseñado → no puede de nuevo
      expect(await canReview(player.id, completed, tx)).toBe(false)
    })
  })

  it('calcula promedio y conteo, y pagina más recientes primero', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const sql = getSql()

    // Sin reseñas: promedio 0, count 0.
    const empty = await getAverageRating(tenant.id)
    expect(empty).toEqual({ average: 0, count: 0 })

    const ratings = [5, 4, 3]
    const ids: string[] = []
    for (const r of ratings) {
      const player = await createTestPlayer()
      const bookingId = await completedBooking(tenant.id, court, player.id)
      const review = await withPlayerContext(player.id, (tx) =>
        createReview(player.id, bookingId, r, null, tx),
      )
      ids.push(review.id)
    }

    // created_at determinístico para probar el orden DESC.
    await sql`UPDATE reviews SET created_at = '2026-01-01 10:00:00+00' WHERE id = ${ids[0]}`
    await sql`UPDATE reviews SET created_at = '2026-01-02 10:00:00+00' WHERE id = ${ids[1]}`
    await sql`UPDATE reviews SET created_at = '2026-01-03 10:00:00+00' WHERE id = ${ids[2]}`

    const summary = await getAverageRating(tenant.id)
    expect(summary.count).toBe(3)
    expect(summary.average).toBeCloseTo(4, 5) // (5+4+3)/3 = 4

    const page = await getReviewsByTenant(tenant.id, 2, 0)
    expect(page.total).toBe(3)
    expect(page.reviews).toHaveLength(2)
    // Más reciente primero: ids[2] (2026-01-03) luego ids[1] (2026-01-02).
    expect(page.reviews[0]!.id).toBe(ids[2])
    expect(page.reviews[1]!.id).toBe(ids[1])

    const page2 = await getReviewsByTenant(tenant.id, 2, 2)
    expect(page2.reviews).toHaveLength(1)
    expect(page2.reviews[0]!.id).toBe(ids[0])
  })
})

describe('reviews RLS', () => {
  it('lectura pública: cualquier rol ve las reseñas (USING true)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const bookingId = await completedBooking(tenant.id, court, player.id)
    await withPlayerContext(player.id, (tx) =>
      createReview(player.id, bookingId, 5, null, tx),
    )

    // Sin player context, como rol authenticated → la policy pública USING(true) deja leer.
    const rows = await withContextRollback(
      { role: 'authenticated' },
      (tx) =>
        tx`SELECT id FROM reviews WHERE tenant_id = ${tenant.id}` as unknown as Promise<
          { id: string }[]
        >,
    )
    expect((rows as unknown as unknown[]).length).toBe(1)
  })

  it('INSERT: el jugador puede reseñar su propio booking completado', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const bookingId = await completedBooking(tenant.id, court, player.id)

    const rows = await withContextRollback(
      { role: 'authenticated', playerId: player.id },
      (tx) =>
        tx`
          INSERT INTO reviews (tenant_id, player_id, booking_id, rating)
          VALUES (${tenant.id}, ${player.id}, ${bookingId}, 5)
          RETURNING id
        ` as unknown as Promise<{ id: string }[]>,
    )
    expect((rows as unknown as unknown[]).length).toBe(1)
  })

  it('INSERT: no puede suplantar a otro jugador (WITH CHECK player_id)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const a = await createTestPlayer()
    const b = await createTestPlayer()
    const bookingA = await completedBooking(tenant.id, court, a.id)

    await expect(
      withContextRollback({ role: 'authenticated', playerId: a.id }, (tx) =>
        tx`
          INSERT INTO reviews (tenant_id, player_id, booking_id, rating)
          VALUES (${tenant.id}, ${b.id}, ${bookingA}, 5)
        `,
      ),
    ).rejects.toThrow()
  })

  it('INSERT: no puede reseñar un booking no completado (EXISTS de la policy)', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const player = await createTestPlayer()
    const pending = await insertBooking(getSql(), {
      tenantId: tenant.id,
      courtId: court,
      playerId: player.id,
      status: 'pending_payment',
    })

    await expect(
      withContextRollback({ role: 'authenticated', playerId: player.id }, (tx) =>
        tx`
          INSERT INTO reviews (tenant_id, player_id, booking_id, rating)
          VALUES (${tenant.id}, ${player.id}, ${pending}, 5)
        `,
      ),
    ).rejects.toThrow()
  })

  it('INSERT: no puede reseñar el booking completado de otro jugador', async () => {
    const tenant = await createTestTenant()
    const court = await insertCourt(tenant.id)
    const owner = await createTestPlayer()
    const intruder = await createTestPlayer()
    const bookingOwner = await completedBooking(tenant.id, court, owner.id)

    await expect(
      withContextRollback(
        { role: 'authenticated', playerId: intruder.id },
        (tx) =>
          tx`
            INSERT INTO reviews (tenant_id, player_id, booking_id, rating)
            VALUES (${tenant.id}, ${intruder.id}, ${bookingOwner}, 5)
          `,
      ),
    ).rejects.toThrow()
  })
})
