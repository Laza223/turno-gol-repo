/**
 * RIVAL v1, capa de base de datos (migr. 099), medida con el ROL REAL de la app
 * (`turnogol_app`, sin BYPASSRLS) por el envoltorio de producción
 * (`withPlayerContext`).
 *
 * Por qué con el rol real y no con el superusuario de los tests: el cupo, el
 * banco, las transiciones por actor, los topes y la visibilidad viven en
 * triggers y funciones SECURITY DEFINER que dependen de `app.current_player_id`
 * y de la RLS. Con un rol BYPASSRLS la mitad de lo que se afirma acá pasaría en
 * verde sin haberse ejercitado.
 *
 * Mismo arnés que `mis-reservas-app-role.test.ts`: LOGIN del rol mientras dura
 * el archivo (se devuelve el verifier original en el `afterAll`) y siembra
 * SIEMPRE por el pool admin. A diferencia de aquel, el pool acá es ancho: las
 * carreras necesitan conexiones separadas para chocar en el lock de Postgres,
 * no en la cola del pool.
 *
 * Cada regla lleva su CONTROL: la misma operación hecha por quien SÍ puede
 * (o antes de que venza / de que haya ban), para que un cero o un rechazo no
 * sea el efecto de un fixture mal armado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql, type SQL } from 'drizzle-orm'
import {
  closeSql,
  getDb,
  getSql,
  getWorkerSql,
  withPlayerContext,
  withTenantContext,
} from '@/shared/db/client'
import { rivalErrorCode } from '@/shared/db/pg-errors'
import { adminSql } from '../helpers/admin-db'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
} from '../helpers/tenant'
import { insertBan, insertBooking, insertCourt } from '../helpers/factories'

const APP_TEST_PASSWORD = 'turnogol_app_rival_db'
const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
const POOL_MAX = '16'

let prevAppUrl: string | undefined
let prevAdminUrl: string | undefined
let prevPoolMax: string | undefined
let prevAppVerifier: string | null = null
let appCouldLoginBefore = false

let tenantId: string
let otherTenantId: string
let staffId: string

type Row = Record<string, unknown>

beforeAll(async () => {
  getSql()
  getWorkerSql()
  await closeSql()
  const original = process.env.DATABASE_URL ?? DEFAULT_URL
  prevAdminUrl = process.env.TEST_ADMIN_DATABASE_URL
  process.env.TEST_ADMIN_DATABASE_URL = original
  prevPoolMax = process.env.DATABASE_POOL_MAX
  process.env.DATABASE_POOL_MAX = POOL_MAX

  const su = adminSql()
  const before = (
    await su<Array<{ can_login: boolean; verifier: string | null }>>`
      SELECT rolcanlogin AS can_login, rolpassword AS verifier
      FROM pg_authid WHERE rolname = 'turnogol_app'
    `
  )[0]
  appCouldLoginBefore = before?.can_login === true
  prevAppVerifier = before?.verifier ?? null
  await su.unsafe(`ALTER ROLE turnogol_app LOGIN PASSWORD '${APP_TEST_PASSWORD}'`)

  prevAppUrl = process.env.DATABASE_URL
  const appUrl = new URL(original)
  appUrl.username = 'turnogol_app'
  appUrl.password = APP_TEST_PASSWORD
  process.env.DATABASE_URL = appUrl.toString()

  await cleanupAll(su)
  tenantId = (await createTestTenant(su)).id
  otherTenantId = (await createTestTenant(su)).id
  staffId = (await createTestStaffUser(su)).id
}, 60_000)

afterAll(async () => {
  await closeSql()
  const su = adminSql()
  await cleanupAll(su)
  if (appCouldLoginBefore && prevAppVerifier) {
    await su.unsafe(
      `ALTER ROLE turnogol_app LOGIN PASSWORD '${prevAppVerifier.replaceAll("'", "''")}'`,
    )
  } else {
    await su.unsafe('ALTER ROLE turnogol_app NOLOGIN')
    await su.unsafe('ALTER ROLE turnogol_app PASSWORD NULL')
  }
  if (prevAppUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = prevAppUrl
  if (prevAdminUrl === undefined) delete process.env.TEST_ADMIN_DATABASE_URL
  else process.env.TEST_ADMIN_DATABASE_URL = prevAdminUrl
  if (prevPoolMax === undefined) delete process.env.DATABASE_POOL_MAX
  else process.env.DATABASE_POOL_MAX = prevPoolMax
}, 60_000)

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Corre una sentencia como `playerId` (null = sin ningún contexto). */
async function q(playerId: string | null, statement: SQL): Promise<Row[]> {
  const run = async (tx: Parameters<Parameters<typeof withPlayerContext>[1]>[0]): Promise<Row[]> =>
    (await tx.execute(statement)) as unknown as Row[]
  if (playerId === null) return getDb().transaction(run)
  return withPlayerContext(playerId, run)
}

function pgCode(e: unknown): string | undefined {
  const any = e as { code?: string; cause?: { code?: string } }
  return any?.code ?? any?.cause?.code
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('la operación debía fallar y salió bien')
}

/**
 * Denegado: o la RLS (42501) o un trigger BEFORE con su código rival_* (los
 * triggers corren antes del WITH CHECK, así que según la regla gana uno u otro).
 */
function expectDenied(e: unknown, label = ''): void {
  const ok = pgCode(e) === '42501' || rivalErrorCode(e) !== null
  expect(ok, `${label} error recibido: ${String((e as Error).message).slice(0, 200)}`).toBe(true)
}

/** La operación tiene que morir con ESE código de RIVAL, no con otro error. */
async function rejectsRival(code: string, p: Promise<unknown>): Promise<void> {
  const e = await caught(p)
  expect(rivalErrorCode(e), `error recibido: ${String((e as Error).message).slice(0, 200)}`).toBe(
    code,
  )
}

async function newPlayer(
  overrides: Partial<{ first: string; last: string }> = {},
): Promise<string> {
  const su = adminSql()
  const id = (await createTestPlayer(su)).id
  if (overrides.first || overrides.last) {
    await su`UPDATE players SET first_name = ${overrides.first ?? 'Test'}, last_name = ${overrides.last ?? 'Jugador'} WHERE id = ${id}`
  }
  return id
}

type MatchOpts = {
  tenant?: string
  capacity?: number
  hours?: number
  seeking?: 'players' | 'rival' | null
  position?: 'any' | 'goalkeeper'
  /** Sin WhatsApp aunque se publique: para probar rival_contact_required. */
  skipContact?: boolean
}

/** Crea un partido AS el organizador, por el camino de producción. */
async function createMatch(
  organizer: string,
  o: MatchOpts = {},
): Promise<{ id: string; code: string }> {
  const seeking = o.seeking ?? null
  const position = seeking === 'players' ? (o.position ?? 'any') : null
  return withPlayerContext(organizer, async (tx) => {
    const rows = (await tx.execute(drizzleSql`
      INSERT INTO rival_matches
        (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared,
         on_board, seeking, seeking_position)
      VALUES (${o.tenant ?? tenantId}::uuid, ${organizer}::uuid,
              now() + make_interval(hours => ${o.hours ?? 48}::int), 5, ${o.capacity ?? 10}::int,
              'parejo', true, ${seeking !== null}::boolean, ${seeking}::text, ${position}::text)
      RETURNING id, invite_code
    `)) as unknown as Row[]
    const id = String(rows[0]!['id'])
    if (seeking !== null && !o.skipContact) {
      await tx.execute(
        drizzleSql`INSERT INTO rival_match_contacts (match_id, whatsapp_digits) VALUES (${id}::uuid, '5491155551234')`,
      )
    }
    return { id, code: String(rows[0]!['invite_code']) }
  })
}

async function join(player: string, code: string): Promise<Row> {
  const rows = await q(player, drizzleSql`SELECT * FROM rival_join_by_invite(${code})`)
  return rows[0]!
}

/** Pedido del tablón. El cliente manda tenant_id y los trigger lo derivan del partido. */
async function request(player: string, matchId: string): Promise<string> {
  const rows = await q(
    player,
    drizzleSql`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
               VALUES (${tenantId}::uuid, ${matchId}::uuid, ${player}::uuid, 'requested', 'board')
               RETURNING id`,
  )
  return String(rows[0]!['id'])
}

/** UPDATE de estado como `actor`: devuelve las filas afectadas (0 = la RLS no la dejó ver). */
async function setStatus(actor: string, participantId: string, status: string): Promise<Row[]> {
  return q(
    actor,
    drizzleSql`UPDATE rival_participants SET status = ${status} WHERE id = ${participantId}::uuid RETURNING id, status`,
  )
}

async function participantId(matchId: string, playerId: string): Promise<string> {
  const su = adminSql()
  const rows = await su<{ id: string }[]>`
    SELECT id FROM rival_participants WHERE match_id = ${matchId} AND player_id = ${playerId}
  `
  return rows[0]!.id
}

async function statuses(matchId: string): Promise<Record<string, string>> {
  const su = adminSql()
  const rows = await su<{ player_id: string; status: string }[]>`
    SELECT player_id, status FROM rival_participants WHERE match_id = ${matchId}
  `
  return Object.fromEntries(rows.map((r) => [r.player_id, r.status]))
}

async function matchRow(matchId: string): Promise<Row> {
  const su = adminSql()
  const rows = await su<Row[]>`SELECT * FROM rival_matches WHERE id = ${matchId}`
  return rows[0]!
}

/** Vence el partido por el pool admin (el cliente no puede reabrir ni mover starts_at). */
async function expire(matchId: string): Promise<void> {
  const su = adminSql()
  await su`UPDATE rival_matches SET starts_at = now() - interval '1 hour' WHERE id = ${matchId}`
}

/** Cuenta de 30 días y un partido RIVAL jugado: cuenta para el auto-ocultar. */
async function makeEligibleReporter(): Promise<string> {
  const su = adminSql()
  const player = await newPlayer()
  await su`UPDATE players SET created_at = now() - interval '30 days' WHERE id = ${player}`
  const org = await newPlayer()
  const past = await su<{ id: string }[]>`
    INSERT INTO rival_matches (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared)
    VALUES (${tenantId}, ${org}, now() - interval '2 days', 5, 10, 'parejo', true) RETURNING id
  `
  await su`
    INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
    VALUES (${tenantId}, ${past[0]!.id}, ${player}, 'confirmed', 'invite')
  `
  return player
}

async function report(
  reporter: string,
  matchId: string,
  reportedPlayer: string | null = null,
  forceCounts = false,
): Promise<Row[]> {
  const stmt = forceCounts
    ? drizzleSql`INSERT INTO rival_reports (match_id, reporter_player_id, reported_player_id, reason, counts_for_autohide)
                 VALUES (${matchId}::uuid, ${reporter}::uuid, ${reportedPlayer}::uuid, 'spam', true)
                 RETURNING id, counts_for_autohide`
    : drizzleSql`INSERT INTO rival_reports (match_id, reporter_player_id, reported_player_id, reason)
                 VALUES (${matchId}::uuid, ${reporter}::uuid, ${reportedPlayer}::uuid, 'spam')
                 RETURNING id, counts_for_autohide`
  return q(reporter, stmt)
}

// ─── 0. Controles del arnés ──────────────────────────────────────────────

