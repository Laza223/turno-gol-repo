import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeSql, getSql, withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { cleanupAll, createTestPlayer, ensureRoles } from '../helpers/tenant'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

// Mismo UPDATE que ejecuta updateNotificationPrefAction (la action suma auth
// por cookies, no testeable acá): persiste el toggle y una lectura fresca
// (= recargar /perfil) lo refleja.
describe('preferencias de notificación del jugador', () => {
  it('los defaults de la migración son true/true', async () => {
    const player = await createTestPlayer()
    const rows = await withPlayerContext(player.id, (tx) =>
      tx
        .select({ email: players.notifyEmail, push: players.notifyPush })
        .from(players)
        .where(eq(players.id, player.id))
        .limit(1),
    )
    expect(rows[0]).toEqual({ email: true, push: true })
  })

  it('cambiar una preferencia persiste y se refleja al recargar', async () => {
    const player = await createTestPlayer()

    await withPlayerContext(player.id, (tx) =>
      tx.update(players).set({ notifyEmail: false }).where(eq(players.id, player.id)),
    )

    // Lectura en un contexto NUEVO (transacción aparte = recarga de página).
    const rows = await withPlayerContext(player.id, (tx) =>
      tx
        .select({ email: players.notifyEmail, push: players.notifyPush })
        .from(players)
        .where(eq(players.id, player.id))
        .limit(1),
    )
    expect(rows[0]).toEqual({ email: false, push: true })

    // Reactivar también persiste (round-trip completo del toggle).
    await withPlayerContext(player.id, (tx) =>
      tx.update(players).set({ notifyEmail: true }).where(eq(players.id, player.id)),
    )
    const back = await withPlayerContext(player.id, (tx) =>
      tx.select({ email: players.notifyEmail }).from(players).where(eq(players.id, player.id)),
    )
    expect(back[0]?.email).toBe(true)
  })
})
