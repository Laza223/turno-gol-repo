import { sql, type SQL } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { normalizePlayerTags, type PlayerTag } from '@/modules/relationships/player-tags'
import { significantPhoneSql, suggestionPhoneSql } from '@/modules/relationships/contact-identity'

/**
 * Una persona vista por este complejo (B13). Dos orígenes, una sola lista:
 *
 * - `player`  — tiene cuenta: sale de `player_tenant_relationships ⋈ players`.
 * - `contact` — no tiene cuenta: se deriva de los `abonados` con `player_id`
 *               NULL, agrupados por teléfono. Es el "Diego del fijo de los
 *               lunes", que ocupa una cancha todas las semanas y hasta B13 no
 *               figuraba en ninguna lista de personas.
 */
export type ClientListRow = {
  /** Clave estable de la fila: el playerId si tiene cuenta, si no la del grupo. */
  key: string
  kind: 'player' | 'contact'
  /** NULL en las filas `contact`: todavía no hay cuenta a la cual apuntar. */
  playerId: string | null
  name: string
  email: string | null
  phone: string | null
  bookingsCount: number
  noshowCount: number
  lastBookingAt: string | null
  tags: PlayerTag[]
  /** Turnos fijos vigentes (activos + pausados) de esta persona. */
  fixedCount: number
  /**
   * Solo en filas `contact`: jugador con cuenta de este complejo cuyo teléfono
   * coincide. Es una SUGERENCIA para el staff, nunca una vinculación: el
   * sistema propone, la persona decide (decisión de fase v2 §1).
   */
  suggestedPlayerId: string | null
  suggestedPlayerName: string | null
}

function likeArg(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}

function playerSearchCond(q: string | undefined): SQL {
  if (!q) return sql``
  const like = likeArg(q)
  return sql`AND (
    (p.first_name || ' ' || p.last_name) ILIKE ${like}
    OR p.email ILIKE ${like}
    OR p.phone ILIKE ${like}
  )`
}

function contactSearchCond(q: string | undefined): SQL {
  if (!q) return sql``
  const like = likeArg(q)
  return sql`AND (a.contact_name ILIKE ${like} OR a.contact_phone ILIKE ${like})`
}

/** Clave de agrupación (últimos 10 dígitos): estricta, agrupa sin confirmación. */
const ABONADO_PHONE = sql.raw(significantPhoneSql('a.contact_phone'))
/** Cola de sugerencia (últimos 8): más laxa, pero siempre la confirma un humano. */
const ABONADO_HINT = sql.raw(suggestionPhoneSql('a.contact_phone'))
const PLAYER_HINT = sql.raw(suggestionPhoneSql('sp.phone'))

/**
 * La lista única de personas del complejo (B13). Reemplaza a
 * `listTenantPlayers`, que solo veía la mitad registrada.
 *
 * Lo que sigue afuera, por decisión de producto y no por olvido: los invitados
 * telefónicos de una reserva suelta (`bookings.guest_name`, cambio #10
 * cancelado) y los deudores de cantina (`canteen_tabs.debtor_name`). Un turno
 * fijo es un vínculo estable con el complejo; un invitado de una noche no.
 *
 * B10 — el `LIMIT 200` heredado truncaba en SILENCIO: la persona 201 no existía
 * para la pantalla y no había nada que lo dijera ni forma de alcanzarla salvo
 * adivinar el nombre en el buscador. Ahora devuelve páginas y avisa que hay más.
 * Offset y no keyset por el mismo motivo que en `/reservas`: el orden mezcla
 * `lastBookingAt` (nullable) con `name`, y un cursor sobre eso son tres campos
 * de desempate para ahorrar un `OFFSET` sobre la lista de clientes de UN
 * complejo.
 */
export const CLIENTES_PAGE_SIZE = 100

export type ClientListPage = {
  rows: ClientListRow[]
  hasMore: boolean
}