describe('0. controles', () => {
  it('0.1 se mide con turnogol_app, sin superusuario ni BYPASSRLS', async () => {
    const rows = await q(
      null,
      drizzleSql`SELECT current_user::text AS usuario, r.rolsuper, r.rolbypassrls
                 FROM pg_roles r WHERE r.rolname = current_user`,
    )
    expect(rows[0]).toMatchObject({ usuario: 'turnogol_app', rolsuper: false, rolbypassrls: false })
  })

  it('0.2 el pool tiene conexiones para chocar en el lock (las carreras no se serializan en la cola)', async () => {
    const rows = await q(null, drizzleSql`SELECT 1 AS ok`)
    expect(rows.length).toBe(1)
    expect(Number(process.env.DATABASE_POOL_MAX)).toBeGreaterThanOrEqual(10)
  })
})

// ─── 1. Alta ─────────────────────────────────────────────────────────────

describe('1. alta del partido', () => {
  it('1.1 el organizador entra solo como confirmed y la DB escribe lo que el cliente no manda', async () => {
    const org = await newPlayer()
    const rows = await q(
      org,
      drizzleSql`INSERT INTO rival_matches
          (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared,
           invite_code, status, hidden_at, confirmed_count, filled_at)
        VALUES (${tenantId}::uuid, ${org}::uuid, now() + interval '2 days', 5, 10, 'tranqui', true,
                'AAAAAAAAAA', 'open', now(), 7, now())
        RETURNING id, invite_code, hidden_at, confirmed_count, filled_at`,
    )
    const r = rows[0]!
    // Lo que el cliente quiso imponer se pisa.
    expect(r['invite_code']).not.toBe('AAAAAAAAAA')
    expect(String(r['invite_code'])).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/)
    expect(r['hidden_at']).toBeNull()
    expect(r['filled_at']).toBeNull()
    expect(await statuses(String(r['id']))).toEqual({ [org]: 'confirmed' })
    // El recuento lo hace el trigger de la fila del organizador, no el cliente.
    expect((await matchRow(String(r['id'])))['confirmed_count']).toBe(1)
  })

  it('1.2 un partido vencido no se crea; sin cancha declarada ni reserva tampoco', async () => {
    const org = await newPlayer()
    await rejectsRival(
      'rival_expired',
      q(
        org,
        drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared)
                   VALUES (${tenantId}::uuid, ${org}::uuid, now() - interval '1 minute', 5, 10, 'parejo', true)`,
      ),
    )
    // Ya no es un CHECK (impediría el SET NULL de la FK de la reserva): lo exige el trigger de alta.
    await rejectsRival(
      'rival_court_required',
      q(
        org,
        drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared)
                   VALUES (${tenantId}::uuid, ${org}::uuid, now() + interval '2 days', 5, 10, 'parejo', false)`,
      ),
    )
  })

  it('1.3 no se puede crear un partido a nombre de otro', async () => {
    const org = await newPlayer()
    const other = await newPlayer()
    const e = await caught(
      q(
        org,
        drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared)
                   VALUES (${tenantId}::uuid, ${other}::uuid, now() + interval '2 days', 5, 10, 'parejo', true)`,
      ),
    )
    expectDenied(e)
  })

  it('1.4 publicar exige el WhatsApp guardado (se chequea al cerrar la transacción)', async () => {
    const org = await newPlayer()
    await rejectsRival(
      'rival_contact_required',
      createMatch(org, { seeking: 'players', skipContact: true }),
    )
    // Control: con el contacto en la misma transacción, publica.
    const ok = await createMatch(org, { seeking: 'players' })
    expect((await matchRow(ok.id))['on_board']).toBe(true)
  })

  it('1.5 la reserva vinculada tiene que ser del organizador, confirmada y a la misma hora; el sello se deriva', async () => {
    const su = adminSql()
    const org = await newPlayer()
    const stranger = await newPlayer()
    const courtId = await insertCourt(su, tenantId)
    const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    const mine = await insertBooking(su, {
      tenantId,
      courtId,
      playerId: org,
      date,
      timeStart: '20:00',
      timeEnd: '21:00',
      status: 'confirmed',
    })
    const theirs = await insertBooking(su, {
      tenantId,
      courtId,
      playerId: stranger,
      date,
      timeStart: '21:00',
      timeEnd: '22:00',
      status: 'confirmed',
    })
    const startsAt = (
      await su<{ s: Date }[]>`SELECT starts_at AS s FROM bookings WHERE id = ${mine}`
    )[0]!.s

    // Reserva ajena, otra hora: rechazadas.
    await rejectsRival(
      'rival_booking_mismatch',
      q(
        org,
        drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, booking_id, starts_at, format, capacity, level)
                   VALUES (${tenantId}::uuid, ${org}::uuid, ${theirs}::uuid, ${startsAt.toISOString()}::timestamptz, 5, 10, 'parejo')`,
      ),
    )
    await rejectsRival(
      'rival_booking_mismatch',
      q(
        org,
        drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, booking_id, starts_at, format, capacity, level)
                   VALUES (${tenantId}::uuid, ${org}::uuid, ${mine}::uuid, ${startsAt.toISOString()}::timestamptz + interval '1 hour', 5, 10, 'parejo')`,
      ),
    )
    // Control: la propia, a su hora.
    const rows = await q(
      org,
      drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, booking_id, starts_at, format, capacity, level)
                 VALUES (${tenantId}::uuid, ${org}::uuid, ${mine}::uuid, ${startsAt.toISOString()}::timestamptz, 5, 10, 'parejo')
                 RETURNING invite_code`,
    )
    const code = String(rows[0]!['invite_code'])
    const stamp = async (): Promise<boolean> =>
      (await q(null, drizzleSql`SELECT has_stamp FROM rival_public_match(${code})`))[0]![
        'has_stamp'
      ] as boolean
    expect(await stamp()).toBe(true)
    // El sello no se guarda: baja solo cuando la reserva se cae.
    await su`UPDATE bookings SET status = 'canceled_no_refund' WHERE id = ${mine}`
    expect(await stamp()).toBe(false)
  })
})

// ─── 2. Cupo, banco y promoción ──────────────────────────────────────────

describe('2. cupo, banco y promoción', () => {
  it('2.1 carrera: 8 jugadores por invitación sobre el último lugar → 1 confirmed y 7 en el banco', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 3 })
    const filler = await newPlayer()
    await join(filler, m.code) // 2 de 3: queda UN lugar
    const racers = await Promise.all(Array.from({ length: 8 }, () => newPlayer()))

    const results = await Promise.all(racers.map((p) => join(p, m.code)))
    expect(results.every((r) => r['joined'] === true)).toBe(true)

    const st = await statuses(m.id)
    const racerStatuses = racers.map((p) => st[p])
    expect(racerStatuses.filter((s) => s === 'confirmed')).toHaveLength(1)
    expect(racerStatuses.filter((s) => s === 'bench')).toHaveLength(7)
    const row = await matchRow(m.id)
    expect(row['confirmed_count']).toBe(3)
    expect(row['filled_at']).not.toBeNull()
  }, 30_000)

  it('2.2 una baja promueve al primero del banco, por orden de llegada, en la MISMA transacción', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const a = await newPlayer()
    const b = await newPlayer()
    const c = await newPlayer()
    expect((await join(a, m.code))['status']).toBe('confirmed')
    expect((await join(b, m.code))['status']).toBe('bench')
    expect((await join(c, m.code))['status']).toBe('bench')

    // Se lee el estado de B antes del COMMIT: la promoción ya está adentro.
    const bId = await participantId(m.id, b)
    const aId = await participantId(m.id, a)
    const inside = await withPlayerContext(a, async (tx) => {
      await tx.execute(
        drizzleSql`UPDATE rival_participants SET status = 'left' WHERE id = ${aId}::uuid`,
      )
      return (await tx.execute(
        drizzleSql`SELECT player_id::text AS p, status FROM rival_participants WHERE match_id = ${m.id}::uuid AND player_id = ${b}::uuid`,
      )) as unknown as Row[]
    })
    // A no ve la fila de B (RLS), por eso desde A no se puede leer: se confirma
    // por el pool admin, y la lectura de la transacción de A tiene que ser vacía.
    expect(inside).toEqual([])
    const st = await statuses(m.id)
    expect(st[a]).toBe('left')
    expect(st[b]).toBe('confirmed') // el primero que llegó al banco
    expect(st[c]).toBe('bench')
    const bRow = await adminSql()<
      { confirmed_at: Date | null }[]
    >`SELECT confirmed_at FROM rival_participants WHERE id = ${bId}`
    expect(bRow[0]!.confirmed_at).not.toBeNull()
    expect((await matchRow(m.id))['confirmed_count']).toBe(2)
  })

  it('2.3 la promoción ocurre dentro de la transacción de la baja (si la baja se deshace, no hay promoción)', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const a = await newPlayer()
    const b = await newPlayer()
    await join(a, m.code)
    await join(b, m.code)
    const aId = await participantId(m.id, a)
    const e = await caught(
      withPlayerContext(a, async (tx) => {
        await tx.execute(
          drizzleSql`UPDATE rival_participants SET status = 'left' WHERE id = ${aId}::uuid`,
        )
        throw new Error('rollback a propósito')
      }),
    )
    expect((e as Error).message).toContain('rollback a propósito')
    const st = await statuses(m.id)
    expect(st[a]).toBe('confirmed')
    expect(st[b]).toBe('bench')
  })

  it('2.4 filled_at se escribe solo la primera vez y confirmed_at no se pisa al bajarse', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const a = await newPlayer()
    await join(a, m.code)
    const first = (await matchRow(m.id))['filled_at'] as Date
    expect(first).not.toBeNull()
    const aId = await participantId(m.id, a)
    const confirmedAt = (
      await adminSql()<
        { c: Date }[]
      >`SELECT confirmed_at AS c FROM rival_participants WHERE id = ${aId}`
    )[0]!.c
    await setStatus(a, aId, 'left')
    const b = await newPlayer()
    await join(b, m.code) // se vuelve a llenar
    const row = await matchRow(m.id)
    expect((row['filled_at'] as Date).getTime()).toBe(first.getTime())
    expect(
      (
        await adminSql()<
          { c: Date }[]
        >`SELECT confirmed_at AS c FROM rival_participants WHERE id = ${aId}`
      )[0]!.c.getTime(),
    ).toBe(confirmedAt.getTime())
  })

  it('2.5 el alta por invitación es idempotente; quien se bajó vuelve como alta nueva (decisión 10)', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5 })
    const a = await newPlayer()
    const r1 = await join(a, m.code)
    const r2 = await join(a, m.code)
    expect(r1['participant_id']).toBe(r2['participant_id'])
    expect(r2['joined']).toBe(false)
    await setStatus(a, String(r1['participant_id']), 'left')
    const r3 = await join(a, m.code)
    expect(r3).toMatchObject({ status: 'confirmed', joined: true })
  })

  it('2.6 el cliente no puede insertarse directo como confirmed ni por invitación (solo el pedido del tablón)', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5, seeking: 'players' })
    const p = await newPlayer()
    for (const [status, origin] of [
      ['confirmed', 'board'],
      ['confirmed', 'invite'],
      ['bench', 'invite'],
      ['requested', 'invite'],
    ] as const) {
      const e = await caught(
        q(
          p,
          drizzleSql`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
                     VALUES (${tenantId}::uuid, ${m.id}::uuid, ${p}::uuid, ${status}, ${origin})`,
        ),
      )
      expectDenied(e, `${status}/${origin}`)
    }
    // Control: el pedido legítimo entra.
    expect(await request(p, m.id)).toBeTruthy()
  })
})

