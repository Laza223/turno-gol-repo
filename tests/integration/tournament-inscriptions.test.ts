import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { addTeam, addTeamPlayer, removeTeam } from '@/modules/tournaments/tournament-team.service'
import { deleteTournament, updateTournament } from '@/modules/tournaments/tournament.service'
import {
  countTeamPayments,
  listInscriptionStatus,
  listTeamPayments,
  registerInscriptionPayment,
} from '@/modules/tournaments/tournament-payment.service'
import {
  InscriptionOverpaidError,
  TeamHasNoFeeError,
  TeamHasPaymentsError,
  TournamentTeamNotFoundError,
} from '@/modules/tournaments/tournament.errors'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'

// assertDayOpen compara contra el día ART (UTC-3), no el UTC del host.
function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

// El valor de la prueba de carrera de este archivo depende de que las 2 tx
// corran en conexiones SEPARADAS y choquen en el `FOR UPDATE` a nivel DB. Con
// un pool chico (DATABASE_POOL_MAX=1) se serializan en la cola del pool ANTES
// de tocar la DB: el test seguiría verde pero ya no ejercitaría el lock.
// Mismo patrón que billing-race-conditions.test.ts. Espejo de resolvePoolMax()
// en src/shared/db/client.ts.
const EFFECTIVE_POOL_MAX = (() => {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 3
})()

function requirePoolMaxAtLeast2(testName: string): void {
  if (EFFECTIVE_POOL_MAX < 2) {
    throw new Error(
      `${testName} requiere DATABASE_POOL_MAX>=2 para ejercitar la serialización ` +
        `por FOR UPDATE entre 2 tx concurrentes; valor efectivo=${EFFECTIVE_POOL_MAX}. ` +
        `Con menos conexiones las transacciones se serializan en la cola del pool.`,
    )
  }
}

const TODAY = artDateOf(new Date())
const FEE = 4_500_000 // $45.000

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function setup(opts: { teams?: number; fee?: number } = {}) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)

  const rows = await sql<{ id: string }[]>`
    INSERT INTO tournaments (tenant_id, name, slug, format, starts_on, inscription_fee)
    VALUES (
      ${tenant.id}, 'Torneo Test', ${`i-${Math.floor(Math.random() * 1e9)}`},
      'league'::tournament_format, '2027-03-06', ${opts.fee ?? FEE}
    )
    RETURNING id
  `
  const tournamentId = rows[0]!.id

  const teamIds: string[] = []
  for (let i = 0; i < (opts.teams ?? 2); i++) {
    const team = await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: `Equipo ${i + 1}` }, tx),
    )
    teamIds.push(team.id)
  }

  return { tenant, staff, tournamentId, teamIds }
}

describe('arancel por equipo (snapshot)', () => {
  it('el equipo hereda el arancel vigente del torneo al inscribirse', async () => {
    const { tenant, tournamentId } = await setup({ teams: 1 })
    const rows = await withTenantContext(tenant.id, (tx) =>
      listInscriptionStatus(tenant.id, tournamentId, tx),
    )
    expect(rows[0]!.fee).toBe(FEE)
    expect(rows[0]!.paid).toBe(0)
    expect(rows[0]!.pending).toBe(FEE)
  })

  /**
   * El motivo entero por el que la 066 agregó la columna en vez de leer
   * `tournaments.inscription_fee` en vivo: subir el arancel no puede poner en
   * deuda a los que ya estaban.
   */
  it('subir el arancel del torneo NO mueve el de los equipos ya inscriptos', async () => {
    const { tenant, staff, tournamentId, teamIds } = await setup({ teams: 1 })

    await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: FEE, method: 'cash' }] },
        tx,
      ),
    )

    await withTenantContext(tenant.id, (tx) =>
      updateTournament(tenant.id, staff.id, { id: tournamentId, inscriptionFee: FEE * 2 }, tx),
    )

    const rows = await withTenantContext(tenant.id, (tx) =>
      listInscriptionStatus(tenant.id, tournamentId, tx),
    )
    expect(rows[0]!.fee).toBe(FEE)
    expect(rows[0]!.pending).toBe(0)
  })

  it('el equipo nuevo sí toma el arancel nuevo', async () => {
    const { tenant, staff, tournamentId } = await setup({ teams: 0 })
    await withTenantContext(tenant.id, (tx) =>
      updateTournament(tenant.id, staff.id, { id: tournamentId, inscriptionFee: 1_000_000 }, tx),
    )
    const team = await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, staff.id, tournamentId, { name: 'Tarde' }, tx),
    )
    expect(team.inscriptionFee).toBe(1_000_000)
  })

  it('se puede pisar el arancel de un equipo puntual (descuento)', async () => {
    const { tenant, staff, tournamentId } = await setup({ teams: 0 })
    const team = await withTenantContext(tenant.id, (tx) =>
      addTeam(
        tenant.id,
        staff.id,
        tournamentId,
        { name: 'Con descuento', inscriptionFee: 2_000_000 },
        tx,
      ),
    )
    expect(team.inscriptionFee).toBe(2_000_000)
  })
})

