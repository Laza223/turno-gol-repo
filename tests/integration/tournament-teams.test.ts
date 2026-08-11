import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertTournament } from '../helpers/factories'
import { addTeam, listTeams } from '@/modules/tournaments/tournament-team.service'
import {
  DuplicateTeamNameError,
  TournamentFullError,
} from '@/modules/tournaments/tournament.errors'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function setup() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const tournamentId = await insertTournament(sql, tenant.id)
  return { tenant, staff, tournamentId }
}

/**
 * La unicidad case-insensitive la garantiza la BASE, vía la columna generada
 * `name_normalized` + uq_tournament_teams_name (migr. 063). Antes era un índice
 * de expresión, que violaba D3-H1 (inusable bajo RLS). Estos tests fijan que el
 * cambio de mecanismo NO aflojó la garantía.
 */
describe('tournament_teams — unicidad case-insensitive del nombre', () => {
  it('rechaza el mismo nombre con otra capitalización', async () => {
    const { tenant, staff, tournamentId } = await setup()

    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: 'Los Pibes' }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        addTeam(tenant.id, staff.id, tournamentId, { name: 'los pibes' }, tx),
      ),
    ).rejects.toThrow(DuplicateTeamNameError)
  })

  it('rechaza el mismo nombre con espacios de más alrededor', async () => {
    const { tenant, staff, tournamentId } = await setup()

    // Nombre ASCII a propósito: el case-folding de caracteres no-ASCII depende
    // del locale del cluster (el Postgres alpine de CI arranca sin locales del
    // sistema), y lo que se prueba acá es el trim, no Unicode.
    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: 'Deportivo Central' }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        addTeam(tenant.id, staff.id, tournamentId, { name: '  DEPORTIVO CENTRAL  ' }, tx),
      ),
    ).rejects.toThrow(DuplicateTeamNameError)
  })

  it('el mismo nombre en OTRO torneo sí se permite', async () => {
    const sql = getSql()
    const { tenant, staff, tournamentId } = await setup()
    const otherTournament = await insertTournament(sql, tenant.id)

    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: 'Los Pibes' }, tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, otherTournament, { name: 'Los Pibes' }, tx),
    )

    const a = await withTenantContext(tenant.id, (tx) => listTeams(tenant.id, tournamentId, tx))
    const b = await withTenantContext(tenant.id, (tx) => listTeams(tenant.id, otherTournament, tx))
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('la base rechaza el duplicado aunque se saltee el service', async () => {
    // El chequeo optimista del service no es la garantía: la garantía es el
    // índice único. Sin esto, dos encargados cargando a la vez duplicarían.
    const sql = getSql()
    const { tenant, staff, tournamentId } = await setup()

    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: 'Racing de Barrio' }, tx),
    )

    await expect(
      sql`
        INSERT INTO tournament_teams (tenant_id, tournament_id, name)
        VALUES (${tenant.id}, ${tournamentId}, 'RACING DE BARRIO')
      `,
    ).rejects.toThrow(/uq_tournament_teams_name/)
  })

  it('name_normalized se calcula sola y no se puede escribir', async () => {
    const sql = getSql()
    const { tenant, staff, tournamentId } = await setup()

    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: '  Estrella   Roja  ' }, tx),
    )

    const rows = await sql<{ name: string; name_normalized: string }[]>`
      SELECT name, name_normalized FROM tournament_teams
      WHERE tournament_id = ${tournamentId}
    `
    // El service trimea el nombre visible; la columna generada además baja a
    // minúsculas. Los espacios internos se conservan: solo se recorta el borde.
    expect(rows[0]!.name).toBe('Estrella   Roja')
    expect(rows[0]!.name_normalized).toBe('estrella   roja')

    // Postgres: 'cannot insert a non-DEFAULT value into column "name_normalized"'
    // (el "is a generated column" viaja en DETAIL, no en el message).
    await expect(
      sql`
        INSERT INTO tournament_teams (tenant_id, tournament_id, name, name_normalized)
        VALUES (${tenant.id}, ${tournamentId}, 'Otro', 'truchado')
      `,
    ).rejects.toThrow(/name_normalized/)
  })
})

describe('tournament_teams — cupo', () => {
  it('cuenta solo los equipos en carrera contra maxTeams', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const rows = await sql<{ id: string }[]>`
      INSERT INTO tournaments (tenant_id, name, slug, format, starts_on, max_teams)
      VALUES (${tenant.id}, 'Copa Chica', ${`copa-${Date.now()}`}, 'league', '2027-03-01', 2)
      RETURNING id
    `
    const tournamentId = rows[0]!.id

    await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: 'Uno' }, tx),
    )
    const dos = await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: 'Dos' }, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        addTeam(tenant.id, staff.id, tournamentId, { name: 'Tres' }, tx),
      ),
    ).rejects.toThrow(TournamentFullError)

    // Un equipo que se baja libera su lugar.
    await sql`UPDATE tournament_teams SET status = 'withdrawn' WHERE id = ${dos.id}`
    await expect(
      withTenantContext(tenant.id, (tx) =>
        addTeam(tenant.id, staff.id, tournamentId, { name: 'Tres' }, tx),
      ),
    ).resolves.toBeDefined()
  })
})
