/**
 * Misma clase que H-1 de la auditoría de aislamiento del 2026-09-05, en el
 * módulo de torneos (hallazgo 🟢 de la auditoría integral del 2026-09-06,
 * `tournament-team.service.ts:126,328`).
 *
 * `addTeam` guarda `contact_player_id` y `addTeamPlayer` guarda `player_id` tal
 * como llegan del cliente. Ninguno de los dos exigía que esa persona fuera
 * cliente del complejo, así que un complejo podía dejar escrito el id de un
 * jugador ajeno en sus propias filas de torneo.
 *
 * A diferencia de H-1 la cadena NO termina en lectura de datos personales: estas
 * dos tablas no crean `player_tenant_relationships`, que es la condición que
 * destraba `staff_can_see_related_players`. El daño es que el complejo se queda
 * con un puntero a una persona que no le pertenece, y que cualquier camino
 * futuro que derive la relación desde un plantel la convertiría en la fuga
 * completa. El flag global `tournaments` está en `false`, así que hoy no hay
 * forma de llegar desde la UI.
 *
 * Los dos primeros casos estuvieron ROJOS antes del arreglo: las filas se
 * insertaban sin chistar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { addTeam, addTeamPlayer, updateTeam } from '@/modules/tournaments/tournament-team.service'
import { TournamentPlayerNotClientError } from '@/modules/tournaments/tournament.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertTournament } from '../helpers/factories'

let tenantA: { id: string }
let tenantB: { id: string }
let staffA: string
let tournamentA: string
/** Jugador de B: nunca tuvo relación con A. Es el blanco. */
let playerDeB: string
/** Jugador de A: el caso legítimo, que el guard no puede romper. */
let playerDeA: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)

  tenantA = await createTestTenant(sql)
  tenantB = await createTestTenant(sql)

  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenantA.id, staff.id)
  staffA = staff.id

  const pB = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenantB.id, pB.id)
  playerDeB = pB.id

  const pA = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenantA.id, pA.id)
  playerDeA = pA.id

  tournamentA = await insertTournament(sql, tenantA.id, { name: 'Torneo auditoría' })
}, 60_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
}, 60_000)

describe('torneos: el capitán y los jugadores del plantel tienen que ser del complejo', () => {
  it('A no puede anotar un equipo con un jugador de B como capitán', async () => {
    await expect(
      withTenantContext(tenantA.id, (tx) =>
        addTeam(
          tenantA.id,
          staffA,
          tournamentA,
          { name: 'Equipo con capitán ajeno', contactPlayerId: playerDeB },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(TournamentPlayerNotClientError)
  })

  it('A no puede sumar al plantel un jugador de B', async () => {
    const equipo = await withTenantContext(tenantA.id, (tx) =>
      addTeam(tenantA.id, staffA, tournamentA, { name: 'Equipo propio' }, tx),
    )

    await expect(
      withTenantContext(tenantA.id, (tx) =>
        addTeamPlayer(
          tenantA.id,
          staffA,
          equipo.id,
          { fullName: 'Jugador ajeno', playerId: playerDeB },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(TournamentPlayerNotClientError)
  })

  it('A tampoco puede meter al jugador de B editando un equipo ya anotado', async () => {
    // Tercera puerta al mismo campo, fuera de lo que nombraba la auditoría:
    // `updateTeam` escribe `contact_player_id` igual que el alta.
    const equipo = await withTenantContext(tenantA.id, (tx) =>
      addTeam(tenantA.id, staffA, tournamentA, { name: 'Equipo a editar' }, tx),
    )

    await expect(
      withTenantContext(tenantA.id, (tx) =>
        updateTeam(tenantA.id, staffA, { id: equipo.id, contactPlayerId: playerDeB }, tx),
      ),
    ).rejects.toBeInstanceOf(TournamentPlayerNotClientError)
  })

  it('no queda ninguna fila de torneo apuntando al jugador ajeno', async () => {
    const sql = getSql()
    const capitanes = await sql`
      SELECT id FROM tournament_teams
      WHERE tenant_id = ${tenantA.id} AND contact_player_id = ${playerDeB}
    `
    expect(capitanes.length).toBe(0)
    const planteles = await sql`
      SELECT id FROM tournament_team_players
      WHERE tenant_id = ${tenantA.id} AND player_id = ${playerDeB}
    `
    expect(planteles.length).toBe(0)
  })

  it('A SÍ puede anotar un equipo con su propio jugador como capitán', async () => {
    // Contraparte positiva: sin esto, un guard que rechace todo también pasaría.
    const equipo = await withTenantContext(tenantA.id, (tx) =>
      addTeam(
        tenantA.id,
        staffA,
        tournamentA,
        { name: 'Equipo con capitán propio', contactPlayerId: playerDeA },
        tx,
      ),
    )
    expect(equipo.contactPlayerId).toBe(playerDeA)
  })

  it('A SÍ puede sumar al plantel su propio jugador', async () => {
    const equipo = await withTenantContext(tenantA.id, (tx) =>
      addTeam(tenantA.id, staffA, tournamentA, { name: 'Equipo del plantel propio' }, tx),
    )
    const anotado = await withTenantContext(tenantA.id, (tx) =>
      addTeamPlayer(
        tenantA.id,
        staffA,
        equipo.id,
        { fullName: 'Jugador propio', playerId: playerDeA },
        tx,
      ),
    )
    expect(anotado.playerId).toBe(playerDeA)
  })

  it('el equipo y el plantel sin jugador vinculado siguen funcionando', async () => {
    // Los dos campos son opcionales a propósito: el torneo de barrio se anota
    // con nombre y teléfono sueltos, sin cuenta. El guard no puede pedirle
    // relación a un `null`.
    const equipo = await withTenantContext(tenantA.id, (tx) =>
      addTeam(
        tenantA.id,
        staffA,
        tournamentA,
        { name: 'Equipo sin cuentas', contactName: 'Roberto', contactPhone: '1130000000' },
        tx,
      ),
    )
    expect(equipo.contactPlayerId).toBeNull()

    const anotado = await withTenantContext(tenantA.id, (tx) =>
      addTeamPlayer(tenantA.id, staffA, equipo.id, { fullName: 'Suelto' }, tx),
    )
    expect(anotado.playerId).toBeNull()
  })
})