// ─── 3. Inmutabilidad ────────────────────────────────────────────────────

describe('3. inmutabilidad', () => {
  it('3.1 tenant, organizador, booking, código, starts_at y el resto no cambian desde el cliente', async () => {
    const org = await newPlayer()
    const m = await createMatch(org)
    const other = await newPlayer()
    const cambios: Array<[string, SQL]> = [
      ['tenant_id', drizzleSql`tenant_id = ${otherTenantId}::uuid`],
      ['organizer_player_id', drizzleSql`organizer_player_id = ${other}::uuid`],
      ['booking_id', drizzleSql`booking_id = gen_random_uuid()`],
      ['invite_code', drizzleSql`invite_code = 'BBBBBBBBBB'`],
      ['starts_at', drizzleSql`starts_at = starts_at + interval '1 day'`],
      ['capacity', drizzleSql`capacity = 20`],
      ['format', drizzleSql`format = 7`],
      ['level', drizzleSql`level = 'picante'`],
      ['court_declared', drizzleSql`court_declared = false, booking_id = gen_random_uuid()`],
      ['hidden_at', drizzleSql`hidden_at = now()`],
      ['confirmed_count', drizzleSql`confirmed_count = 0`],
      ['filled_at', drizzleSql`filled_at = now()`],
    ]
    for (const [campo, set] of cambios) {
      try {
        await rejectsRival(
          'rival_immutable',
          q(org, drizzleSql`UPDATE rival_matches SET ${set} WHERE id = ${m.id}::uuid`),
        )
      } catch (err) {
        throw new Error(`campo ${campo}: ${(err as Error).message}`)
      }
    }
    // El partido quedó intacto.
    const row = await matchRow(m.id)
    expect(row['tenant_id']).toBe(tenantId)
    expect(row['organizer_player_id']).toBe(org)
    expect(row['invite_code']).toBe(m.code)
    // Control: lo único que se toca (cancelar) funciona.
    const r = await q(
      org,
      drizzleSql`UPDATE rival_matches SET status = 'canceled' WHERE id = ${m.id}::uuid RETURNING status`,
    )
    expect(r[0]!['status']).toBe('canceled')
  })

  it('3.2 un partido cancelado no se reabre; uno vencido no se toca', async () => {
    const org = await newPlayer()
    const a = await createMatch(org)
    await q(org, drizzleSql`UPDATE rival_matches SET status = 'canceled' WHERE id = ${a.id}::uuid`)
    await rejectsRival(
      'rival_forbidden_transition',
      q(org, drizzleSql`UPDATE rival_matches SET status = 'open' WHERE id = ${a.id}::uuid`),
    )
    const b = await createMatch(org)
    await expire(b.id)
    await rejectsRival(
      'rival_expired',
      q(org, drizzleSql`UPDATE rival_matches SET status = 'canceled' WHERE id = ${b.id}::uuid`),
    )
  })

  it('3.3 de la fila de un participante solo cambia el estado; lo demás es inmutable', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5 })
    const a = await newPlayer()
    await join(a, m.code)
    const aId = await participantId(m.id, a)
    const other = await newPlayer()
    for (const set of [
      drizzleSql`player_id = ${other}::uuid`,
      drizzleSql`tenant_id = ${otherTenantId}::uuid`,
      drizzleSql`role = 'rival_captain'`,
      drizzleSql`origin = 'board'`,
      drizzleSql`confirmed_at = NULL`,
      drizzleSql`decided_at = now()`,
    ]) {
      await rejectsRival(
        'rival_immutable',
        q(a, drizzleSql`UPDATE rival_participants SET ${set} WHERE id = ${aId}::uuid`),
      )
    }
    expect((await setStatus(a, aId, 'left'))[0]!['status']).toBe('left')
  })
})

// ─── 4. Transiciones por actor ───────────────────────────────────────────

describe('4. pedidos del tablón y transiciones por actor', () => {
  it('4.1 un pedido nunca llega a confirmed sin el organizador; nadie se promueve a sí mismo', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6, seeking: 'players' })
    const r = await newPlayer()
    const rId = await request(r, m.id)
    // El solicitante intenta confirmarse solo.
    await rejectsRival('rival_forbidden_transition', setStatus(r, rId, 'confirmed'))
    // En el banco tampoco: nadie se promueve a sí mismo.
    const b = await newPlayer()
    const full = await createMatch(org, { capacity: 2 })
    await join(b, full.code) // confirmed (2/2)
    const benched = await newPlayer()
    await join(benched, full.code)
    expect((await statuses(full.id))[benched]).toBe('bench')
    await rejectsRival(
      'rival_forbidden_transition',
      setStatus(benched, await participantId(full.id, benched), 'confirmed'),
    )
    // Ni el organizador la fuerza: la promoción es solo del sistema.
    await rejectsRival(
      'rival_forbidden_transition',
      setStatus(org, await participantId(full.id, benched), 'confirmed'),
    )
    expect((await statuses(full.id))[benched]).toBe('bench')
    // Control: el organizador SÍ acepta el pedido.
    expect((await setStatus(org, rId, 'confirmed'))[0]!['status']).toBe('confirmed')
    expect((await statuses(m.id))[r]).toBe('confirmed')
    expect((await matchRow(m.id))['confirmed_count']).toBe(2)
  })

  it('4.2 el organizador no puede aceptar sin cupo (rival_full)', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2, seeking: 'players' })
    const r1 = await newPlayer()
    const r2 = await newPlayer()
    const id1 = await request(r1, m.id)
    const id2 = await request(r2, m.id)
    await setStatus(org, id1, 'confirmed') // 2/2
    await rejectsRival('rival_full', setStatus(org, id2, 'confirmed'))
    // Con la tablón llena ya no se aceptan pedidos nuevos.
    const r3 = await newPlayer()
    await rejectsRival('rival_full', request(r3, m.id))
  })

  it('4.3 matriz por actor: cada transición solo la hace quien corresponde', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 8, seeking: 'players' })
    const a = await newPlayer() // invitación, confirmed
    const r = await newPlayer() // pedido
    const stranger = await newPlayer()
    await join(a, m.code)
    const aId = await participantId(m.id, a)
    const orgId = await participantId(m.id, org)
    const rId = await request(r, m.id)

    // Un tercero no ve las filas: 0 filas afectadas, nada cambia.
    expect(await setStatus(stranger, rId, 'declined')).toEqual([])
    // A (participante) tampoco ve el pedido de R.
    expect(await setStatus(a, rId, 'confirmed')).toEqual([])
    // Cada uno solo puede lo suyo.
    await rejectsRival('rival_forbidden_transition', setStatus(r, rId, 'declined')) // aceptar/rechazar es del organizador
    await rejectsRival('rival_forbidden_transition', setStatus(org, aId, 'left')) // bajarse es de uno mismo
    await rejectsRival('rival_forbidden_transition', setStatus(a, aId, 'removed')) // sacar es del organizador
    await rejectsRival('rival_forbidden_transition', setStatus(a, aId, 'declined'))
    // El organizador no se baja ni se saca: cancela.
    await rejectsRival('rival_forbidden_transition', setStatus(org, orgId, 'left'))
    await rejectsRival('rival_forbidden_transition', setStatus(org, orgId, 'removed'))
    expect(await statuses(m.id)).toMatchObject({
      [org]: 'confirmed',
      [a]: 'confirmed',
      [r]: 'requested',
    })

    // Controles: lo legítimo funciona.
    expect((await setStatus(org, rId, 'declined'))[0]!['status']).toBe('declined')
    // Un rechazo es terminal.
    await rejectsRival('rival_forbidden_transition', setStatus(org, rId, 'confirmed'))
    await rejectsRival('rival_forbidden_transition', setStatus(r, rId, 'left'))
    expect((await setStatus(org, aId, 'removed'))[0]!['status']).toBe('removed')
    // Un sacado no vuelve solo ni se baja después.
    await rejectsRival('rival_forbidden_transition', setStatus(a, aId, 'confirmed'))
    await rejectsRival('rival_forbidden_transition', setStatus(a, aId, 'left'))
    // Y no se reabre con el link.
    expect((await join(a, m.code))['status']).toBe('removed')
  })

  it('4.4 un pedido a un partido que no está en el tablón, o que busca algo ya cerrado, se rechaza', async () => {
    const org = await newPlayer()
    const grupo = await createMatch(org, { capacity: 6 }) // solo el grupo
    const p = await newPlayer()
    await rejectsRival('rival_not_on_board', request(p, grupo.id))
    // Sacarlo del tablón (on_board=false, seeking NULL) también corta los pedidos.
    const pub = await createMatch(org, { capacity: 6, seeking: 'players' })
    await q(
      org,
      drizzleSql`UPDATE rival_matches SET on_board = false, seeking = NULL, seeking_position = NULL WHERE id = ${pub.id}::uuid`,
    )
    await rejectsRival('rival_not_on_board', request(p, pub.id))
  })
})

// ─── 5. Partido vencido ──────────────────────────────────────────────────

describe('5. un partido vencido no admite altas, bajas ni pedidos', () => {
  it('5.1 alta por invitación, baja y pedido → rival_expired; antes de vencer, los tres funcionan', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6, seeking: 'players' })
    const joined = await newPlayer()
    const requester = await newPlayer()
    const latecomer = await newPlayer()
    const lateRequester = await newPlayer()
    await join(joined, m.code)
    const requesterId = await request(requester, m.id)
    const joinedId = await participantId(m.id, joined)

    // Controles: antes de vencer, alta, baja y pedido andan.
    const control = await newPlayer()
    expect((await join(control, m.code))['status']).toBe('confirmed')
    expect(
      (await setStatus(control, await participantId(m.id, control), 'left'))[0]!['status'],
    ).toBe('left')
    expect(await request(await newPlayer(), m.id)).toBeTruthy()

    await expire(m.id)
    await rejectsRival('rival_expired', join(latecomer, m.code))
    await rejectsRival('rival_expired', setStatus(joined, joinedId, 'left'))
    await rejectsRival('rival_expired', request(lateRequester, m.id))
    // Tampoco el organizador decide sobre un vencido.
    await rejectsRival('rival_expired', setStatus(org, requesterId, 'confirmed'))
    expect((await statuses(m.id))[joined]).toBe('confirmed')
  })

  it('5.2 un partido caído tampoco admite altas', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6 })
    await q(org, drizzleSql`UPDATE rival_matches SET status = 'canceled' WHERE id = ${m.id}::uuid`)
    await rejectsRival('rival_canceled', join(await newPlayer(), m.code))
  })
})

// ─── 6. Sin sesión y lecturas de terceros ────────────────────────────────

