import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'

/**
 * El hold: la ventana en la que un `pending_payment` retiene la cancha.
 *
 * Nace cuando el jugador **entra a pagar** (decisión v2 D1), no cuando mira el
 * slot ni cuando completa los datos: el INSERT ocurre al hacer submit. Dura
 * `DEFAULT_EXPIRY_SECONDS` desde `bookings.created_at` y se libera solo (job
 * por-booking + barrido de respaldo).
 *
 * Este archivo existe porque la cuenta `created_at + TTL` estaba copiada a mano
 * en **cinco** lugares (las 3 páginas de `/reserva/[id]`, el endpoint de estado
 * del jugador y `payment.service`), y esa duplicación ya mordió una vez: el
 * contador mostraba 15 minutos cuando el hold vencía a los 6, así que el
 * jugador confiaba en un margen que no existía y perdía el slot sin darse
 * cuenta (caza-bugs #12). Una sexta copia para las superficies de
 * disponibilidad era pedirlo de nuevo.
 *
 * Vive en `@/lib/booking` y no en `@/modules/bookings` porque lo consume
 * `BookingCard`, y la regla `no-restricted-imports` del repo prohíbe que un
 * componente reusable dependa del dominio como VALOR. Es la misma vecindad que
 * `pricing.ts` y `slot-visual.ts`, que ya cruzan esa frontera igual: puro, sin
 * I/O, y sin arrastrar pg-boss a ningún bundle (`definitions.ts` es
 * constantes).
 */

/** Cuánto retiene la cancha un hold, en segundos. */
export const HOLD_TTL_SECONDS = DEFAULT_EXPIRY_SECONDS

/**
 * Instante en que el hold deja de retener la cancha.
 *
 * Acepta string porque es lo que devuelve `tx.execute` para un timestamptz (ver
 * la tabla de tipos en `src/shared/db/client.ts`), y Date porque es lo que
 * devuelve el query builder. Los dos caminos existen y los dos llegan acá.
 */
export function holdExpiresAtMs(createdAt: Date | string): number {
  return new Date(createdAt).getTime() + HOLD_TTL_SECONDS * 1000
}

/** El instante de vencimiento como ISO — la forma en que viaja a un cliente. */
export function holdExpiresAtIso(createdAt: Date | string): string {
  return new Date(holdExpiresAtMs(createdAt)).toISOString()
}

/**
 * ¿Ya venció por reloj?
 *
 * OJO: venció por reloj **no** es lo mismo que "el slot está libre". La fila
 * sigue en `pending_payment` hasta que la barre el worker, y mientras tanto
 * sigue ocupando el exclusion constraint. Por eso las superficies de
 * disponibilidad muestran "se está liberando" y no "libre": prometer libre algo
 * que todavía rechaza el INSERT es volver a mentirle a la pantalla, que es
 * justo lo que este bloque viene a arreglar.
 */
export function holdIsExpired(createdAt: Date | string, nowMs: number): boolean {
  return holdExpiresAtMs(createdAt) <= nowMs
}

/**
 * Lo que se le muestra a OTRO jugador sobre un hold ajeno, a partir del
 * instante absoluto que viajó en `Slot.heldUntil`.
 *
 * Es puro y vive acá (no adentro del componente) para poder testear el borde
 * que importa sin montar React: el segundo en que la cuenta llega a cero. Ahí
 * NO se dice "libre" — la fila sigue en `pending_payment` hasta que la barre el
 * worker y el INSERT seguiría rebotando contra el exclusion constraint.
 */
export function holdRemainingLabel(
  heldUntilIso: string,
  nowMs: number,
): { expired: true } | { expired: false; label: string } {
  const remainingMs = new Date(heldUntilIso).getTime() - nowMs
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return { expired: true }
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return { expired: false, label: `${minutes}:${String(seconds).padStart(2, '0')}` }
}
