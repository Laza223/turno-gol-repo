/**
 * Lectura pública de torneos (fase 4). Sin login y sin sesión de complejo.
 *
 * Las tablas del módulo son tenant-aisladas con RLS FORCE, así que el camino es
 * el mismo que el de la disponibilidad pública: resolver el complejo por su
 * slug (`tenants` es global, sin RLS) y recién ahí abrir `withTenantContext`.
 * El aislamiento sigue siendo la policy; `is_public` es un filtro de producto
 * ENCIMA de eso, no en lugar de eso.
 *
 * QUÉ SE PUBLICA — la línea está puesta a propósito:
 *
 *   Sí: nombre del torneo, fechas, formato, nombres de EQUIPO, fixture con
 *       cancha y horario, marcadores, tabla de posiciones y goleadores (nombre
 *       + número de camiseta).
 *   No: DNI, teléfono y nombre del contacto, `player_id`, notas internas, y el
 *       plantel completo de cada equipo. Los goleadores son los pocos nombres
 *       que la tabla necesita para existir; publicar las listas enteras es más
 *       exposición por menos valor (doc18, Ley 25.326).
 */
import { sql } from 'drizzle-orm'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { computeStandings } from './standings/standings'
import { getTopScorers, loadStandingsInput } from './tournament-standings.service'
import { listFixture, listStages } from './tournament-fixture.service'
import { TOURNAMENTS_FLAG } from './tournament.flags'
import type { StandingsGroup } from './standings/types'
import type {
  TournamentFormat,
  TournamentMatchView,
  TournamentStageRow,
  TournamentStatus,
  TopScorersResult,
} from './tournament.types'

/** Tarjeta de torneo para el listado público del complejo. */
export type PublicTournamentCard = {
  slug: string
  name: string
  format: TournamentFormat
  status: TournamentStatus
  startsOn: string
  endsOn: string | null
  registrationDeadline: string | null
  /** Centavos ARS. 0 = gratis o sin arancel publicado. */
  inscriptionFee: number
  maxTeams: number | null
  /** Solo los que siguen en carrera. */
  teamCount: number
}

/** Todo lo que muestra la ficha pública, ya resuelto. */
export type PublicTournamentView = {
  card: PublicTournamentCard
  stages: TournamentStageRow[]
  matches: TournamentMatchView[]
  standings: StandingsGroup[]
  scorers: TopScorersResult
  teams: { id: string; name: string; groupLabel: string | null }[]
}

/**
 * Un torneo se ve en el portal solo si el complejo prendió el flag Y lo marcó
 * público Y no es un borrador. El borrador queda afuera aunque `is_public` esté
 * en true: es el estado en el que todavía se está armando.
 */
const PUBLIC_STATUSES = ['registration', 'in_progress', 'finished'] as const

export async function listPublicTournaments(
  tenantId: string,
): Promise<PublicTournamentCard[]> {
  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenantId))) return []

  return withTenantContext(tenantId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT tr.slug, tr.name, tr.format, tr.status,
             tr.starts_on             AS "startsOn",
             tr.ends_on               AS "endsOn",
             tr.registration_deadline AS "registrationDeadline",
             tr.inscription_fee       AS "inscriptionFee",
             tr.max_teams             AS "maxTeams",
             count(t.id) FILTER (WHERE t.status IN ('registered', 'confirmed'))::int
                                      AS "teamCount"
      FROM tournaments tr
      LEFT JOIN tournament_teams t
        ON t.tournament_id = tr.id AND t.tenant_id = tr.tenant_id
      WHERE tr.tenant_id = ${tenantId}
        AND tr.is_public
        AND tr.status = ANY(${PUBLIC_STATUSES as unknown as string[]}::tournament_status[])
      GROUP BY tr.id
      ORDER BY tr.starts_on DESC, tr.name
    `)) as unknown as Array<PublicTournamentCard>

    return rows.map(toCard)
  })
}

/**
 * Ficha pública completa. `null` si el torneo no existe, no es público, está en
 * borrador o el complejo tiene el flag apagado — el caller hace notFound() y no
 * distingue los casos: la existencia de un torneo no publicado tampoco se filtra.
 */
export async function getPublicTournamentView(
  tenantId: string,
  slug: string,
): Promise<PublicTournamentView | null> {
  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenantId))) return null

  return withTenantContext(tenantId, async (tx) => {
    const found = await findPublicTournament(tenantId, slug, tx)
    if (!found) return null

    const { id, card } = found
    const [stages, matches, input, scorers, teams] = await Promise.all([
      listStages(tenantId, id, tx),
      listFixture(tenantId, id, tx),
      loadStandingsInput(tenantId, id, tx),
      getTopScorers(tenantId, id, tx),
      listPublicTeams(tenantId, id, tx),
    ])

    return {
      card,
      stages,
      matches,
      standings: computeStandings(input),
      scorers,
      teams,
    }
  })
}

/** Slugs de los torneos públicos de un complejo, para `generateStaticParams`. */
export async function listPublicTournamentSlugs(
  tenantId: string,
): Promise<string[]> {
  return (await listPublicTournaments(tenantId)).map((t) => t.slug)
}

async function findPublicTournament(
  tenantId: string,
  slug: string,
  tx: DbTx,
): Promise<{ id: string; card: PublicTournamentCard } | null> {
  const rows = (await tx.execute(sql`
    SELECT tr.id, tr.slug, tr.name, tr.format, tr.status,
           tr.starts_on             AS "startsOn",
           tr.ends_on               AS "endsOn",
           tr.registration_deadline AS "registrationDeadline",
           tr.inscription_fee       AS "inscriptionFee",
           tr.max_teams             AS "maxTeams",
           count(t.id) FILTER (WHERE t.status IN ('registered', 'confirmed'))::int
                                    AS "teamCount"
    FROM tournaments tr
    LEFT JOIN tournament_teams t
      ON t.tournament_id = tr.id AND t.tenant_id = tr.tenant_id
    WHERE tr.tenant_id = ${tenantId}
      AND tr.slug = ${slug}
      AND tr.is_public
      AND tr.status = ANY(${PUBLIC_STATUSES as unknown as string[]}::tournament_status[])
    GROUP BY tr.id
    LIMIT 1
  `)) as unknown as Array<PublicTournamentCard & { id: string }>

  const row = rows[0]
  return row ? { id: row.id, card: toCard(row) } : null
}

/** Solo id, nombre y zona: nada de contacto ni notas. */
async function listPublicTeams(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<{ id: string; name: string; groupLabel: string | null }[]> {
  const rows = (await tx.execute(sql`
    SELECT id, name, group_label AS "groupLabel"
    FROM tournament_teams
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
      AND status IN ('registered', 'confirmed')
    ORDER BY group_label NULLS FIRST, name
  `)) as unknown as Array<{ id: string; name: string; groupLabel: string | null }>

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    groupLabel: r.groupLabel ?? null,
  }))
}

/** tx.execute crudo no normaliza los NULL a null ni los opcionales. */
function toCard(r: PublicTournamentCard): PublicTournamentCard {
  return {
    slug: r.slug,
    name: r.name,
    format: r.format,
    status: r.status,
    startsOn: r.startsOn,
    endsOn: r.endsOn ?? null,
    registrationDeadline: r.registrationDeadline ?? null,
    inscriptionFee: r.inscriptionFee,
    maxTeams: r.maxTeams ?? null,
    teamCount: r.teamCount,
  }
}
