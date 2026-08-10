/**
 * Seed de los specs visuales. TODO acá es absoluto y fijo.
 *
 * Por qué no se reusan los seeds funcionales: `tomorrowDateIsoArt()`,
 * `currentMonthStr()`, `pickFutureMonday()` y los `Date.now()` embebidos en
 * nombres de producto / teléfonos / emails producen pixeles distintos en cada
 * corrida. Para un assert de texto da igual; para una comparación de imagen es
 * un rojo garantizado.
 *
 * Por qué NO alcanza `page.clock`: TurnoGol renderiza las fechas de la grilla en
 * un Server Component (`grilla/page.tsx` calcula `todayArt` con `new Date()` en
 * Node). El HTML llega cocinado desde el servidor, así que congelar el reloj del
 * browser no cambia un solo pixel de eso. Lo que sí lo cambia es pinnear la
 * fecha por URL — ver VISUAL_DATE.
 *
 * Reusa el tenant/court/admin que ya siembra `scripts/seed-e2e.ts` (que es
 * estático salvo `admin_tour_seen_at`, invisible). Solo agrega reservas con
 * UUIDs y horarios fijos.
 */

import { makeServiceClient } from '../_helpers/player-seed'
import { bookingInstants } from '../_helpers/booking-instants'

const VISUAL_TENANT_ID = '00000000-0000-4000-8000-000000000001'
export const VISUAL_TENANT_SLUG = 'e2e-complejo-demo'
const VISUAL_COURT_ID = '00000000-0000-4000-8000-000000000010'
const VISUAL_PLAYER_ID = '00000000-0000-4000-8000-000000000020'

/**
 * Lunes 17 de junio de 2030.
 *
 * Absoluta a propósito: el encabezado de la grilla renderiza esta fecha como
 * texto, así que cualquier cosa relativa a "hoy" cambiaría los pixeles cada día.
 *
 * Tiene que ser DISTINTA de hoy, y ahí está el truco que hace fotografiable la
 * grilla: `useNowLine` devuelve null cuando `artNow.date !== date`
 * (src/hooks/use-now-line.ts:28), o sea que la línea roja de "ahora" —el
 * elemento más móvil de la pantalla— desaparece sola, sin trucos ni máscaras.
 *
 * Lunes porque el seed abre 08:00–23:00 de lunes a viernes.
 *
 * CADUCA EN 2030: cuando esa fecha sea pasado hay que moverla y regenerar las
 * baselines. Si esta pieza sigue viva para entonces, ya se ganó el derecho.
 */
export const VISUAL_DATE = '2030-06-17'

/**
 * El "ahora" congelado del browser, para los widgets que SÍ leen Date.now() en
 * el cliente (useArtNow, ExpiryCountdown). Es la misma constante que usa
 * Storybook (.storybook/preview.tsx) — una sola verdad de "ahora congelado".
 */
export const FROZEN_NOW = new Date('2026-03-14T18:30:00.000Z')

/** UUIDs fijos: el seed es idempotente por delete+insert sobre estos IDs. */
const VISUAL_BOOKING_IDS = [
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000903',
] as const

const STAFF_USER_ID = '00000000-0000-4000-8000-000000000003'

type VisualBooking = {
  id: string
  timeStart: string
  timeEnd: string
  status: string
  depositStatus: string
  depositAmount: number
  guestName: string | null
  playerId: string | null
}

/**
 * Tres reservas en horarios fijos que cubren tres estados de badge distintos
 * (confirmada / esperando seña / señada). La grilla es la pantalla del producto:
 * lo que interesa fotografiar es que los tres se sigan viendo distinto.
 */
const VISUAL_BOOKINGS: VisualBooking[] = [
  {
    id: VISUAL_BOOKING_IDS[0],
    timeStart: '14:00:00',
    timeEnd: '15:00:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
    guestName: 'Martina Sosa',
    playerId: null,
  },
  {
    id: VISUAL_BOOKING_IDS[1],
    timeStart: '18:00:00',
    timeEnd: '19:00:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: 3000,
    guestName: 'Equipo Los Pinos',
    playerId: null,
  },
  {
    id: VISUAL_BOOKING_IDS[2],
    timeStart: '20:00:00',
    timeEnd: '21:00:00',
    status: 'confirmed',
    depositStatus: 'paid',
    depositAmount: 3000,
    guestName: null,
    playerId: VISUAL_PLAYER_ID,
  },
]

/**
 * Idempotente: borra por ID y vuelve a insertar. Se puede correr N veces y deja
 * siempre el mismo estado, que es justo lo que una baseline necesita.
 */
export async function seedVisualData(): Promise<void> {
  const supabase = makeServiceClient()
  const ids = VISUAL_BOOKINGS.map((b) => b.id)

  await supabase.from('payments').delete().in('booking_id', ids)
  await supabase.from('bookings').update({ payment_id: null }).in('id', ids)
  await supabase.from('bookings').delete().in('id', ids)

  const rows = VISUAL_BOOKINGS.map((b) => ({
    id: b.id,
    tenant_id: VISUAL_TENANT_ID,
    court_id: VISUAL_COURT_ID,
    date: VISUAL_DATE,
    time_start: b.timeStart,
    time_end: b.timeEnd,
    ...bookingInstants({ date: VISUAL_DATE, timeStart: b.timeStart, timeEnd: b.timeEnd }),
    type: 'spontaneous',
    status: b.status,
    price_snapshot: 10000,
    deposit_amount: b.depositAmount,
    deposit_status: b.depositStatus,
    payment_method: null,
    player_id: b.playerId,
    guest_name: b.guestName,
    guest_phone: b.guestName ? '1155550001' : null,
    created_by_staff: STAFF_USER_ID,
  }))

  // upsert y no insert: `beforeAll` corre UNA VEZ POR WORKER, así que con más de
  // un worker dos de ellos hacen delete+insert intercalados y el segundo se come
  // un "duplicate key value violates unique constraint bookings_pkey". Con
  // upsert sobre PKs fijas, correrlo N veces en paralelo converge al mismo
  // estado en vez de explotar.
  const { error } = await supabase.from('bookings').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`seedVisualData falló: ${error.message}`)
}

// B5: `cleanupVisualData` se eliminó — ningún spec la llamaba y no hace falta:
// `seedVisualData` hace UPSERT sobre PKs fijas, o sea que es idempotente y
// converge al mismo estado corriéndola N veces.
