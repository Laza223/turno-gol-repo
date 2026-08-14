import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { getCancellationPreview } from '@/modules/bookings/cancellation-preview'
import { MisReservasView, type MisReservasBookingRow } from './MisReservasView'
import { cancelMyBookingAction } from './actions'
import { UPCOMING_PLAYABLE_STATUSES } from './upcoming-count'

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function nowMs(): number {
  return Date.now()
}

/**
 * Fila cruda de la query — además de lo que necesita MisReservasBookingRow,
 * trae los insumos para calcular la consecuencia de cancelar AHORA (ENS-2):
 * `starts_at` es el instante físico (TIMESTAMPTZ) que usa `cancelByPlayer`
 * como fuente de verdad, no una reconstrucción a mano de date+time_start.
 */
type RawMisReservasRow = {
  id: string
  date: string
  time_start: string
  time_end: string
  type: string
  status: string
  price_snapshot: number
  court_name: string
  tenant_name: string
  tenant_slug: string
  has_review: boolean
  deposit_status: string
  deposit_amount: number
  starts_at: string
  cancellation_policy_hours: number
}

/** Reservas por página. El jugador lee esto en el celular: 50 sobra. */
export const MIS_RESERVAS_PAGE_SIZE = 50

/** `?pagina=` es 1-based en la URL y 0-based adentro. Basura → página 1. */
function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n - 1 : 0
}

export default async function MisReservasPage(props: {
  searchParams: Promise<{ tab?: string; pagina?: string }>
}) {
  const searchParams = await props.searchParams
  const user = await extractAuthUser()
  if (!user || user.type !== 'player')
    redirect(`/ingresar?next=${encodeURIComponent('/mis-reservas')}`)

  const today = artToday()
  const tab = searchParams.tab === 'historial' ? 'historial' : 'proximos'
  const page = parsePage(searchParams.pagina)

  // B10 — el corte próximos/historial vivía en JS sobre un `LIMIT 200` global.
  // Como el orden es `date DESC`, esas 200 SIEMPRE contenían todo lo futuro y lo
  // que se perdía era la cola del HISTORIAL: un jugador de años no podía llegar
  // a sus reservas más viejas, y nada en pantalla lo decía. Ahora el corte está
  // en SQL y cada tab pagina por su lado.
  // El corte era SOLO por fecha de calendario, nunca por estado: una reserva de
  // HOY ya jugada (`completed`, badge "Jugada") o expirada sin pagar seguía en
  // "Próximos", mezclada con turnos realmente futuros, hasta que cambiaba el día
  // (🟡 QA 2026-08-13). Peor: el contador "Tenés N turnos por jugar" de arriba ya
  // filtraba por `UPCOMING_PLAYABLE_STATUSES`, así que la lista contradecía a su
  // propio encabezado. Se reusa la MISMA constante para que las dos cosas no
  // puedan volver a divergir; las dos condiciones siguen siendo una partición
  // exacta (ninguna reserva se pierde ni aparece en las dos tabs).
  const playableStatuses = sql.join(
    UPCOMING_PLAYABLE_STATUSES.map((s) => sql`${s}::booking_status`),
    sql`, `,
  )
  const tabCond =
    tab === 'proximos'
      ? sql`AND b.date >= ${today}::date AND b.status IN (${playableStatuses})`
      : sql`AND (b.date < ${today}::date OR b.status NOT IN (${playableStatuses}))`

  const { rows, upcoming } = await withPlayerContext(user.playerId, async (tx) => {
    const paged = await tx.execute(sql`
      SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
             b.type, b.status, b.price_snapshot,
             b.deposit_status, b.deposit_amount, b.starts_at,
             c.name AS court_name, t.name AS tenant_name, t.slug AS tenant_slug,
             COALESCE((t.settings->'cancellation_policy'->>'hours_before')::int, 24) AS cancellation_policy_hours,
             EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS has_review
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.player_id = ${user.playerId}
        ${tabCond}
      ORDER BY b.date DESC, b.time_start DESC
      LIMIT ${MIS_RESERVAS_PAGE_SIZE + 1} OFFSET ${page * MIS_RESERVAS_PAGE_SIZE}
    `)
    // "Tenés N turnos por jugar" ya no se puede derivar de las filas en
    // pantalla: parado en Historial no hay ninguna próxima a la vista. Los
    // estados salen de `UPCOMING_PLAYABLE_STATUSES` en vez de repetirse acá,
    // para que agregar uno no deje los dos caminos diciendo cosas distintas —
    // y `mis-reservas-pagination.test.ts` compara las dos rutas, con control
    // negativo corrido.
    const counted = await tx.execute<{ n: string | number }>(sql`
      SELECT COUNT(*) AS n
      FROM bookings b
      WHERE b.player_id = ${user.playerId}
        AND b.date >= ${today}::date
        AND b.status IN (${sql.join(
          UPCOMING_PLAYABLE_STATUSES.map((s) => sql`${s}::booking_status`),
          sql`, `,
        )})
    `)
    return { rows: paged, upcoming: Number([...counted][0]?.n ?? 0) }
  })

  const pageRows = rows as unknown as RawMisReservasRow[]
  const hasMore = pageRows.length > MIS_RESERVAS_PAGE_SIZE
  const rawRows = hasMore ? pageRows.slice(0, MIS_RESERVAS_PAGE_SIZE) : pageRows

  // ENS-2: consecuencia concreta de cancelar AHORA, calculada server-side con
  // la misma política que cancelByPlayer (getCancellationPreview reusa
  // decideAdminRefund) — no se le pide al front que reconstruya el umbral.
  // Un solo `now` para todo el batch, aislado en nowMs() (mismo patrón que
  // artToday() más arriba: react-compiler no marca "impuro" un Date.now()
  // envuelto en su propia función).
  const now = nowMs()
  const pageBookings: MisReservasBookingRow[] = rawRows.map((r) => {
    const preview = getCancellationPreview({
      depositStatus: r.deposit_status,
      depositAmountCents: r.deposit_amount,
      bookingStartUtcMs: new Date(r.starts_at).getTime(),
      policyHours: r.cancellation_policy_hours,
      nowMs: now,
    })
    return {
      id: r.id,
      date: r.date,
      time_start: r.time_start,
      time_end: r.time_end,
      type: r.type,
      status: r.status,
      price_snapshot: r.price_snapshot,
      court_name: r.court_name,
      tenant_name: r.tenant_name,
      tenant_slug: r.tenant_slug,
      has_review: r.has_review,
      cancellation_outcome: preview.kind,
      deposit_amount: preview.kind === 'no_deposit' ? 0 : preview.amountCents,
    }
  })

  return (
    <MisReservasView
      bookings={pageBookings}
      tab={tab}
      page={page}
      hasMore={hasMore}
      upcomingCount={upcoming}
      cancelAction={cancelMyBookingAction}
    />
  )
}