export async function listTenantClients(
  tenantId: string,
  filters: { q?: string },
  tx: DbTx,
  page = 0,
): Promise<ClientListPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0
  const rows = await tx.execute<{
    key: string
    kind: 'player' | 'contact'
    playerId: string | null
    name: string
    email: string | null
    phone: string | null
    bookingsCount: number
    noshowCount: number
    lastBookingAt: string | null
    tags: PlayerTag[] | null
    fixedCount: number
    suggestedPlayerId: string | null
    suggestedPlayerName: string | null
  }>(sql`
    WITH registered AS (
      SELECT p.id::text AS key,
             'player'::text AS kind,
             p.id::text AS "playerId",
             (p.first_name || ' ' || p.last_name) AS name,
             p.email, p.phone,
             r.bookings_count::int AS "bookingsCount",
             r.noshow_count::int AS "noshowCount",
             r.last_booking_at::date::text AS "lastBookingAt",
             r.tags,
             (SELECT COUNT(*)::int FROM abonados fa
               WHERE fa.tenant_id = r.tenant_id
                 AND fa.player_id = r.player_id
                 AND fa.status <> 'canceled') AS "fixedCount",
             NULL::text AS "suggestedPlayerId",
             NULL::text AS "suggestedPlayerName"
      FROM player_tenant_relationships r
      JOIN players p ON p.id = r.player_id
      WHERE r.tenant_id = ${tenantId}
        ${playerSearchCond(filters.q)}
    ),
    -- Los fijos sin cuenta. La clave de grupo es el teléfono normalizado; si no
    -- llega al mínimo de dígitos cae al id de la fila, para no fusionar en una
    -- sola persona a todos los que tienen el teléfono mal cargado.
    unlinked AS (
      SELECT a.id, a.contact_name, a.contact_phone, a.status, a.created_at,
             ${ABONADO_HINT} AS hint_phone,
             COALESCE(${ABONADO_PHONE}, 'id:' || a.id::text) AS group_key
      FROM abonados a
      WHERE a.tenant_id = ${tenantId}
        AND a.player_id IS NULL
        ${contactSearchCond(filters.q)}
    ),
    grouped AS (
      SELECT u.group_key,
             MAX(u.hint_phone) AS hint_phone,
             (ARRAY_AGG(u.contact_name ORDER BY u.created_at DESC))[1] AS name,
             (ARRAY_AGG(u.contact_phone ORDER BY u.created_at DESC))[1] AS phone,
             COUNT(*) FILTER (WHERE u.status <> 'canceled')::int AS fixed_count
      FROM unlinked u
      GROUP BY u.group_key
    ),
    -- Las reservas que generaron esos fijos: son turnos jugados por la persona
    -- aunque no tenga cuenta, así que cuentan igual que las de un registrado.
    group_bookings AS (
      SELECT u.group_key,
             COUNT(b.id)::int AS bookings_count,
             MAX(b.date)::text AS last_booking_at
      FROM unlinked u
      LEFT JOIN bookings b ON b.abonado_id = u.id
      GROUP BY u.group_key
    ),
    contacts AS (
      SELECT g.group_key AS key,
             'contact'::text AS kind,
             NULL::text AS "playerId",
             g.name, NULL::text AS email, g.phone,
             COALESCE(gb.bookings_count, 0) AS "bookingsCount",
             0 AS "noshowCount",
             gb.last_booking_at AS "lastBookingAt",
             NULL::player_tag[] AS tags,
             g.fixed_count AS "fixedCount",
             s.id::text AS "suggestedPlayerId",
             s.name AS "suggestedPlayerName"
      FROM grouped g
      LEFT JOIN group_bookings gb ON gb.group_key = g.group_key
      -- Sugerencia: un jugador YA vinculado a este complejo cuyo teléfono
      -- termina igual. Match por la cola CORTA (8 dígitos), que es la que
      -- tolera el 0...15 con que medio país escribe su celular — puede
      -- hacerlo porque no vincula nada sola, solo preselecciona.
      -- LATERAL + LIMIT 1 porque dos cuentas pueden compartir teléfono
      -- (familia, mismo celular) y una sugerencia ambigua es peor que
      -- ninguna: se ofrece la más reciente y el staff confirma.
      LEFT JOIN LATERAL (
        SELECT sp.id, (sp.first_name || ' ' || sp.last_name) AS name
        FROM player_tenant_relationships sr
        JOIN players sp ON sp.id = sr.player_id
        WHERE sr.tenant_id = ${tenantId}
          AND g.hint_phone IS NOT NULL
          AND ${PLAYER_HINT} = g.hint_phone
        ORDER BY sr.last_booking_at DESC NULLS LAST
        LIMIT 1
      ) s ON TRUE
    )
    SELECT * FROM registered
    UNION ALL
    SELECT * FROM contacts
    ORDER BY "lastBookingAt" DESC NULLS LAST, name ASC
    LIMIT ${CLIENTES_PAGE_SIZE + 1} OFFSET ${safePage * CLIENTES_PAGE_SIZE}
  `)

  const list = [...rows].map((r) => ({ ...r, tags: normalizePlayerTags(r.tags ?? []) }))
  const hasMore = list.length > CLIENTES_PAGE_SIZE
  return { rows: hasMore ? list.slice(0, CLIENTES_PAGE_SIZE) : list, hasMore }
}

export type LinkCandidate = {
  playerId: string
  name: string
  phone: string | null
}

/**
 * Candidatos para vincular con una persona sin cuenta (B13).
 *
 * Solo jugadores YA vinculados a este complejo: buscar sobre `players` (que es
 * global, cross-tenant) dejaría a cualquier encargado tantear nombres del
 * sistema entero desde un buscador. `player_tenant_relationships` es el límite
 * correcto y es el mismo que ya aplica la lista.
 *
 * Se busca on-demand en vez de mandar los candidatos con la lista: la página
 * puede tener 200 personas y no tiene sentido serializar sus nombres en cada
 * fila de contacto por si alguien abre el diálogo.
 */