describe('registerInscriptionPayment', () => {
  it('registra el cobro como cash_flow income/tournament apuntando al equipo', async () => {
    const sql = getSql()
    const { tenant, staff, teamIds } = await setup({ teams: 1 })

    const [payment] = await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: FEE, method: 'cash' }] },
        tx,
      ),
    )

    const rows = await sql<
      { category: string; amount: number; tournament_team_id: string; description: string }[]
    >`SELECT category, amount, tournament_team_id, description FROM cash_flows WHERE id = ${payment!.id}`
    expect(rows[0]!.category).toBe('tournament')
    expect(rows[0]!.amount).toBe(FEE)
    expect(rows[0]!.tournament_team_id).toBe(teamIds[0])
    expect(rows[0]!.description).toContain('Equipo 1')
  })

  it('acumula pagos parciales y baja el saldo', async () => {
    const { tenant, staff, tournamentId, teamIds } = await setup({ teams: 1 })

    for (const amount of [2_000_000, 1_500_000]) {
      await withTenantContext(tenant.id, (tx) =>
        registerInscriptionPayment(
          tenant.id,
          staff.id,
          { teamId: teamIds[0]!, charges: [{ amount, method: 'cash' }] },
          tx,
        ),
      )
    }

    const rows = await withTenantContext(tenant.id, (tx) =>
      listInscriptionStatus(tenant.id, tournamentId, tx),
    )
    expect(rows[0]!.paid).toBe(3_500_000)
    expect(rows[0]!.pending).toBe(1_000_000)
    expect(rows[0]!.payments).toBe(2)
    expect(rows[0]!.lastPaidAt).not.toBeNull()
  })

  it('rechaza un cobro que supere lo que el equipo debe', async () => {
    const { tenant, staff, teamIds } = await setup({ teams: 1 })

    await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: 4_000_000, method: 'cash' }] },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerInscriptionPayment(
          tenant.id,
          staff.id,
          { teamId: teamIds[0]!, charges: [{ amount: 1_000_000, method: 'cash' }] },
          tx,
        ),
      ),
    ).rejects.toThrow(InscriptionOverpaidError)

    expect(await withTenantContext(tenant.id, (tx) => countTeamPayments(tenant.id, teamIds[0]!, tx)))
      .toBe(1)
  })

  /** Método mixto (D2, Fase 1): una sola llamada, varias líneas de {monto, método}. */
  it('acepta método mixto: una línea en efectivo y otra en MercadoPago, en el mismo cobro', async () => {
    const { tenant, staff, tournamentId, teamIds } = await setup({ teams: 1 })

    const cashFlows = await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        {
          teamId: teamIds[0]!,
          charges: [
            { amount: 3_000_000, method: 'cash' },
            { amount: 1_500_000, method: 'mercadopago' },
          ],
        },
        tx,
      ),
    )

    expect(cashFlows).toHaveLength(2)
    expect(cashFlows.map((c) => c.method).sort()).toEqual(['cash', 'mercadopago'])
    expect(cashFlows.reduce((s, c) => s + c.amount, 0)).toBe(4_500_000)

    const rows = await withTenantContext(tenant.id, (tx) =>
      listInscriptionStatus(tenant.id, tournamentId, tx),
    )
    expect(rows[0]!.paid).toBe(4_500_000)
    expect(rows[0]!.payments).toBe(2)
  })

  /**
   * Misma disciplina de locks que addBookingChargeAction (ENS-3): dos cobros
   * concurrentes que INDIVIDUALMENTE entran bajo lo pendiente pero JUNTOS lo
   * superan — el FOR UPDATE serializa, uno gana y el otro se rechaza. El
   * equipo nunca queda sobre-cobrado, pase lo que pase con el orden real.
   */
  it('dos cobros concurrentes que juntos superan lo pendiente: uno gana, el otro se rechaza', async () => {
    requirePoolMaxAtLeast2('dos cobros concurrentes que juntos superan lo pendiente')
    const { tenant, staff, tournamentId, teamIds } = await setup({ teams: 1, fee: 5_000_000 })

    const attempt = () =>
      withTenantContext(tenant.id, (tx) =>
        registerInscriptionPayment(
          tenant.id,
          staff.id,
          { teamId: teamIds[0]!, charges: [{ amount: 3_000_000, method: 'cash' }] },
          tx,
        ),
      )

    const [r1, r2] = await Promise.allSettled([attempt(), attempt()])

    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual(['fulfilled', 'rejected'])
    const rejected = (r1.status === 'rejected' ? r1 : r2) as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(InscriptionOverpaidError)

    const rows = await withTenantContext(tenant.id, (tx) =>
      listInscriptionStatus(tenant.id, tournamentId, tx),
    )
    // Solo el ganador quedó registrado: nunca los 6.000.000 de ambos intentos.
    expect(rows[0]!.paid).toBe(3_000_000)
    expect(rows[0]!.payments).toBe(1)
  })

  it('rechaza cobrarle a un equipo sin arancel', async () => {
    const { tenant, staff, teamIds } = await setup({ teams: 1, fee: 0 })

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerInscriptionPayment(
          tenant.id,
          staff.id,
          { teamId: teamIds[0]!, charges: [{ amount: 100_000, method: 'cash' }] },
          tx,
        ),
      ),
    ).rejects.toThrow(TeamHasNoFeeError)
  })

  /** Fix #55: doble-submit con la misma clave = un solo movimiento. */
  it('es idempotente con la misma clientIdempotencyKey', async () => {
    const { tenant, staff, teamIds } = await setup({ teams: 1 })
    const key = crypto.randomUUID()

    const first = await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: 2_000_000, method: 'cash' }], clientIdempotencyKey: key },
        tx,
      ),
    )
    const second = await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: 2_000_000, method: 'cash' }], clientIdempotencyKey: key },
        tx,
      ),
    )

    expect(second[0]!.id).toBe(first[0]!.id)
    expect(await withTenantContext(tenant.id, (tx) => countTeamPayments(tenant.id, teamIds[0]!, tx)))
      .toBe(1)
  })

  /**
   * Regresión del hallazgo crítico de la revisión adversarial de Fase 1 T7:
   * el atajo viejo de idempotencia ("la key de la línea 0 ya existe → me
   * salteo TODA la validación") asumía que un reintento con la misma
   * clientIdempotencyKey siempre reenvía el mismo array. Si el cliente reusa
   * la key pero MUTA el array (agrega una línea, ej. tras una respuesta
   * perdida en tránsito que el usuario no vio y edita el diálogo antes de
   * reenviar), las líneas nuevas se insertaban sin FOR UPDATE ni chequeo de
   * InscriptionOverpaidError — sobre-cobro real. El fix valida cada línea
   * NUEVA (key sin commitear) contra el pendiente actual, sin importar si el
   * lote es un reintento o no.
   */
  it('un reintento que reusa la key pero agrega líneas no se cuela sin validar', async () => {
    const { tenant, staff, tournamentId, teamIds } = await setup({ teams: 1, fee: 1_000_000 })
    const key = crypto.randomUUID()

    // Primer cobro: salda el arancel completo ($10.000) con esta key.
    await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: 1_000_000, method: 'cash' }], clientIdempotencyKey: key },
        tx,
      ),
    )

    // Reintento MUTADO: misma key, pero un array distinto que agrega una
    // línea nueva — si el atajo viejo siguiera vivo, esta línea se insertaría
    // sin validar (la key de la línea 0 ya existe → "alreadyRegistered").
    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerInscriptionPayment(
          tenant.id,
          staff.id,
          {
            teamId: teamIds[0]!,
            charges: [
              { amount: 300_000, method: 'cash' },
              { amount: 700_000, method: 'transfer' },
            ],
            clientIdempotencyKey: key,
          },
          tx,
        ),
      ),
    ).rejects.toThrow(InscriptionOverpaidError)

    const rows = await withTenantContext(tenant.id, (tx) =>
      listInscriptionStatus(tenant.id, tournamentId, tx),
    )
    // Nunca $1.700.000: el equipo quedó exactamente en lo que pagó la primera vez.
    expect(rows[0]!.paid).toBe(1_000_000)
    expect(rows[0]!.payments).toBe(1)
  })

  it('respeta el guard de caja cerrada', async () => {
    const { tenant, staff, teamIds } = await setup({ teams: 1 })

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, TODAY, staff.id, { declaredCash: 0 }, 0, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerInscriptionPayment(
          tenant.id,
          staff.id,
          { teamId: teamIds[0]!, charges: [{ amount: 1_000_000, method: 'cash' }] },
          tx,
        ),
      ),
    ).rejects.toThrow(DayAlreadyClosedError)
  })

  it('no deja cobrarle a un equipo de otro complejo', async () => {
    const a = await setup({ teams: 1 })
    const b = await setup({ teams: 1 })

    await expect(
      withTenantContext(a.tenant.id, (tx) =>
        registerInscriptionPayment(
          a.tenant.id,
          a.staff.id,
          { teamId: b.teamIds[0]!, charges: [{ amount: 1_000_000, method: 'cash' }] },
          tx,
        ),
      ),
    ).rejects.toThrow(TournamentTeamNotFoundError)

    expect(
      await withTenantContext(b.tenant.id, (tx) =>
        countTeamPayments(b.tenant.id, b.teamIds[0]!, tx),
      ),
    ).toBe(0)
  })

  it('listTeamPayments devuelve los movimientos del equipo', async () => {
    const { tenant, staff, teamIds } = await setup({ teams: 2 })

    await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: 1_000_000, method: 'transfer' }], note: 'Seña' },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[1]!, charges: [{ amount: 500_000, method: 'cash' }] },
        tx,
      ),
    )

    const rows = await withTenantContext(tenant.id, (tx) =>
      listTeamPayments(tenant.id, teamIds[0]!, tx),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.method).toBe('transfer')
    expect(rows[0]!.description).toBe('Seña')
  })
})