describe('6. visibilidad', () => {
  it('6.1 sin current_player_id no se lee ninguna fila directo ni se escribe', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { seeking: 'players' })
    const r = await newPlayer()
    await request(r, m.id)
    // Control: las filas EXISTEN (admin) y el organizador las ve.
    const su = adminSql()
    for (const t of ['rival_matches', 'rival_participants', 'rival_match_contacts'] as const) {
      const n = (
        await su.unsafe(
          `SELECT count(*)::int AS n FROM ${t} WHERE ${t === 'rival_match_contacts' ? 'match_id' : t === 'rival_matches' ? 'id' : 'match_id'} = $1`,
          [m.id],
        )
      )[0]!['n']
      expect(n, t).toBeGreaterThan(0)
    }
    expect(
      (await q(org, drizzleSql`SELECT id FROM rival_matches WHERE id = ${m.id}::uuid`)).length,
    ).toBe(1)
    expect(
      (
        await q(
          org,
          drizzleSql`SELECT match_id FROM rival_match_contacts WHERE match_id = ${m.id}::uuid`,
        )
      ).length,
    ).toBe(1)

    // Sin sesión: cero en cada tabla.
    for (const t of [
      'rival_matches',
      'rival_participants',
      'rival_match_contacts',
      'rival_reports',
      'rival_alert_subscriptions',
    ]) {
      const rows = await q(
        null,
        drizzleSql`SELECT count(*)::int AS n FROM ${drizzleSql.identifier(t)}`,
      )
      expect(rows[0]!['n'], t).toBe(0)
    }
    // Y el deny-all es deny-all.
    expect(pgCode(await caught(q(null, drizzleSql`SELECT 1 FROM rival_alert_sends`)))).toBe('42501')
    expect(pgCode(await caught(q(org, drizzleSql`SELECT 1 FROM rival_alert_sends`)))).toBe('42501')
    // No se escribe sin sesión.
    const e = await caught(
      q(
        null,
        drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared)
                         VALUES (${tenantId}::uuid, ${org}::uuid, now() + interval '2 days', 5, 10, 'parejo', true)`,
      ),
    )
    expect(pgCode(e)).toBe('42501')
    // Las funciones que piden sesión la piden.
    await rejectsRival(
      'rival_no_session',
      q(null, drizzleSql`SELECT * FROM rival_join_by_invite(${m.code})`),
    )
    expect(await q(null, drizzleSql`SELECT * FROM rival_roster(${m.id}::uuid, ${m.code})`)).toEqual(
      [],
    )
  })

  it('6.2 rival_public_match sirve sin sesión, con columnas fijas y SIN personas', async () => {
    const org = await newPlayer({ first: 'Marcela', last: 'Quiroga' })
    const m = await createMatch(org, { capacity: 4 })
    const a = await newPlayer({ first: 'Nicolas', last: 'Perez' })
    await join(a, m.code)
    const rows = await q(null, drizzleSql`SELECT * FROM rival_public_match(${m.code})`)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(Object.keys(row).sort()).toEqual(
      [
        'capacity',
        'confirmed_count',
        'court_declared',
        'filled_at',
        'format',
        'has_stamp',
        'id',
        'is_organizer',
        'level',
        'seeking',
        'seeking_position',
        'starts_at',
        'status',
        'tenant_city',
        'tenant_id',
        'tenant_name',
        'tenant_slug',
      ].sort(),
    )
    expect(row['confirmed_count']).toBe(2)
    expect(row['is_organizer'] ?? false).toBe(false)
    const dump = JSON.stringify(row)
    for (const secreto of [org, a, m.code, 'Marcela', 'Nicolas'])
      expect(dump).not.toContain(secreto)
    // Un código que no existe no devuelve nada.
    expect(await q(null, drizzleSql`SELECT * FROM rival_public_match('ZZZZZZZZZZ')`)).toEqual([])
    // El organizador, con sesión, se reconoce.
    expect(
      (await q(org, drizzleSql`SELECT is_organizer FROM rival_public_match(${m.code})`))[0]![
        'is_organizer'
      ],
    ).toBe(true)
  })

  it('6.3 rival_board no expone invite_code ni al organizador, y solo lista lo publicado, abierto, no vencido y no oculto', async () => {
    const su = adminSql()
    const t = (await createTestTenant(su)).id // complejo propio: el listado se filtra por él
    const o = async (): Promise<string> => newPlayer()
    const visible = await createMatch(await o(), { tenant: t, seeking: 'players', capacity: 6 })
    const rival = await createMatch(await o(), { tenant: t, seeking: 'rival', capacity: 5 })
    const soloGrupo = await createMatch(await o(), { tenant: t })
    const vencido = await createMatch(await o(), { tenant: t, seeking: 'players' })
    const oculto = await createMatch(await o(), { tenant: t, seeking: 'players' })
    const lleno = await createMatch(await o(), { tenant: t, seeking: 'players', capacity: 2 })
    const cancelado = await createMatch(await o(), { tenant: t, seeking: 'players' })
    await expire(vencido.id)
    await su`UPDATE rival_matches SET hidden_at = now() WHERE id = ${oculto.id}`
    await join(await newPlayer(), lleno.code) // 2/2
    await su`UPDATE rival_matches SET status = 'canceled', on_board = false, seeking = NULL, seeking_position = NULL WHERE id = ${cancelado.id}`

    const rows = await q(null, drizzleSql`SELECT * FROM rival_board(${t}::uuid)`)
    const ids = rows.map((r) => String(r['id'])).sort()
    expect(ids).toEqual([visible.id, rival.id].sort())
    expect(ids).not.toContain(soloGrupo.id)
    expect(ids).not.toContain(vencido.id)
    expect(ids).not.toContain(oculto.id)
    expect(ids).not.toContain(lleno.id)
    expect(ids).not.toContain(cancelado.id)
    // Columnas: ni el código ni el organizador.
    expect(Object.keys(rows[0]!)).not.toContain('invite_code')
    expect(Object.keys(rows[0]!)).not.toContain('organizer_player_id')
    const dump = JSON.stringify(rows)
    for (const m of [visible, rival]) expect(dump).not.toContain(m.code)
    // Cursor: la página siguiente arranca después de la última fila.
    const first = rows[0]!
    // El cursor con microsegundos exactos (un Date de JS los truncaría).
    const cursor = (
      await su<
        { ts: string }[]
      >`SELECT to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ts FROM rival_matches WHERE id = ${String(first['id'])}`
    )[0]!.ts
    const next = await q(
      null,
      drizzleSql`SELECT id FROM rival_board(${t}::uuid, ${cursor}::timestamptz, ${String(first['id'])}::uuid)`,
    )
    expect(next.map((r) => String(r['id']))).toEqual([String(rows[1]!['id'])])
  })

  it('6.4 rival_roster: el organizador ve todo; el participante, nombre y foto de los confirmados; el tercero necesita el código', async () => {
    const org = await newPlayer({ first: 'Marcela', last: 'Quiroga' })
    const m = await createMatch(org, { capacity: 3, seeking: 'players' })
    const a = await newPlayer({ first: 'Ana', last: 'Gomez' })
    const b = await newPlayer({ first: 'Beto', last: 'Diaz' })
    const c = await newPlayer({ first: 'Carla', last: 'Ruiz' }) // banco
    const r = await newPlayer({ first: 'Rita', last: 'Soto' }) // pedido
    const stranger = await newPlayer()
    await adminSql()`UPDATE players SET position = 'goalkeeper', zone = 'Luján' WHERE id = ${a}`
    await request(r, m.id) // antes de llenar: con 3/3 el tablón ya no admite pedidos
    await join(a, m.code)
    await join(b, m.code)
    await join(c, m.code)

    const rosterAs = async (who: string | null, code: string | null = null): Promise<Row[]> =>
      q(who, drizzleSql`SELECT * FROM rival_roster(${m.id}::uuid, ${code}::text)`)

    // Organizador: confirmados + banco + pedidos, con ficha.
    const orgView = await rosterAs(org)
    expect(orgView.map((x) => x['status']).sort()).toEqual([
      'bench',
      'confirmed',
      'confirmed',
      'confirmed',
      'requested',
    ])
    const ana = orgView.find((x) => x['player_id'] === a)!
    expect(ana).toMatchObject({
      short_name: 'Ana G.',
      position: 'goalkeeper',
      zone: 'Luján',
      games_played: 0,
    })
    expect(ana['member_since']).not.toBeNull()

    // Participante: solo confirmados, nombre corto y foto; sin posición, zona ni carrera.
    const bView = await rosterAs(b)
    expect(bView.map((x) => x['status'])).toEqual(['confirmed', 'confirmed', 'confirmed'])
    expect(
      bView.every(
        (x) => x['position'] === null && x['zone'] === null && x['games_played'] === null,
      ),
    ).toBe(true)
    expect(bView.map((x) => x['short_name']).sort()).toEqual(['Ana G.', 'Beto D.', 'Marcela Q.'])
    // Del banco: ve a los confirmados y su propia fila.
    expect((await rosterAs(c)).map((x) => x['status']).sort()).toEqual([
      'bench',
      'confirmed',
      'confirmed',
      'confirmed',
    ])
    // El que solo pidió desde el tablón no ve a nadie más, solo lo suyo.
    expect((await rosterAs(r)).map((x) => x['player_id'])).toEqual([r])
    // Un tercero con el id del tablón pero sin el código no ve personas...
    expect(await rosterAs(stranger)).toEqual([])
    expect(await rosterAs(stranger, 'ZZZZZZZZZZ')).toEqual([])
    // ... con el link (el código) ve los confirmados.
    const withLink = await rosterAs(stranger, m.code)
    expect(withLink.map((x) => x['status'])).toEqual(['confirmed', 'confirmed', 'confirmed'])
    expect(withLink.every((x) => x['position'] === null)).toBe(true)
    // Nunca teléfono ni email.
    expect(Object.keys(orgView[0]!)).not.toContain('email')
    expect(Object.keys(orgView[0]!)).not.toContain('phone')
  })

  it('6.5 "partidos jugados" suma reservas completadas y partidos RIVAL vencidos, sin contar dos veces', async () => {
    const su = adminSql()
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5 })
    const veteran = await newPlayer()
    await join(veteran, m.code)
    const courtId = await insertCourt(su, tenantId)
    await insertBooking(su, {
      tenantId,
      courtId,
      playerId: veteran,
      date: '2026-01-10',
      status: 'completed',
    })
    // Un partido RIVAL pasado en el que estuvo confirmado.
    const past = await su<{ id: string }[]>`
      INSERT INTO rival_matches (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared)
      VALUES (${tenantId}, ${org}, now() - interval '3 days', 5, 10, 'parejo', true) RETURNING id`
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin) VALUES (${tenantId}, ${past[0]!.id}, ${veteran}, 'confirmed', 'invite')`
    const view = await q(
      org,
      drizzleSql`SELECT games_played FROM rival_roster(${m.id}::uuid) WHERE player_id = ${veteran}::uuid`,
    )
    expect(view[0]!['games_played']).toBe(2)
  })
})

// ─── 7. Contacto ─────────────────────────────────────────────────────────