export async function searchLinkCandidates(
  tenantId: string,
  q: string,
  tx: DbTx,
): Promise<LinkCandidate[]> {
  const like = likeArg(q)
  const rows = await tx.execute<LinkCandidate>(sql`
    SELECT p.id::text AS "playerId",
           (p.first_name || ' ' || p.last_name) AS name,
           p.phone
    FROM player_tenant_relationships r
    JOIN players p ON p.id = r.player_id
    WHERE r.tenant_id = ${tenantId}
      AND (
        (p.first_name || ' ' || p.last_name) ILIKE ${like}
        OR p.phone ILIKE ${like}
        OR p.email ILIKE ${like}
      )
    ORDER BY r.last_booking_at DESC NULLS LAST, name ASC
    LIMIT 8
  `)
  return [...rows]
}

export type PlayerProfile = {
  playerId: string
  name: string
  email: string
  phone: string | null
  status: string
  firstSeenAt: string | null
  lastBookingAt: string | null
  tags: PlayerTag[]
}

export async function getPlayerProfile(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<PlayerProfile | null> {
  const rows = await tx.execute(sql`
    SELECT p.id AS "playerId",
           (p.first_name || ' ' || p.last_name) AS name,
           p.email, p.phone,
           r.status,
           r.first_seen_at::text AS "firstSeenAt",
           r.last_booking_at::text AS "lastBookingAt",
           r.tags
    FROM player_tenant_relationships r
    JOIN players p ON p.id = r.player_id
    WHERE r.tenant_id = ${tenantId} AND r.player_id = ${playerId}
    LIMIT 1
  `)
  const row = (rows as unknown as PlayerProfile[])[0]
  if (!row) return null
  // Normalizar acá y no en la vista: el orden canónico es el de presentación, y
  // una fila vieja podría traer las etiquetas en cualquier orden.
  return { ...row, tags: normalizePlayerTags(row.tags ?? []) }
}

export type PlayerFixedSlotRow = {
  id: string
  courtName: string
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  status: string
  contactName: string
}

/**
 * Turnos fijos a nombre de este jugador en este complejo (B13). La ficha los
 * muestra para que "desvincular" no sea un botón a ciegas: antes de despegar a
 * la persona de sus fijos, el staff ve exactamente cuáles son.
 */
export async function getPlayerFixedSlots(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<PlayerFixedSlotRow[]> {
  const rows = await tx.execute<PlayerFixedSlotRow>(sql`
    SELECT a.id::text AS id,
           c.name AS "courtName",
           a.day_of_week AS "dayOfWeek",
           a.time_start::text AS "timeStart",
           a.time_end::text AS "timeEnd",
           a.status,
           a.contact_name AS "contactName"
    FROM abonados a
    JOIN courts c ON c.id = a.court_id
    WHERE a.tenant_id = ${tenantId} AND a.player_id = ${playerId}
    ORDER BY a.day_of_week, a.time_start
  `)
  return [...rows]
}

export type PlayerStats = {
  total: number
  completed: number
  noShow: number
  canceled: number
  /** Tasa de no-show sobre turnos jugados (completed + no_show), 0–100. */
  noShowRate: number
}

export async function getPlayerStats(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<PlayerStats> {
  const rows = await tx.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
      COUNT(*) FILTER (WHERE status IN ('canceled_refunded','canceled_no_refund'))::int AS canceled
    FROM bookings
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `)
  const r = (
    rows as unknown as Array<{
      total: number
      completed: number
      no_show: number
      canceled: number
    }>
  )[0]
  const total = r?.total ?? 0
  const completed = r?.completed ?? 0
  const noShow = r?.no_show ?? 0
  const canceled = r?.canceled ?? 0
  const played = completed + noShow
  const noShowRate = played > 0 ? Math.round((noShow / played) * 100) : 0
  return { total, completed, noShow, canceled, noShowRate }
}

export type PlayerBookingRow = {
  id: string
  date: string
  timeStart: string
  timeEnd: string
  status: string
  type: string
  priceSnapshot: number
  courtName: string
}

export async function getPlayerBookingHistory(
  tenantId: string,
  playerId: string,
  tx: DbTx,
  limit = 20,
): Promise<PlayerBookingRow[]> {
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date,
           b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           c.name AS "courtName"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    WHERE b.tenant_id = ${tenantId} AND b.player_id = ${playerId}
    ORDER BY b.date DESC, b.time_start DESC
    LIMIT ${limit}
  `)
  return rows as unknown as PlayerBookingRow[]
}
