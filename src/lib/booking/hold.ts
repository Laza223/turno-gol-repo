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

/**
 * Lo mínimo que tiene que quedarle al hold para ofrecer "Reintentar pago". Es el margen de 60 s más
 * el piso de 30 s de la preferencia de MercadoPago (`MP_PREFERENCE_SAFETY_BUFFER_SECONDS` y
 * `MP_PREFERENCE_MIN_WINDOW_SECONDS`, en `payment.service.ts`): con menos, la preferencia nueva se
 * come el margen de 60 s del webhook (y con menos de 30 s vence DESPUÉS del hold). Un pago que
 * entra tarde no confirma la reserva y la seña la tiene que devolver el complejo. Si cambian esas
 * dos constantes, esta cambia con ellas.
 */
const RETRY_MIN_REMAINING_SECONDS = 90

/**
 * Último instante en que se ofrece "Pagar la seña" / "Reintentar pago": el vencimiento del hold
 * menos el margen de arriba. Las pantallas lo usan para esconder el botón a tiempo; la acción
 * vuelve a chequearlo con `holdAllowsRetry`.
 */
export function holdRetryDeadlineMs(createdAt: Date | string): number {
  return holdExpiresAtMs(createdAt) - RETRY_MIN_REMAINING_SECONDS * 1000
}

/** ¿Queda hold suficiente para reintentar el pago con el margen de la preferencia intacto? */
export function holdAllowsRetry(createdAt: Date | string, nowMs: number): boolean {
  return holdRetryDeadlineMs(createdAt) > nowMs
}

/**
 * Qué se le ofrece a una reserva para pagar la seña desde /pendiente y Mis reservas. Son los gates de
 * `retryDepositPaymentAction` (hold con margen, MercadoPago del complejo listo), que se repiten
 * para no ofrecer un botón que la acción rechaza: con MercadoPago caído la acción manda a /pendiente,
 * y desde /pendiente se armaría un loop. A esos se suman dos que la acción no ve: sin seña no hay
 * preferencia que armar, y con un pago `in_process` ya hay uno en camino (otro sería doble cobro).
 * - `open`: se ofrece "Pagar la seña".
 * - `processing`: MercadoPago tiene un pago en curso.
 * - `unavailable`: el hold sigue, pero desde acá no se puede cobrar (MercadoPago caído, sin seña).
 * - `closed`: ya no hay margen; el turno se está liberando.
 * `null`: no es una reserva esperando seña.
 */
export type DepositPayState = 'open' | 'processing' | 'unavailable' | 'closed'

export function depositPayState(
  b: {
    status: string
    depositAmount: number
    /** MercadoPago del complejo conectado (booleano en SQL: el token no sale de la base). */
    mpReady: boolean
    inProcess: boolean
    createdAt: Date | string
  },
  nowMs: number,
): DepositPayState | null {
  if (b.status !== 'pending_payment') return null
  if (b.inProcess) return 'processing'
  if (!holdAllowsRetry(b.createdAt, nowMs)) return 'closed'
  if (b.depositAmount <= 0 || !b.mpReady) return 'unavailable'
  return 'open'
}

const PAY_UNTIL_FORMAT = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Argentina/Buenos_Aires',
})

/**
 * "20:14": hasta qué hora (ART) se puede pagar la seña. Es la hora del reloj y no una cuenta
 * regresiva (la vuelta de la reserva no muestra "Te quedan 6:00"). Los segundos se cortan, así que
 * nunca promete un minuto que no hay. Se arma en el servidor y viaja como texto: el cliente no
 * recalcula ni el huso ni la hora.
 */
export function holdPayUntilLabel(createdAt: Date | string): string {
  return PAY_UNTIL_FORMAT.format(new Date(holdRetryDeadlineMs(createdAt)))
}
