import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { LATE_CANCEL_WINDOW_DAYS } from '@/shared/constants'
import { lateCancelPenalty } from './late-cancel'

/** Largo de `players.phone_hint8`: los últimos dígitos con los que se cruza un invitado. */
export const PHONE_HINT_DIGITS = 8

export type GuestLateCancelStatus = {
  /** Cancelaciones tardías del invitado en este complejo dentro de la ventana, contando la última. */
  count: number
  /** Hasta cuándo no puede reservar por el bot; null si no está bloqueado. */
  bannedUntil: Date | null
}

/**
 * Escalera de cancelación tardía del INVITADO del bot (sin `player_id`, así que no
 * hay fila en `tenant_player_bans`): se deriva de sus propias reservas
 * `canceled_late`, cruzadas por los últimos dígitos del teléfono. La misma escalera
 * que el jugador (`lateCancelPenalty`).
 *
 * Como no hay fila de ban, el dueño no puede levantar este bloqueo desde el panel:
 * si quiere atender igual a ese invitado, le reserva a mano desde la grilla.
 */
export async function guestLateCancelStatus(
  tenantId: string,
  phoneHint8: string,
  tx: DbTx,
): Promise<GuestLateCancelStatus> {
  const rows = (await tx.execute(sql`
    SELECT COUNT(*)::int AS count, MAX(canceled_at) AS last_at
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND canceled_late
      AND player_id IS NULL
      AND right(guest_phone, ${PHONE_HINT_DIGITS}) = ${phoneHint8}
      AND canceled_at >= NOW() - make_interval(days => ${LATE_CANCEL_WINDOW_DAYS})
  `)) as unknown as Array<{ count: number; last_at: Date | string | null }>
  const row = rows[0]
  if (!row || row.count === 0 || row.last_at === null) return { count: 0, bannedUntil: null }

  const penalty = lateCancelPenalty(row.count)
  if (penalty.kind !== 'ban') return { count: row.count, bannedUntil: null }
  const until = new Date(new Date(row.last_at).getTime() + penalty.days * 86_400_000)
  return { count: row.count, bannedUntil: until.getTime() > Date.now() ? until : null }
}