describe('7. el WhatsApp del organizador', () => {
  async function boardMatch(): Promise<{
    org: string
    accepted: string
    invited: string
    pending: string
    stranger: string
    id: string
  }> {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 10, seeking: 'players' })
    const [accepted, invited, pending, stranger] = await Promise.all([
      newPlayer(),
      newPlayer(),
      newPlayer(),
      newPlayer(),
    ])
    const accId = await request(accepted, m.id)
    await setStatus(org, accId, 'confirmed')
    await join(invited, m.code)
    await request(pending, m.id)
    return { org, accepted, invited, pending, stranger, id: m.id }
  }
  const contactCount = async (who: string, matchId: string): Promise<number> =>
    (
      await q(
        who,
        drizzleSql`SELECT match_id FROM rival_match_contacts WHERE match_id = ${matchId}::uuid`,
      )
    ).length

  it('7.1 lo ve el organizador y el aceptado del tablón; nadie más', async () => {
    const s = await boardMatch()
    expect(await contactCount(s.org, s.id)).toBe(1)
    expect(await contactCount(s.accepted, s.id)).toBe(1)
    // Confirmado, pero por invitación (el grupo): no.
    expect(await contactCount(s.invited, s.id)).toBe(0)
    // Pidió y no lo aceptaron todavía: no.
    expect(await contactCount(s.pending, s.id)).toBe(0)
    expect(await contactCount(s.stranger, s.id)).toBe(0)
    // El aceptado no puede tocarlo.
    const touched = await q(
      s.accepted,
      drizzleSql`UPDATE rival_match_contacts SET whatsapp_digits = '5490000000000' WHERE match_id = ${s.id}::uuid RETURNING match_id`,
    )
    expect(touched).toEqual([])
    const digits = await adminSql()<
      { d: string }[]
    >`SELECT whatsapp_digits AS d FROM rival_match_contacts WHERE match_id = ${s.id}`
    expect(digits[0]!.d).toBe('5491155551234')
  })

  it('7.2 deja de verse al llegar starts_at y se borra al cancelar', async () => {
    const venc = await boardMatch()
    await expire(venc.id)
    expect(await contactCount(venc.org, venc.id)).toBe(0)
    expect(await contactCount(venc.accepted, venc.id)).toBe(0)

    const canc = await boardMatch()
    expect(await contactCount(canc.accepted, canc.id)).toBe(1)
    await q(
      canc.org,
      drizzleSql`UPDATE rival_matches SET status = 'canceled' WHERE id = ${canc.id}::uuid`,
    )
    const left = await adminSql()<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM rival_match_contacts WHERE match_id = ${canc.id}`
    expect(left[0]!.n).toBe(0)
    expect(await contactCount(canc.org, canc.id)).toBe(0)
  })

  it('7.3 un partido oculto no entrega el contacto al aceptado (el organizador sí lo ve)', async () => {
    const s = await boardMatch()
    await adminSql()`UPDATE rival_matches SET hidden_at = now() WHERE id = ${s.id}`
    expect(await contactCount(s.accepted, s.id)).toBe(0)
    expect(await contactCount(s.org, s.id)).toBe(1)
  })

  it('7.4 solo el organizador guarda el contacto, y no sobre un partido caído', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6 })
    const intruder = await newPlayer()
    const e = await caught(
      q(
        intruder,
        drizzleSql`INSERT INTO rival_match_contacts (match_id, whatsapp_digits) VALUES (${m.id}::uuid, '5491100000000')`,
      ),
    )
    expectDenied(e)
    await q(org, drizzleSql`UPDATE rival_matches SET status = 'canceled' WHERE id = ${m.id}::uuid`)
    await rejectsRival(
      'rival_canceled',
      q(
        org,
        drizzleSql`INSERT INTO rival_match_contacts (match_id, whatsapp_digits) VALUES (${m.id}::uuid, '5491100000000')`,
      ),
    )
  })
})

// ─── 8. Topes ────────────────────────────────────────────────────────────

describe('8. topes', () => {
  it('8.1 hasta 3 partidos activos por organizador, también con creación concurrente', async () => {
    const org = await newPlayer()
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => createMatch(org)))
    const ok = results.filter((r) => r.status === 'fulfilled')
    const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(ok).toHaveLength(3)
    expect(bad.map((r) => rivalErrorCode(r.reason))).toEqual(Array(3).fill('rival_limit_active'))
    const n = await adminSql()<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM rival_matches WHERE organizer_player_id = ${org}`
    expect(n[0]!.n).toBe(3)

    // Control: al cancelar uno, o al vencer otro, vuelve a haber lugar.
    const ids = ok.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id)
    await q(
      org,
      drizzleSql`UPDATE rival_matches SET status = 'canceled' WHERE id = ${ids[0]!}::uuid`,
    )
    await createMatch(org)
    await rejectsRival('rival_limit_active', createMatch(org))
    await expire(ids[1]!)
    await createMatch(org)
  }, 30_000)

  it('8.2 hasta 5 pedidos pendientes por jugador, también concurrentes; rechazar libera un lugar', async () => {
    const orgs = await Promise.all(Array.from({ length: 7 }, () => newPlayer()))
    const matches = await Promise.all(orgs.map((o) => createMatch(o, { seeking: 'players' })))

    // Secuencial.
    const q1 = await newPlayer()
    const reqIds: string[] = []
    for (const m of matches.slice(0, 5)) reqIds.push(await request(q1, m.id))
    await rejectsRival('rival_limit_requests', request(q1, matches[5]!.id))
    // Control: el organizador rechaza uno y el jugador puede pedir otro.
    await setStatus(orgs[0]!, reqIds[0]!, 'declined')
    expect(await request(q1, matches[5]!.id)).toBeTruthy()

    // Concurrente: 7 pedidos a la vez, entran exactamente 5.
    const q2 = await newPlayer()
    const results = await Promise.allSettled(matches.map((m) => request(q2, m.id)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
    const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(bad.map((r) => rivalErrorCode(r.reason))).toEqual(Array(2).fill('rival_limit_requests'))
  }, 30_000)

  it('8.3 un pedido de un partido vencido no ocupa lugar del tope', async () => {
    const orgs = await Promise.all(Array.from({ length: 6 }, () => newPlayer()))
    const matches = await Promise.all(orgs.map((o) => createMatch(o, { seeking: 'players' })))
    const p = await newPlayer()
    for (const m of matches.slice(0, 5)) await request(p, m.id)
    await rejectsRival('rival_limit_requests', request(p, matches[5]!.id))
    await expire(matches[0]!.id)
    expect(await request(p, matches[5]!.id)).toBeTruthy()
  })
})

// ─── 9. Bans ─────────────────────────────────────────────────────────────

describe('9. bans (decisión 7)', () => {
  /** Las tres puertas: crear, sumarse por link y pedir desde el tablón. */
  async function intenta(p: string): Promise<{ crear: unknown; sumar: unknown; pedir: unknown }> {
    const orgA = await newPlayer()
    const orgB = await newPlayer()
    const viaLink = await createMatch(orgA)
    const viaTablon = await createMatch(orgB, { seeking: 'players' })
    return {
      crear: await caught(createMatch(p)).catch(() => 'ok'),
      sumar: await join(p, viaLink.code).then(
        () => 'ok',
        (e: unknown) => e,
      ),
      pedir: await request(p, viaTablon.id).then(
        () => 'ok',
        (e: unknown) => e,
      ),
    }
  }

  it('9.1 el ban manual vigente del complejo impide crear, sumarse y pedir', async () => {
    const p = await newPlayer()
    await insertBan(adminSql(), { tenantId, playerId: p, bannedBy: staffId })
    const r = await intenta(p)
    expect(rivalErrorCode(r.crear)).toBe('rival_banned')
    expect(rivalErrorCode(r.sumar)).toBe('rival_banned')
    expect(rivalErrorCode(r.pedir)).toBe('rival_banned')
  })

  it('9.2 el softban automático (banned_by NULL) NO frena', async () => {
    const p = await newPlayer()
    await insertBan(adminSql(), { tenantId, playerId: p, bannedBy: null })
    const r = await intenta(p)
    expect(r).toEqual({ crear: 'ok', sumar: 'ok', pedir: 'ok' })
  })

  it('9.3 un ban manual vencido, o de otro complejo, no frena', async () => {
    const su = adminSql()
    const vencido = await newPlayer()
    const banId = await insertBan(su, { tenantId, playerId: vencido, bannedBy: staffId })
    await su`UPDATE tenant_player_bans SET banned_until = now() - interval '1 day' WHERE id = ${banId}`
    expect(await intenta(vencido)).toEqual({ crear: 'ok', sumar: 'ok', pedir: 'ok' })

    const otro = await newPlayer()
    await insertBan(su, { tenantId: otherTenantId, playerId: otro, bannedBy: staffId })
    expect(await intenta(otro)).toEqual({ crear: 'ok', sumar: 'ok', pedir: 'ok' })
  })

  it('9.4 el ban global del sistema frena en cualquier complejo', async () => {
    const p = await newPlayer()
    await adminSql()`UPDATE players SET status = 'banned' WHERE id = ${p}`
    const r = await intenta(p)
    expect(rivalErrorCode(r.crear)).toBe('rival_banned')
    expect(rivalErrorCode(r.sumar)).toBe('rival_banned')
    expect(rivalErrorCode(r.pedir)).toBe('rival_banned')
  })
})

// ─── 10. Busca rival ─────────────────────────────────────────────────────

describe('10. "Busca rival"', () => {
  it('10.1 un solo capitán confirmado: al aceptarlo la búsqueda se cierra y no cuenta para el cupo', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5, seeking: 'rival' })
    const cap1 = await newPlayer()
    const cap2 = await newPlayer()
    const id1 = await request(cap1, m.id)
    const id2 = await request(cap2, m.id)
    const roles = await adminSql()<
      { role: string }[]
    >`SELECT role FROM rival_participants WHERE id IN (${id1}, ${id2})`
    expect(roles.map((r) => r.role)).toEqual(['rival_captain', 'rival_captain'])
    // Control: antes de aceptar, el partido está en el tablón.
    expect(
      (await q(null, drizzleSql`SELECT id FROM rival_board(${tenantId}::uuid)`)).map((r) =>
        String(r['id']),
      ),
    ).toContain(m.id)

    await setStatus(org, id1, 'confirmed')
    const row = await matchRow(m.id)
    expect(row['seeking']).toBeNull()
    expect(row['seeking_position']).toBeNull()
    expect(row['on_board']).toBe(false)
    expect(row['confirmed_count']).toBe(1) // solo el organizador: el capitán no ocupa cupo
    expect(row['filled_at']).toBeNull()
    expect(
      (await q(null, drizzleSql`SELECT id FROM rival_board(${tenantId}::uuid)`)).map((r) =>
        String(r['id']),
      ),
    ).not.toContain(m.id)
    // Un segundo capitán confirmado no entra, ni siquiera por una carrera.
    await rejectsRival('rival_captain_taken', setStatus(org, id2, 'confirmed'))
    const e = await caught(
      adminSql()`UPDATE rival_participants SET status = 'confirmed' WHERE id = ${id2}`,
    )
    expect(pgCode(e)).toBe('23505') // el índice único parcial es la red de seguridad
  })

  it('10.2 si el capitán se baja, el organizador puede volver a publicar; con el capitán adentro, no', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5, seeking: 'rival' })
    const cap = await newPlayer()
    const capId = await request(cap, m.id)
    await setStatus(org, capId, 'confirmed')
    const republicar = (): Promise<Row[]> =>
      q(
        org,
        drizzleSql`UPDATE rival_matches SET on_board = true, seeking = 'rival' WHERE id = ${m.id}::uuid RETURNING id`,
      )
    await rejectsRival('rival_forbidden_transition', republicar())
    await setStatus(cap, capId, 'left')
    expect((await republicar()).length).toBe(1)
    expect((await matchRow(m.id))['seeking']).toBe('rival')
  })
})

