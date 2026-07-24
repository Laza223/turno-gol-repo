import { describe, expect, it } from 'vitest'
import {
  createTeamPlayerSchema,
  createTeamSchema,
  createTournamentSchema,
  releaseSlotsSchema,
  reserveSlotsSchema,
} from '@/modules/tournaments/tournament.schema'

const UUID = '11111111-1111-4111-8111-111111111111'

const validTournament = {
  name: 'Clausura 2026',
  format: 'league' as const,
  startsOn: '2026-08-01',
}

describe('createTournamentSchema', () => {
  it('acepta lo mínimo y aplica los defaults del rubro', () => {
    const parsed = createTournamentSchema.parse(validTournament)
    expect(parsed.matchDurationMinutes).toBe(60)
    expect(parsed.pointsWin).toBe(3)
    expect(parsed.pointsDraw).toBe(1)
    expect(parsed.pointsLoss).toBe(0)
    expect(parsed.inscriptionFee).toBe(0)
    expect(parsed.tiebreakers[0]).toBe('goal_diff')
  })

  it('rechaza el nombre vacío', () => {
    expect(
      createTournamentSchema.safeParse({ ...validTournament, name: '   ' }).success,
    ).toBe(false)
  })

  it('rechaza un formato inventado', () => {
    expect(
      createTournamentSchema.safeParse({ ...validTournament, format: 'suizo' }).success,
    ).toBe(false)
  })

  it('rechaza el fin anterior al inicio', () => {
    const r = createTournamentSchema.safeParse({
      ...validTournament,
      endsOn: '2026-07-01',
    })
    expect(r.success).toBe(false)
  })

  it('rechaza el cierre de inscripción posterior al arranque', () => {
    const r = createTournamentSchema.safeParse({
      ...validTournament,
      registrationDeadline: '2026-08-15',
    })
    expect(r.success).toBe(false)
  })

  it('rechaza un puntaje incoherente antes de que explote el CHECK de la DB', () => {
    // chk_tournament_points exige win >= draw >= loss: si Zod lo dejara pasar,
    // el INSERT tiraría un 23514 crudo.
    const r = createTournamentSchema.safeParse({
      ...validTournament,
      pointsWin: 1,
      pointsDraw: 3,
    })
    expect(r.success).toBe(false)
  })

  it('rechaza criterios de desempate repetidos', () => {
    const r = createTournamentSchema.safeParse({
      ...validTournament,
      tiebreakers: ['goal_diff', 'goal_diff'],
    })
    expect(r.success).toBe(false)
  })

  it('rechaza una duración de partido fuera de rango', () => {
    expect(
      createTournamentSchema.safeParse({ ...validTournament, matchDurationMinutes: 5 })
        .success,
    ).toBe(false)
    expect(
      createTournamentSchema.safeParse({ ...validTournament, matchDurationMinutes: 200 })
        .success,
    ).toBe(false)
  })

  it('rechaza una inscripción negativa', () => {
    expect(
      createTournamentSchema.safeParse({ ...validTournament, inscriptionFee: -1 })
        .success,
    ).toBe(false)
  })

  it('rechaza un cupo de un solo equipo', () => {
    expect(
      createTournamentSchema.safeParse({ ...validTournament, maxTeams: 1 }).success,
    ).toBe(false)
  })
})

describe('createTeamSchema', () => {
  it('acepta un equipo sin capitán vinculado', () => {
    // El plantel amateur no tiene cuenta: el vínculo con un player es opcional.
    const r = createTeamSchema.safeParse({ tournamentId: UUID, name: 'Los Pibes' })
    expect(r.success).toBe(true)
  })

  it('acepta el capitán vinculado a un jugador real', () => {
    const r = createTeamSchema.safeParse({
      tournamentId: UUID,
      name: 'Los Pibes',
      contactPlayerId: UUID,
    })
    expect(r.success).toBe(true)
  })

  it('rechaza el nombre vacío', () => {
    expect(createTeamSchema.safeParse({ tournamentId: UUID, name: '  ' }).success).toBe(
      false,
    )
  })

  it('rechaza un tournamentId que no es UUID', () => {
    expect(
      createTeamSchema.safeParse({ tournamentId: 'nope', name: 'Los Pibes' }).success,
    ).toBe(false)
  })
})

describe('createTeamPlayerSchema', () => {
  it('acepta un jugador con solo el nombre', () => {
    const r = createTeamPlayerSchema.safeParse({ teamId: UUID, fullName: 'Juan Pérez' })
    expect(r.success).toBe(true)
  })

  it('rechaza un DNI con letras', () => {
    expect(
      createTeamPlayerSchema.safeParse({
        teamId: UUID,
        fullName: 'Juan Pérez',
        dni: '12.345.678',
      }).success,
    ).toBe(false)
  })

  it('rechaza un número de camiseta fuera de rango', () => {
    expect(
      createTeamPlayerSchema.safeParse({
        teamId: UUID,
        fullName: 'Juan Pérez',
        shirtNumber: 1000,
      }).success,
    ).toBe(false)
  })
})

describe('reserveSlotsSchema', () => {
  const base = {
    tournamentId: UUID,
    courtIds: [UUID],
    dates: ['2026-08-01'],
    timeStart: '14:00',
    timeEnd: '18:00',
  }

  it('acepta una franja normal', () => {
    expect(reserveSlotsSchema.safeParse(base).success).toBe(true)
  })

  it("acepta '24:00' como fin", () => {
    expect(reserveSlotsSchema.safeParse({ ...base, timeEnd: '24:00' }).success).toBe(true)
  })

  it("no acepta '24:00' como inicio", () => {
    expect(reserveSlotsSchema.safeParse({ ...base, timeStart: '24:00' }).success).toBe(
      false,
    )
  })

  it('exige al menos una cancha y una fecha', () => {
    expect(reserveSlotsSchema.safeParse({ ...base, courtIds: [] }).success).toBe(false)
    expect(reserveSlotsSchema.safeParse({ ...base, dates: [] }).success).toBe(false)
  })

  it('rechaza una fecha inexistente del calendario', () => {
    expect(reserveSlotsSchema.safeParse({ ...base, dates: ['2026-02-30'] }).success).toBe(
      false,
    )
  })
})

describe('releaseSlotsSchema', () => {
  it('exige torneo y fecha de corte', () => {
    expect(
      releaseSlotsSchema.safeParse({ tournamentId: UUID, fromDate: '2026-08-01' })
        .success,
    ).toBe(true)
    expect(releaseSlotsSchema.safeParse({ tournamentId: UUID }).success).toBe(false)
  })
})