describe('chk_cashflow_tournament_team (la DB es el backstop)', () => {
  it('rechaza categoría tournament sin equipo', async () => {
    const sql = getSql()
    const { tenant, staff } = await setup({ teams: 0 })

    await expect(
      sql`INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
          VALUES (${tenant.id}, 'income', 'tournament', 1000, 'cash', 'huérfano', ${staff.id}, NOW())`,
    ).rejects.toThrow(/chk_cashflow_tournament_team/)
  })

  it('rechaza un equipo colgado de una categoría que no es tournament', async () => {
    const sql = getSql()
    const { tenant, staff, teamIds } = await setup({ teams: 1 })

    await expect(
      sql`INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, tournament_team_id, registered_by, occurred_at)
          VALUES (${tenant.id}, 'income', 'other', 1000, 'cash', 'mezclado', ${teamIds[0]!}, ${staff.id}, NOW())`,
    ).rejects.toThrow(/chk_cashflow_tournament_team/)
  })
})

describe('guards de borrado', () => {
  it('no borra un equipo con cobros registrados', async () => {
    const { tenant, staff, teamIds } = await setup({ teams: 1 })

    await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[0]!, charges: [{ amount: 1_000_000, method: 'cash' }] },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) => removeTeam(tenant.id, staff.id, teamIds[0]!, tx)),
    ).rejects.toThrow(TeamHasPaymentsError)
  })

  it('no borra un torneo si alguno de sus equipos ya pagó', async () => {
    const { tenant, staff, tournamentId, teamIds } = await setup({ teams: 2 })

    await withTenantContext(tenant.id, (tx) =>
      registerInscriptionPayment(
        tenant.id,
        staff.id,
        { teamId: teamIds[1]!, charges: [{ amount: 1_000_000, method: 'cash' }] },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        deleteTournament(tenant.id, staff.id, tournamentId, tx),
      ),
    ).rejects.toThrow(TeamHasPaymentsError)
  })

  /**
   * Bug de la fase 1 que la fase 4 arregla: `deleteTournament` solo borraba la
   * fila de `tournaments`, así que un borrador con equipos cargados —el estado
   * NORMAL antes de tomar horarios— moría con un 23503 crudo de
   * tournament_teams.tournament_id.
   */
  it('borra un torneo en borrador junto con sus equipos y planteles', async () => {
    const sql = getSql()
    const { tenant, staff, tournamentId, teamIds } = await setup({ teams: 2 })

    await withTenantContext(tenant.id, (tx) =>
      addTeamPlayer(tenant.id, staff.id, teamIds[0]!, { fullName: 'Juan Pérez' }, tx),
    )

    await withTenantContext(tenant.id, (tx) =>
      deleteTournament(tenant.id, staff.id, tournamentId, tx),
    )

    const left = await sql<{ teams: string; players: string; tournaments: string }[]>`
      SELECT
        (SELECT count(*) FROM tournament_teams WHERE tournament_id = ${tournamentId})::text AS teams,
        (SELECT count(*) FROM tournament_team_players WHERE team_id = ANY(${teamIds}))::text AS players,
        (SELECT count(*) FROM tournaments WHERE id = ${tournamentId})::text AS tournaments
    `
    expect(left[0]).toEqual({ teams: '0', players: '0', tournaments: '0' })
  })
})