// ─── 11. Denuncias y auto-ocultar ────────────────────────────────────────

describe('11. denuncias (decisión 9)', () => {
  it('11.1 tres denunciantes que cuentan ocultan el partido; hasta la tercera sigue visible', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { seeking: 'players', capacity: 6 })
    const [r1, r2, r3] = await Promise.all([
      makeEligibleReporter(),
      makeEligibleReporter(),
      makeEligibleReporter(),
    ])
    const visibleEnTablon = async (): Promise<boolean> =>
      (await q(null, drizzleSql`SELECT id FROM rival_board(${tenantId}::uuid)`)).some(
        (r) => r['id'] === m.id,
      )

    expect((await report(r1, m.id))[0]!['counts_for_autohide']).toBe(true)
    expect((await report(r2, m.id))[0]!['counts_for_autohide']).toBe(true)
    expect((await matchRow(m.id))['hidden_at']).toBeNull()
    expect(await visibleEnTablon()).toBe(true)
    await report(r3, m.id)
    expect((await matchRow(m.id))['hidden_at']).not.toBeNull()

    // Oculto: no está en el tablón, no se ve por link, no admite altas ni plantel; el organizador sí lo ve.
    expect(await visibleEnTablon()).toBe(false)
    expect(await q(null, drizzleSql`SELECT * FROM rival_public_match(${m.code})`)).toEqual([])
    expect((await q(org, drizzleSql`SELECT * FROM rival_public_match(${m.code})`)).length).toBe(1)
    await rejectsRival('rival_not_found', join(await newPlayer(), m.code))
    const stranger = await newPlayer()
    expect(
      await q(stranger, drizzleSql`SELECT * FROM rival_roster(${m.id}::uuid, ${m.code})`),
    ).toEqual([])
    expect(
      (await q(org, drizzleSql`SELECT * FROM rival_roster(${m.id}::uuid)`)).length,
    ).toBeGreaterThan(0)
    await rejectsRival(
      'rival_hidden',
      q(
        org,
        drizzleSql`UPDATE rival_matches SET on_board = false, seeking = NULL, seeking_position = NULL WHERE id = ${m.id}::uuid`,
      ).then(() =>
        q(
          org,
          drizzleSql`UPDATE rival_matches SET on_board = true, seeking = 'players', seeking_position = 'any' WHERE id = ${m.id}::uuid`,
        ),
      ),
    )
  }, 30_000)

  it('11.2 tres denunciantes con cuenta nueva (o sin partido jugado) NO ocultan, aunque lleguen al super-admin', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6 })
    const nuevas = await Promise.all([newPlayer(), newPlayer(), newPlayer()])
    for (const p of nuevas) {
      // El cliente intenta imponer counts_for_autohide=true: la DB lo recalcula.
      const rows = await report(p, m.id, null, true)
      expect(rows[0]!['counts_for_autohide']).toBe(false)
    }
    expect((await matchRow(m.id))['hidden_at']).toBeNull()
    const guardadas = await adminSql()<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM rival_reports WHERE match_id = ${m.id}`
    expect(guardadas[0]!.n).toBe(3)

    // Cuenta vieja pero sin reserva completada ni partido jugado: tampoco cuenta.
    const sinHistoria = await newPlayer()
    await adminSql()`UPDATE players SET created_at = now() - interval '30 days' WHERE id = ${sinHistoria}`
    expect((await report(sinHistoria, m.id))[0]!['counts_for_autohide']).toBe(false)
    // Y una con historia pero de 3 días tampoco.
    const joven = await makeEligibleReporter()
    await adminSql()`UPDATE players SET created_at = now() - interval '3 days' WHERE id = ${joven}`
    expect((await report(joven, m.id))[0]!['counts_for_autohide']).toBe(false)
    expect((await matchRow(m.id))['hidden_at']).toBeNull()
  })

  it('11.3 dos que cuentan + una que no, o la misma persona dos veces, no ocultan; la del organizador no cuenta', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6 })
    const [e1, e2] = await Promise.all([makeEligibleReporter(), makeEligibleReporter()])
    await report(e1, m.id)
    await report(e2, m.id)
    await report(await newPlayer(), m.id) // nueva: no cuenta
    expect((await matchRow(m.id))['hidden_at']).toBeNull()
    // Una denuncia por denunciante, partido y denunciado.
    expect(pgCode(await caught(report(e1, m.id)))).toBe('23505')
    // El organizador denunciando su propio partido no suma.
    await adminSql()`UPDATE players SET created_at = now() - interval '30 days' WHERE id = ${org}`
    expect((await report(org, m.id))[0]!['counts_for_autohide']).toBe(false)
    expect((await matchRow(m.id))['hidden_at']).toBeNull()
    // Control: una tercera que sí cuenta lo oculta.
    await report(await makeEligibleReporter(), m.id)
    expect((await matchRow(m.id))['hidden_at']).not.toBeNull()
  }, 30_000)

  it('11.4 las denuncias a una persona no ocultan el partido; solo se denuncia a quien está en él', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6 })
    const a = await newPlayer()
    await join(a, m.code)
    const reporters = await Promise.all([
      makeEligibleReporter(),
      makeEligibleReporter(),
      makeEligibleReporter(),
    ])
    for (const r of reporters) await report(r, m.id, a)
    expect((await matchRow(m.id))['hidden_at']).toBeNull()
    // Denunciar a alguien que no está en el partido, o a uno mismo, se rechaza.
    await rejectsRival('rival_invalid_report', report(reporters[0]!, m.id, await newPlayer()))
    await rejectsRival('rival_invalid_report', report(reporters[0]!, m.id, reporters[0]!))
    // Cada denunciante ve la suya y nada más.
    expect((await q(reporters[0]!, drizzleSql`SELECT id FROM rival_reports`)).length).toBe(1)
  })

  it('11.5 una reserva completada también habilita al denunciante', async () => {
    const su = adminSql()
    const p = await newPlayer()
    await su`UPDATE players SET created_at = now() - interval '30 days' WHERE id = ${p}`
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 6 })
    expect((await report(p, m.id))[0]!['counts_for_autohide']).toBe(false)
    const courtId = await insertCourt(su, tenantId)
    await insertBooking(su, {
      tenantId,
      courtId,
      playerId: p,
      date: '2026-01-11',
      status: 'completed',
    })
    const m2 = await createMatch(org, { capacity: 6 })
    expect((await report(p, m2.id))[0]!['counts_for_autohide']).toBe(true)
  })
})

// ─── 12. Perfil y suscripciones ──────────────────────────────────────────

describe('12. perfil RIVAL y alertas', () => {
  it('12.1 el jugador escribe su propio perfil RIVAL; la posición es cerrada', async () => {
    const p = await newPlayer()
    const rows = await q(
      p,
      drizzleSql`UPDATE players SET position = 'goalkeeper', zone = 'Luján', rival_accepted_at = now(),
                        rival_terms_version = 'v1', signup_source = 'rival'
                 WHERE id = ${p}::uuid RETURNING position, zone, signup_source`,
    )
    expect(rows[0]).toMatchObject({ position: 'goalkeeper', zone: 'Luján', signup_source: 'rival' })
    const e = await caught(
      q(p, drizzleSql`UPDATE players SET position = 'extremo' WHERE id = ${p}::uuid`),
    )
    expect(pgCode(e)).toBe('23514')
  })

  it('12.2 las suscripciones son del jugador; nadie ve ni toca las de otro', async () => {
    const a = await newPlayer()
    const b = await newPlayer()
    await q(
      a,
      drizzleSql`INSERT INTO rival_alert_subscriptions (player_id, tenant_id, only_goalkeeper) VALUES (${a}::uuid, ${tenantId}::uuid, true)`,
    )
    expect((await q(a, drizzleSql`SELECT id FROM rival_alert_subscriptions`)).length).toBe(1)
    expect((await q(b, drizzleSql`SELECT id FROM rival_alert_subscriptions`)).length).toBe(0)
    const e = await caught(
      q(
        b,
        drizzleSql`INSERT INTO rival_alert_subscriptions (player_id, tenant_id) VALUES (${a}::uuid, ${otherTenantId}::uuid)`,
      ),
    )
    expect(pgCode(e)).toBe('42501')
    expect(await q(b, drizzleSql`DELETE FROM rival_alert_subscriptions RETURNING id`)).toEqual([])
    expect(
      (await q(a, drizzleSql`DELETE FROM rival_alert_subscriptions RETURNING id`)).length,
    ).toBe(1)
  })

  it('12.3 la app no borra partidos, plantel, contactos ni denuncias (lo hace la retención por el worker)', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { seeking: 'players' })
    for (const t of [
      'rival_matches',
      'rival_participants',
      'rival_match_contacts',
      'rival_reports',
    ]) {
      const e = await caught(q(org, drizzleSql`DELETE FROM ${drizzleSql.identifier(t)}`))
      expect(pgCode(e), t).toBe('42501')
    }
    expect(
      (await q(org, drizzleSql`SELECT id FROM rival_matches WHERE id = ${m.id}::uuid`)).length,
    ).toBe(1)
  })
})

// ─── 13. Borrar la reserva no bloquea ni rompe el partido ────────────────

describe('13. la reserva vinculada se borra (cancelar un abonado, liberar un bloqueo)', () => {
  /** Partido vinculado a una reserva confirmada del organizador, por el camino de producción. */
  async function bookedMatch(
    org: string,
  ): Promise<{ id: string; code: string; bookingId: string }> {
    const su = adminSql()
    const courtId = await insertCourt(su, tenantId)
    const date = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10)
    const bookingId = await insertBooking(su, {
      tenantId,
      courtId,
      playerId: org,
      date,
      timeStart: '20:00',
      timeEnd: '21:00',
      status: 'confirmed',
    })
    const startsAt = (
      await su<{ s: Date }[]>`SELECT starts_at AS s FROM bookings WHERE id = ${bookingId}`
    )[0]!.s
    const rows = await q(
      org,
      drizzleSql`INSERT INTO rival_matches (tenant_id, organizer_player_id, booking_id, starts_at, format, capacity, level)
                 VALUES (${tenantId}::uuid, ${org}::uuid, ${bookingId}::uuid, ${startsAt.toISOString()}::timestamptz, 5, 10, 'parejo')
                 RETURNING id, invite_code`,
    )
    return { id: String(rows[0]!['id']), code: String(rows[0]!['invite_code']), bookingId }
  }

  const stampOf = async (code: string): Promise<boolean> =>
    (await q(null, drizzleSql`SELECT has_stamp FROM rival_public_match(${code})`))[0]![
      'has_stamp'
    ] as boolean

  it('13.1 el DELETE de la reserva (como lo hace el complejo, rol de la app) no falla: el partido queda sin reserva ni sello', async () => {
    const org = await newPlayer()
    const m = await bookedMatch(org)
    const guest = await newPlayer()
    await join(guest, m.code)
    expect(await stampOf(m.code)).toBe(true) // control: con la reserva viva, hay sello

    // Mismo contexto que abonado.service.ts (cancelAbonado): turnogol_app con app.current_tenant_id.
    await withTenantContext(tenantId, async (tx) => {
      await tx.execute(drizzleSql`DELETE FROM bookings WHERE id = ${m.bookingId}::uuid`)
    })

    const row = await matchRow(m.id)
    expect(row['booking_id']).toBeNull()
    // No se afirma una declaración que el organizador no hizo.
    expect(row['court_declared']).toBe(false)
    expect(row['status']).toBe('open')
    expect(await stampOf(m.code)).toBe(false)
    const mine = await q(
      org,
      drizzleSql`SELECT has_stamp FROM rival_my_matches() WHERE id = ${m.id}::uuid`,
    )
    expect(mine[0]!['has_stamp']).toBe(false)
    // El plantel no se toca.
    expect(Object.values(await statuses(m.id)).sort()).toEqual(['confirmed', 'confirmed'])
  })

  it('13.2 el borrado por el pool admin/worker (retención) deja lo mismo', async () => {
    const org = await newPlayer()
    const m = await bookedMatch(org)
    await adminSql()`DELETE FROM bookings WHERE id = ${m.bookingId}`
    expect((await matchRow(m.id))['booking_id']).toBeNull()
    expect(await stampOf(m.code)).toBe(false)
  })

  it('13.3 el organizador no puede soltar la reserva ni declarar cancha después: sigue siendo inmutable', async () => {
    const org = await newPlayer()
    const m = await bookedMatch(org)
    await rejectsRival(
      'rival_immutable',
      q(org, drizzleSql`UPDATE rival_matches SET booking_id = NULL WHERE id = ${m.id}::uuid`),
    )
    await rejectsRival(
      'rival_immutable',
      q(org, drizzleSql`UPDATE rival_matches SET court_declared = true WHERE id = ${m.id}::uuid`),
    )
  })
})

// ─── 14. La señal de "escritura interna" no se fabrica ───────────────────

describe('14. un trigger temporal del jugador no saltea las reglas (turnogol_app tiene TEMP)', () => {
  let seq = 0

  /**
   * El ataque: una tabla TEMP con un trigger propio que ejecuta `body` en profundidad 2. Con
   * `pg_trigger_depth() > 1` como señal, las reglas del actor se salteaban. Devuelve el error
   * (null si el ataque pasó).
   */
  async function attack(actor: string, body: string): Promise<unknown> {
    const n = ++seq
    try {
      await withPlayerContext(actor, async (tx) => {
        await tx.execute(drizzleSql.raw(`CREATE TEMP TABLE evil_t${n} (x int) ON COMMIT DROP`))
        await tx.execute(
          drizzleSql.raw(
            `CREATE FUNCTION pg_temp.evil_fn${n}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN ${body}; RETURN NEW; END $f$`,
          ),
        )
        await tx.execute(
          drizzleSql.raw(
            `CREATE TRIGGER evil_trg AFTER INSERT ON evil_t${n} FOR EACH ROW EXECUTE FUNCTION pg_temp.evil_fn${n}()`,
          ),
        )
        await tx.execute(drizzleSql.raw(`INSERT INTO evil_t${n} VALUES (1)`))
        // La conexión vuelve al pool: que no quede la función colgada si el ataque pasó.
        await tx.execute(drizzleSql.raw(`DROP FUNCTION pg_temp.evil_fn${n}() CASCADE`))
      })
      return null
    } catch (e) {
      return e
    }
  }

  it('14.0 control: el trigger temporal se ejecuta de verdad y rival_is_internal_write es falso de primer nivel', async () => {
    const p = await newPlayer()
    const m = await createMatch(await newPlayer(), { seeking: 'players' })
    // Un trigger inocuo pasa; uno que levanta un error lo hace salir: prueba que el trigger
    // temporal SE EJECUTA. Si el mecanismo del ataque no corriera, el resto de la sección pasaría
    // en verde sin haber ejercitado nada.
    expect(
      await attack(p, `PERFORM 1 FROM rival_board('${tenantId}'::uuid) WHERE id = '${m.id}'::uuid`),
    ).toBeNull()
    const ran = await attack(p, `RAISE EXCEPTION 'rival_probe'`)
    expect(rivalErrorCode(ran)).toBe('rival_probe')
    expect((await q(p, drizzleSql`SELECT rival_is_internal_write() AS i`))[0]!['i']).toBe(false)
  })

  it('14.1 no se autoacepta un pedido del tablón ni lee el WhatsApp del organizador', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 4, seeking: 'players' })
    const r = await newPlayer()
    const pid = await request(r, m.id)

    const e = await attack(
      r,
      `UPDATE rival_participants SET status = 'confirmed' WHERE id = '${pid}'::uuid`,
    )
    expect(rivalErrorCode(e), String((e as Error | null)?.message)).toBe(
      'rival_forbidden_transition',
    )
    expect((await statuses(m.id))[r]).toBe('requested')
    expect(
      await q(
        r,
        drizzleSql`SELECT match_id FROM rival_match_contacts WHERE match_id = ${m.id}::uuid`,
      ),
    ).toEqual([])

    // Control: el MISMO cambio lo hace el organizador por el camino legítimo.
    expect(await setStatus(org, pid, 'confirmed')).toHaveLength(1)
    expect((await statuses(m.id))[r]).toBe('confirmed')
  })

  it('14.2 un baneado no se mete en el tablón insertando su pedido desde un trigger propio', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 4, seeking: 'players' })
    const banned = await newPlayer()
    await insertBan(adminSql(), { tenantId, playerId: banned, bannedBy: staffId })
    const e = await attack(
      banned,
      `INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin) VALUES ('${tenantId}'::uuid, '${m.id}'::uuid, '${banned}'::uuid, 'requested', 'board')`,
    )
    expect(rivalErrorCode(e), String((e as Error | null)?.message)).toBe('rival_banned')
    expect((await statuses(m.id))[banned]).toBeUndefined()
  })

  it('14.3 el organizador no destapa su partido oculto desde un trigger propio', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { seeking: 'players' })
    await adminSql()`UPDATE rival_matches SET hidden_at = now() WHERE id = ${m.id}`
    const e = await attack(
      org,
      `UPDATE rival_matches SET hidden_at = NULL WHERE id = '${m.id}'::uuid`,
    )
    expect(rivalErrorCode(e), String((e as Error | null)?.message)).toBe('rival_immutable')
    expect((await matchRow(m.id))['hidden_at']).not.toBeNull()
  })

  it('14.4 rival_join_by_invite (escribe como el dueño) se niega a correr dentro de un trigger: no hay sobrecupo', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    await join(await newPlayer(), m.code) // 2/2
    const intruso = await newPlayer()
    const e = await attack(intruso, `PERFORM * FROM rival_join_by_invite('${m.code}')`)
    expect(rivalErrorCode(e), String((e as Error | null)?.message)).toBe(
      'rival_forbidden_transition',
    )
    expect((await statuses(m.id))[intruso]).toBeUndefined()
    // Control: de primer nivel entra, al banco (sin cupo).
    expect((await join(intruso, m.code))['status']).toBe('bench')
  })

  it('14.5 la promoción legítima del banco y el recuento siguen andando (son escrituras internas del dueño)', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const a = await newPlayer()
    const b = await newPlayer()
    await join(a, m.code)
    await join(b, m.code) // banco
    expect((await statuses(m.id))[b]).toBe('bench')
    await setStatus(a, await participantId(m.id, a), 'left')
    expect((await statuses(m.id))[b]).toBe('confirmed')
    expect((await matchRow(m.id))['confirmed_count']).toBe(2)
  })
})

// ─── 15. El participante no lee la fila del partido ──────────────────────

describe('15. invite_code: solo el organizador lee rival_matches directo', () => {
  it('15.1 un confirmado y uno del banco no ven la fila; su partido les llega por rival_my_matches sin el código', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const conf = await newPlayer()
    const bench = await newPlayer()
    await join(conf, m.code)
    await join(bench, m.code)
    const st = await statuses(m.id)
    expect([st[conf], st[bench]]).toEqual(['confirmed', 'bench'])

    // Control: el organizador sí la lee, con el código.
    const own = await q(
      org,
      drizzleSql`SELECT invite_code FROM rival_matches WHERE id = ${m.id}::uuid`,
    )
    expect(own[0]!['invite_code']).toBe(m.code)

    for (const who of [conf, bench]) {
      expect(await q(who, drizzleSql`SELECT invite_code FROM rival_matches`)).toEqual([])
      expect(
        await q(who, drizzleSql`SELECT * FROM rival_matches WHERE id = ${m.id}::uuid FOR UPDATE`),
      ).toEqual([])
      const mine = await q(
        who,
        drizzleSql`SELECT id, invite_code, my_status FROM rival_my_matches()`,
      )
      expect(mine).toHaveLength(1)
      expect(mine[0]!['id']).toBe(m.id)
      expect(mine[0]!['invite_code']).toBeNull()
      // Y el plantel por la función.
      expect(
        (await q(who, drizzleSql`SELECT * FROM rival_roster(${m.id}::uuid)`)).length,
      ).toBeGreaterThan(0)
    }
  })
})

// ─── 16. Menores ─────────────────────────────────────────────────────────

describe('16. anonimizado, complejo no visible, bans al aceptar y al promover, listas cerradas', () => {
  it('16.1 un anonimizado sale como "Jugador anonimizado", sin "[eliminado] [."', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 4 })
    const gone = await newPlayer({ first: 'Ana', last: 'Gomez' })
    await join(gone, m.code)
    const roster = async (who: string): Promise<string[]> =>
      (await q(who, drizzleSql`SELECT short_name FROM rival_roster(${m.id}::uuid)`)).map((r) =>
        String(r['short_name']),
      )
    expect(await roster(org)).toContain('Ana G.') // control
    await adminSql()`UPDATE players SET status = 'anonymized', first_name = '[eliminado]', last_name = '[eliminado]' WHERE id = ${gone}`
    const names = await roster(org)
    expect(names).toContain('Jugador anonimizado')
    expect(names.join('|')).not.toContain('[')
    expect(names.join('|')).not.toContain('eliminado')
  })

  it('16.2 un complejo suspendido o bloqueado (o fuera del marketplace) no muestra partidos en el tablón; el link del grupo sigue sirviendo', async () => {
    const su = adminSql()
    const t = (await createTestTenant(su)).id
    const m = await createMatch(await newPlayer(), { tenant: t, seeking: 'players' })
    const onBoard = async (): Promise<number> =>
      (await q(null, drizzleSql`SELECT id FROM rival_board(${t}::uuid)`)).length
    expect(await onBoard()).toBe(1) // control
    for (const status of ['suspended', 'blocked']) {
      await su.unsafe(`UPDATE tenants SET status = '${status}' WHERE id = '${t}'`)
      expect(await onBoard(), status).toBe(0)
      // rival_public_match NO se filtra por esto.
      expect(await q(null, drizzleSql`SELECT id FROM rival_public_match(${m.code})`)).toHaveLength(
        1,
      )
    }
    await su`UPDATE tenants SET status = 'active' WHERE id = ${t}`
    expect(await onBoard()).toBe(1)
    await su`UPDATE tenants SET marketplace_visible = false WHERE id = ${t}`
    expect(await onBoard()).toBe(0)
    await su`UPDATE tenants SET marketplace_visible = true WHERE id = ${t}`
    await su`UPDATE tenants SET settings = settings || '{"onboarding_completed": false}'::jsonb WHERE id = ${t}`
    expect(await onBoard()).toBe(0)
  })

  it('16.3 aceptar el pedido de alguien baneado después de pedir falla con rival_banned; el pedido queda como estaba', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 4, seeking: 'players' })
    const r = await newPlayer()
    const pid = await request(r, m.id)
    const ok = await newPlayer()
    const okPid = await request(ok, m.id)
    await insertBan(adminSql(), { tenantId, playerId: r, bannedBy: staffId })
    await rejectsRival('rival_banned', setStatus(org, pid, 'confirmed'))
    expect((await statuses(m.id))[r]).toBe('requested')
    // Control: aceptar a otro sin ban funciona, y rechazar al baneado se puede.
    expect(await setStatus(org, okPid, 'confirmed')).toHaveLength(1)
    expect(await setStatus(org, pid, 'declined')).toHaveLength(1)
  })

  it('16.4 la promoción del banco saltea al baneado y promueve al siguiente; el baneado sigue en el banco', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const a = await newPlayer()
    const b = await newPlayer()
    const c = await newPlayer()
    await join(a, m.code) // 2/2
    await join(b, m.code) // banco, primero
    await join(c, m.code) // banco, segundo
    await insertBan(adminSql(), { tenantId, playerId: b, bannedBy: staffId })
    await setStatus(a, await participantId(m.id, a), 'left')
    const st = await statuses(m.id)
    expect(st[c]).toBe('confirmed')
    expect(st[b]).toBe('bench')
    expect((await matchRow(m.id))['confirmed_count']).toBe(2)
  })

  it('16.5 zona y posición son listas cerradas en la base', async () => {
    const su = adminSql()
    const p = await newPlayer()
    await su`UPDATE players SET zone = 'Luján', position = 'goalkeeper' WHERE id = ${p}`
    const bad = async (col: string, v: string): Promise<unknown> =>
      caught(su.unsafe(`UPDATE players SET ${col} = '${v}' WHERE id = '${p}'`))
    expect(pgCode(await bad('zone', 'Marte'))).toBe('23514')
    expect(pgCode(await bad('zone', 'x'.repeat(30)))).toBe('23514')
    expect(pgCode(await bad('position', 'striker'))).toBe('23514')
  })
})

// ─── 17. Denuncias simultáneas ───────────────────────────────────────────

describe('17. tres denuncias simultáneas contra el mismo partido', () => {
  it('17.1 sin deadlocks (40P01) y el partido queda oculto, ronda tras ronda', async () => {
    const su = adminSql()
    const reporters = await Promise.all(Array.from({ length: 12 }, () => makeEligibleReporter()))
    for (let round = 0; round < 4; round++) {
      const m = await createMatch(await newPlayer(), { seeking: 'players' })
      const trio = reporters.slice(round * 3, round * 3 + 3)
      let release!: () => void
      const gate = new Promise<void>((r) => (release = r))
      let held!: () => void
      const heldP = new Promise<void>((r) => (held = r))
      // Barrera: la fila del partido tomada desde afuera; las tres denuncias se encolan detrás.
      const holder = su.begin(async (tx) => {
        await tx`SELECT id FROM rival_matches WHERE id = ${m.id} FOR UPDATE`
        held()
        await gate
      })
      await heldP
      const runs = trio.map((r) =>
        report(r, m.id).then(
          () => null,
          (e: unknown) => e,
        ),
      )
      const deadline = Date.now() + 3_000
      let waiting = 0
      while (waiting < 3 && Date.now() < deadline) {
        waiting = (
          await su<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE usename = 'turnogol_app' AND wait_event_type = 'Lock'`
        )[0]!.n
        if (waiting < 3) await new Promise((r) => setTimeout(r, 25))
      }
      expect(waiting, `ronda ${round}: las 3 denuncias debían encolarse`).toBe(3)
      release()
      await holder
      const errors = (await Promise.all(runs)).filter((e) => e !== null)
      expect(
        errors.map((e) => pgCode(e) ?? String(e)),
        `ronda ${round}`,
      ).toEqual([])
      expect((await matchRow(m.id))['hidden_at'], `ronda ${round}`).not.toBeNull()
    }
  }, 60_000)
})

// ─── 18. Quien se bajó vuelve por el link (decisión 10) ──────────────────

describe('18. la vuelta por el link desde `left` es un alta nueva', () => {
  async function row(matchId: string, playerId: string): Promise<Row> {
    const rows = await adminSql()<Row[]>`
      SELECT id, status, role, origin FROM rival_participants
      WHERE match_id = ${matchId} AND player_id = ${playerId}`
    return rows[0]!
  }
  async function count(matchId: string): Promise<number> {
    return Number((await matchRow(matchId))['confirmed_count'])
  }

  it('18.1 un confirmado se baja y vuelve confirmado si hay lugar', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5 })
    const a = await newPlayer()
    await join(a, m.code)
    await setStatus(a, await participantId(m.id, a), 'left')
    expect(await count(m.id)).toBe(1)
    const r = await join(a, m.code)
    expect(r).toMatchObject({ status: 'confirmed', joined: true })
    expect(await row(m.id, a)).toMatchObject({
      status: 'confirmed',
      role: 'player',
      origin: 'invite',
    })
    expect(await count(m.id)).toBe(2)
  })

  it('18.2 con el partido lleno vuelve al banco, sin promover a nadie ni mover el cupo', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const a = await newPlayer()
    const c = await newPlayer()
    const d = await newPlayer()
    await join(a, m.code) // 2/2
    await join(c, m.code) // banco
    await join(d, m.code) // banco
    await setStatus(a, await participantId(m.id, a), 'left') // entra c
    expect(await statuses(m.id)).toMatchObject({ [c]: 'confirmed', [d]: 'bench', [a]: 'left' })
    const r = await join(a, m.code)
    expect(r).toMatchObject({ status: 'bench', joined: true })
    expect(await statuses(m.id)).toMatchObject({ [c]: 'confirmed', [d]: 'bench', [a]: 'bench' })
    expect(await count(m.id)).toBe(2)
  })

  it('18.3 un capitán rival o alguien del tablón vuelve como player/invite', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5, seeking: 'rival' })
    const cap = await newPlayer()
    const capId = await request(cap, m.id)
    await setStatus(org, capId, 'confirmed')
    await setStatus(cap, capId, 'left')
    expect(await row(m.id, cap)).toMatchObject({ role: 'rival_captain', origin: 'board' })
    expect(await join(cap, m.code)).toMatchObject({ status: 'confirmed', joined: true })
    expect(await row(m.id, cap)).toMatchObject({ role: 'player', origin: 'invite' })

    const m2 = await createMatch(org, { capacity: 5, seeking: 'players' })
    const b = await newPlayer()
    const bId = await request(b, m2.id)
    await setStatus(org, bId, 'confirmed')
    await setStatus(b, bId, 'left')
    expect(await row(m2.id, b)).toMatchObject({ role: 'player', origin: 'board' })
    expect(await join(b, m2.code)).toMatchObject({ status: 'confirmed', joined: true })
    expect(await row(m2.id, b)).toMatchObject({ role: 'player', origin: 'invite' })
  })

  it('18.4 removed y declined no vuelven por el link: fila intacta, joined = false', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5, seeking: 'players' })
    const sacado = await newPlayer()
    await join(sacado, m.code)
    await setStatus(org, await participantId(m.id, sacado), 'removed')
    const rechazado = await newPlayer()
    const reqId = await request(rechazado, m.id)
    await setStatus(org, reqId, 'declined')
    const antes = await statuses(m.id)
    const idSacado = await participantId(m.id, sacado)
    expect(await join(sacado, m.code)).toMatchObject({
      participant_id: idSacado,
      status: 'removed',
      joined: false,
    })
    expect(await join(rechazado, m.code)).toMatchObject({
      participant_id: reqId,
      status: 'declined',
      joined: false,
    })
    expect(await statuses(m.id)).toEqual(antes)
    expect(await participantId(m.id, sacado)).toBe(idSacado)
  })

  it('18.5 confirmed, bench y requested siguen devolviendo su fila con joined = false', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2, seeking: 'players' })
    const a = await newPlayer()
    const b = await newPlayer()
    const p = await newPlayer()
    const reqId = await request(p, m.id)
    await join(a, m.code) // 2/2
    await join(b, m.code) // banco
    expect(await join(a, m.code)).toMatchObject({ status: 'confirmed', joined: false })
    expect(await join(b, m.code)).toMatchObject({ status: 'bench', joined: false })
    expect(await join(p, m.code)).toMatchObject({
      participant_id: reqId,
      status: 'requested',
      joined: false,
    })
  })

  it('18.6 baneado, vencido, cancelado u oculto: se rechaza y la fila left queda intacta', async () => {
    const su = adminSql()
    const org = await newPlayer()
    const casos: [string, string, (matchId: string, p: string) => Promise<unknown>][] = [
      [
        'rival_banned',
        'baneado',
        (_id, p) => insertBan(su, { tenantId, playerId: p, bannedBy: staffId }),
      ],
      ['rival_expired', 'vencido', (id) => expire(id)],
      [
        'rival_canceled',
        'cancelado',
        (id) => su`UPDATE rival_matches SET status = 'canceled' WHERE id = ${id}`,
      ],
      [
        'rival_not_found',
        'oculto',
        (id) => su`UPDATE rival_matches SET hidden_at = now() WHERE id = ${id}`,
      ],
    ]
    for (const [code, label, apply] of casos) {
      const m = await createMatch(org, { capacity: 5 })
      const a = await newPlayer()
      await join(a, m.code)
      const id = await participantId(m.id, a)
      await setStatus(a, id, 'left')
      const antes = await count(m.id)
      await apply(m.id, a)
      await rejectsRival(code, join(a, m.code))
      expect(await row(m.id, a), label).toMatchObject({ id, status: 'left' })
      expect(await count(m.id), label).toBe(antes)
    }
  })

  it('18.7 el borrado de la fila left no promueve al banco aunque haya lugar (el del banco tiene ban)', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 2 })
    const a = await newPlayer()
    const c = await newPlayer()
    await join(a, m.code) // 2/2
    await join(c, m.code) // banco
    await insertBan(adminSql(), { tenantId, playerId: c, bannedBy: staffId })
    await setStatus(a, await participantId(m.id, a), 'left') // lugar libre; c baneado se saltea
    expect(await statuses(m.id)).toMatchObject({ [c]: 'bench', [a]: 'left' })
    const antes = await count(m.id)
    await join(a, m.code) // borra left e inserta de nuevo
    expect(await statuses(m.id)).toMatchObject({ [c]: 'bench', [a]: 'confirmed' })
    expect(await count(m.id)).toBe(antes + 1)
  })

  it('18.8 el cliente sigue sin poder borrar su fila', async () => {
    const org = await newPlayer()
    const m = await createMatch(org, { capacity: 5 })
    const a = await newPlayer()
    await join(a, m.code)
    const id = await participantId(m.id, a)
    await setStatus(a, id, 'left')
    expectDenied(
      await caught(q(a, drizzleSql`DELETE FROM rival_participants WHERE id = ${id}::uuid`)),
      'delete directo',
    )
    expect((await row(m.id, a))['status']).toBe('left')
  })
})
