/**
 * El service de RIVAL (`src/modules/rival/rival.service.ts`) medido con el ROL REAL de la app
 * (`turnogol_app`, sin BYPASSRLS) por el envoltorio de producción (`withPlayerContext`).
 *
 * Por qué con el rol real: el cupo, el banco, las transiciones por actor y quién puede leer el
 * WhatsApp viven en triggers, funciones SECURITY DEFINER y RLS que dependen de
 * `app.current_player_id`. Con un rol BYPASSRLS este archivo pasaría en verde sin haber ejercitado
 * nada de eso. `rival-db-app-role.test.ts` mide la base a pelo; acá se mide lo que ve el caller del
 * service (errores de dominio, mapeo de filas, el `wa.me` armado en el servidor).
 *
 * Mismo arnés que `rival-db-app-role.test.ts`: LOGIN del rol mientras dura el archivo (se devuelve
 * el verifier original en el `afterAll`) y siembra SIEMPRE por el pool admin.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, getWorkerSql } from '@/shared/db/client'
import { clearFeatureFlagCache } from '@/shared/feature-flags'
import { addDays, artTodayStr } from '@/shared/dates/art'
import {
  acceptRivalWelcome,
  cancelMatch,
  createMatch,
  decideRequest,
  getBoardMatch,
  getBoardPublishPrefill,
  getContactLink,
  getMyMatch,
  getRepeatPrefill,
  getPublicMatch,
  getRivalWelcomeState,
  getRoster,
  joinByInvite,
  leaveMatch,
  listBoard,
  listBoardTenants,
  listEligibleTenants,
  listMyMatches,
  listUpcomingConfirmedBookings,
  publishToBoard,
  removeParticipant,
  reportMatch,
  reportPlayer,
  requestToJoin,
  RIVAL_TERMS_VERSION,
  unpublishFromBoard,
} from '@/modules/rival/rival.service'
import { artDateOf } from '@/shared/time/art-date'
import { artTimeOf } from '@/modules/rival/rival-display'
import { mapRivalDbError, RivalError } from '@/modules/rival/rival.errors'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { createRivalMatchSchema, publishBoardSchema } from '@/modules/rival/rival.schema'
import { adminSql } from '../helpers/admin-db'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
} from '../helpers/tenant'
import { insertBan, insertBooking, insertCourt } from '../helpers/factories'

const APP_TEST_PASSWORD = 'turnogol_app_rival_service'
const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
const POOL_MAX = '16'
const HOUR = 3_600_000

let prevAppUrl: string | undefined
let prevAdminUrl: string | undefined
let prevPoolMax: string | undefined
let prevAppVerifier: string | null = null
let appCouldLoginBefore = false

let tenant: { id: string; slug: string; name: string }
let staffId: string

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
  tenant = await createTestTenant(su)
  staffId = (await createTestStaffUser(su)).id
}, 60_000)

afterAll(async () => {
  await closeSql()
  const su = adminSql()
  await su`UPDATE feature_flags SET value = false WHERE key = 'rival' AND tenant_id IS NULL`
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

/** Jugador con la bienvenida RIVAL aceptada (nombre fijo para poder leerlo en el texto del wa.me). */
async function welcomedPlayer(firstName: string): Promise<string> {
  const id = (await createTestPlayer(adminSql())).id
  await acceptRivalWelcome(id, { firstName, position: 'midfielder', zone: 'Luján' })
  return id
}

/** Instante dentro de `hoursAhead` horas, redondeado hacia arriba a la hora en punto. */
function startsAtIn(hoursAhead: number): string {
  return new Date(Math.ceil((Date.now() + hoursAhead * HOUR) / HOUR) * HOUR).toISOString()
}

const WHATSAPP = '11 5555-1234' // -> 5491155551234

function board(seeking: 'players' | 'rival' = 'players', position?: 'any' | 'goalkeeper') {
  return publishBoardSchema.parse({
    seeking,
    ...(position ? { seekingPosition: position } : {}),
    whatsapp: WHATSAPP,
    whatsappConsent: true,
  })
}

function draft(
  o: {
    tenantId?: string
    hoursAhead?: number
    capacity?: number
    format?: number
    bookingId?: string
    withBoard?: 'players' | 'rival'
  } = {},
) {
  return createRivalMatchSchema.parse({
    tenantId: o.tenantId ?? tenant.id,
    startsAt: startsAtIn(o.hoursAhead ?? 48),
    format: o.format ?? 5,
    capacity: o.capacity,
    level: 'parejo',
    courtDeclared: o.bookingId === undefined,
    ...(o.bookingId ? { bookingId: o.bookingId } : {}),
    ...(o.withBoard
      ? { board: { seeking: o.withBoard, whatsapp: WHATSAPP, whatsappConsent: true } }
      : {}),
  })
}

async function rejectsWith(code: string, p: Promise<unknown>): Promise<void> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e, `debía fallar con ${code}`).toBeInstanceOf(RivalError)
  expect((e as RivalError).code).toBe(code)
}

async function statusesOf(matchId: string): Promise<Record<string, string>> {
  const rows = await adminSql()<{ player_id: string; status: string }[]>`
    SELECT player_id, status FROM rival_participants WHERE match_id = ${matchId}
  `
  return Object.fromEntries(rows.map((r) => [r.player_id, r.status]))
}

// ─── 1. El recorrido completo ────────────────────────────────────────────

describe('1. recorrido: grupo, banco, tablón, contacto y cancelación', () => {
  const names = { a: 'Ana', b: 'Beto', f: 'Fede', c: 'Caro', d: 'Dani', e: 'Eli' }
  let A: string, B: string, F: string, C: string, D: string, E: string
  let matchId: string
  let code: string

  beforeAll(async () => {
    ;[A, B, F, C, D, E] = await Promise.all([
      welcomedPlayer(names.a),
      welcomedPlayer(names.b),
      welcomedPlayer(names.f),
      welcomedPlayer(names.c),
      welcomedPlayer(names.d),
      welcomedPlayer(names.e),
    ])
  })

  it('1.1 A arma el partido y comparte el link: sin sesión se ve el partido y el contador, sin personas', async () => {
    const created = await createMatch(A, draft({ capacity: 3 }))
    matchId = created.id
    code = created.inviteCode
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/)

    const pub = await getPublicMatch(code)
    expect(pub).toMatchObject({
      id: matchId,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      format: 5,
      capacity: 3,
      level: 'parejo',
      status: 'open',
      confirmedCount: 1,
      courtDeclared: true,
      hasStamp: false,
      isOrganizer: false,
      seeking: null,
    })
    expect(pub!.startsAt).toBeInstanceOf(Date)
    expect(pub!.startsAt.toISOString()).toBe(startsAtIn(48))
    // Sin personas: ni una clave que las nombre.
    expect(
      Object.keys(pub!).filter((k) => /organizerPlayer|playerId|organizerId/i.test(k)),
    ).toEqual([])
    // El organizador, con sesión, se reconoce.
    expect((await getPublicMatch(code, A))!.isOrganizer).toBe(true)
    // Un código mal formado o inexistente no es un error: es "no hay partido".
    expect(await getPublicMatch('nope')).toBeNull()
    expect(await getPublicMatch('AAAAAAAAAA')).toBeNull()
  })

  it('1.2 B se suma por el link (idempotente) y con F se llena el cupo', async () => {
    const first = await joinByInvite(B, code)
    expect(first).toMatchObject({ matchId, status: 'confirmed', joined: true })
    const again = await joinByInvite(B, code)
    expect(again).toMatchObject({
      participantId: first.participantId,
      status: 'confirmed',
      joined: false,
    })

    await joinByInvite(F, code)
    const pub = await getPublicMatch(code)
    expect(pub!.confirmedCount).toBe(3)
    expect(pub!.filledAt).toBeInstanceOf(Date)
  })

  it('1.3 C llega con el cupo lleno y queda en el banco', async () => {
    const r = await joinByInvite(C, code)
    expect(r).toMatchObject({ matchId, status: 'bench', joined: true })
    expect((await getPublicMatch(code))!.confirmedCount).toBe(3)
  })

  it('1.4 el plantel: el organizador ve todo; con el link solo los confirmados y sin posición ni zona', async () => {
    const asOrganizer = await getRoster(A, matchId)
    expect(asOrganizer.map((r) => r.status).sort()).toEqual([
      'bench',
      'confirmed',
      'confirmed',
      'confirmed',
    ])
    const caro = asOrganizer.find((r) => r.playerId === C)!
    expect(caro).toMatchObject({
      status: 'bench',
      position: 'midfielder',
      zone: 'Luján',
      isMe: false,
    })
    expect(caro.gamesPlayed).toBe(0)
    expect(caro.memberSince).toBeInstanceOf(Date)
    expect(asOrganizer.find((r) => r.playerId === A)!.shortName).toMatch(/^Ana/)

    // E tiene el link (no participa): ve a los confirmados, nada más.
    const withLink = await getRoster(E, matchId, code)
    expect(withLink.map((r) => r.status)).toEqual(['confirmed', 'confirmed', 'confirmed'])
    for (const r of withLink) {
      expect(r.position).toBeNull()
      expect(r.zone).toBeNull()
      expect(r.gamesPlayed).toBeNull()
      expect(r.memberSince).toBeNull()
    }
    // Sin el link ni participar (solo el id del tablón) no ve a nadie.
    expect(await getRoster(E, matchId)).toEqual([])
    // Un código mal formado se ignora (no abre la puerta).
    expect(await getRoster(E, matchId, 'nope')).toEqual([])
  })

  it('1.5 B se baja y entra C, en orden de llegada', async () => {
    await leaveMatch(B, matchId)
    const st = await statusesOf(matchId)
    expect(st[B]).toBe('left')
    expect(st[C]).toBe('confirmed')
    const pub = await getPublicMatch(code)
    expect(pub!.confirmedCount).toBe(3)
    // Volver a bajarse es un no-op, no un error; bajarse de un partido ajeno sí falla.
    await leaveMatch(B, matchId)
    await rejectsWith('rival_not_found', leaveMatch(E, matchId))
  })

  it('1.6 el organizador saca a F y se libera un lugar', async () => {
    const roster = await getRoster(A, matchId)
    const fede = roster.find((r) => r.playerId === F)!
    // Alguien que no es el organizador no puede sacar a nadie.
    await rejectsWith('rival_not_found', removeParticipant(E, fede.participantId))
    await rejectsWith('rival_not_found', removeParticipant(F, fede.participantId))
    await removeParticipant(A, fede.participantId)
    expect((await statusesOf(matchId))[F]).toBe('removed')
    expect((await getPublicMatch(code))!.confirmedCount).toBe(2)
  })

  it('1.7 A publica en el tablón, D y E piden, A acepta a D', async () => {
    await publishToBoard(A, matchId, board('players', 'any'))

    const page = await listBoard({ tenantId: tenant.id })
    const card = page.items.find((i) => i.id === matchId)!
    expect(card).toMatchObject({
      tenantName: tenant.name,
      seeking: 'players',
      seekingPosition: 'any',
      confirmedCount: 2,
      capacity: 3,
      hasStamp: false,
    })
    // La tarjeta del tablón no filtra el código ni al organizador.
    expect(JSON.stringify(card)).not.toContain(code)
    expect(Object.keys(card)).not.toContain('inviteCode')
    expect(Object.keys(card)).not.toContain('organizerPlayerId')

    const reqD = await requestToJoin(D, { matchId, tenantId: tenant.id })
    await requestToJoin(E, { matchId, tenantId: tenant.id })
    expect((await statusesOf(matchId))[D]).toBe('requested')
    // Antes de que acepten nadie ve el contacto.
    expect(await getContactLink(D, matchId)).toBeNull()
    expect(await getContactLink(E, matchId)).toBeNull()
    // Pedir dos veces es un error de dominio, no un 23505 crudo.
    await rejectsWith(
      'rival_already_participant',
      requestToJoin(D, { matchId, tenantId: tenant.id }),
    )

    // Solo el organizador decide.
    await rejectsWith('rival_not_found', decideRequest(E, reqD.participantId, 'accept'))
    await rejectsWith('rival_not_found', decideRequest(D, reqD.participantId, 'accept'))
    await decideRequest(A, reqD.participantId, 'accept')
    expect((await statusesOf(matchId))[D]).toBe('confirmed')
  })

  it('1.8 D obtiene el wa.me al organizador y nadie más: ni E, ni C (invitado), ni B (se bajó), ni el propio A', async () => {
    const link = await getContactLink(D, matchId)
    expect(link).not.toBeNull()
    const url = new URL(link!)
    expect(url.origin + url.pathname).toBe('https://wa.me/5491155551234')
    expect(url.searchParams.get('text')).toMatch(
      new RegExp(
        `^Hola, soy ${names.d} de RIVAL\\. Me aceptaste para el partido del [a-záéíóú]+ \\d{2}:\\d{2} en ${tenant.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.$`,
      ),
    )

    expect(await getContactLink(E, matchId)).toBeNull()
    // C entró por el link del grupo (origen invite): el contacto es solo del tablón.
    expect(await getContactLink(C, matchId)).toBeNull()
    expect(await getContactLink(B, matchId)).toBeNull()
    expect(await getContactLink(A, matchId)).toBeNull()
  })

  it('1.9 el pedido rechazado: E lee "esta vez no" y no obtiene el contacto', async () => {
    // El partido tiene 3 confirmados (A, C, D): aceptar a E ya no entra.
    const roster = await getRoster(A, matchId)
    const eli = roster.find((r) => r.playerId === E)!
    expect(eli.status).toBe('requested')
    await rejectsWith('rival_full', decideRequest(A, eli.participantId, 'accept'))
    await decideRequest(A, eli.participantId, 'decline')
    expect((await statusesOf(matchId))[E]).toBe('declined')
    expect(await getContactLink(E, matchId)).toBeNull()
  })

  it('1.10 A cancela: el contacto desaparece, el partido sale del tablón y nadie más se suma', async () => {
    const su = adminSql()
    expect(await su`SELECT 1 FROM rival_match_contacts WHERE match_id = ${matchId}`).toHaveLength(1)

    await cancelMatch(A, matchId)

    expect(await su`SELECT 1 FROM rival_match_contacts WHERE match_id = ${matchId}`).toHaveLength(0)
    expect(await getContactLink(D, matchId)).toBeNull()
    expect((await getPublicMatch(code))!.status).toBe('canceled')
    expect((await listBoard({ tenantId: tenant.id })).items.map((i) => i.id)).not.toContain(matchId)
    const late = await welcomedPlayer('Tarde')
    await rejectsWith('rival_canceled', joinByInvite(late, code))
    // Cancelar de nuevo no se reabre.
    await rejectsWith('rival_forbidden_transition', cancelMatch(A, matchId))
  })
})

// ─── 2. Errores de dominio ───────────────────────────────────────────────

describe('2. errores de dominio (ningún error de la base llega crudo)', () => {
  it('2.1 sin bienvenida no se puede organizar, sumarse ni pedir', async () => {
    const raw = (await createTestPlayer(adminSql())).id
    await rejectsWith('rival_welcome_required', createMatch(raw, draft()))
    const org = await welcomedPlayer('Org')
    const m = await createMatch(org, draft({ withBoard: 'players' }))
    await rejectsWith('rival_welcome_required', joinByInvite(raw, m.inviteCode))
    await rejectsWith(
      'rival_welcome_required',
      requestToJoin(raw, { matchId: m.id, tenantId: tenant.id }),
    )
  })

  it('2.2 la bienvenida guarda el perfil y la versión vigente; una versión vieja vuelve a pedirla', async () => {
    const id = (await createTestPlayer(adminSql())).id
    await acceptRivalWelcome(id, { firstName: 'Zeta', position: 'goalkeeper', zone: 'Otra zona' })
    const [row] = await adminSql()<
      {
        first_name: string
        position: string
        zone: string
        rival_accepted_at: Date | null
        rival_terms_version: string
      }[]
    >`SELECT first_name, position, zone, rival_accepted_at, rival_terms_version FROM players WHERE id = ${id}`
    expect(row).toMatchObject({
      first_name: 'Zeta',
      position: 'goalkeeper',
      zone: 'Otra zona',
      rival_terms_version: RIVAL_TERMS_VERSION,
    })
    expect(row!.rival_accepted_at).toBeInstanceOf(Date)

    await createMatch(id, draft())
    await adminSql()`UPDATE players SET rival_terms_version = 'rival-vieja' WHERE id = ${id}`
    await rejectsWith('rival_welcome_required', createMatch(id, draft()))
  })

  it('2.3 el complejo tiene que ser público: oculto o dado de baja no admite partidos', async () => {
    const su = adminSql()
    const hidden = await createTestTenant(su)
    await su`UPDATE tenants SET marketplace_visible = false WHERE id = ${hidden.id}`
    const blocked = await createTestTenant(su)
    await su`UPDATE tenants SET status = 'blocked' WHERE id = ${blocked.id}`
    const noOnboarding = await createTestTenant(su, { onboardingCompleted: false })
    const org = await welcomedPlayer('Pub')
    for (const t of [hidden, blocked, noOnboarding]) {
      await rejectsWith('rival_tenant_unavailable', createMatch(org, draft({ tenantId: t.id })))
    }
    // Control: el complejo visible sí.
    await expect(createMatch(org, draft())).resolves.toMatchObject({ id: expect.any(String) })
  })

  it('2.4 publicar sin WhatsApp es imposible por el schema; con él, el contacto se crea en la misma transacción', async () => {
    const org = await welcomedPlayer('Pub2')
    const m = await createMatch(org, draft({ withBoard: 'rival' }))
    const [c] = await adminSql()<{ whatsapp_digits: string }[]>`
      SELECT whatsapp_digits FROM rival_match_contacts WHERE match_id = ${m.id}
    `
    expect(c!.whatsapp_digits).toBe('5491155551234')
    const pub = await getPublicMatch(m.inviteCode)
    // Busca rival: el cupo es el formato.
    expect(pub).toMatchObject({ seeking: 'rival', capacity: 5, seekingPosition: null })
  })

  it('2.5 tope de 3 partidos activos, tope de 5 pedidos, pedir a un partido que no está en el tablón', async () => {
    const org = await welcomedPlayer('Tope')
    for (let i = 0; i < 3; i++) await createMatch(org, draft({ hoursAhead: 24 + i }))
    await rejectsWith('rival_limit_active', createMatch(org, draft({ hoursAhead: 30 })))

    const asker = await welcomedPlayer('Pide')
    const closed = await createMatch(await welcomedPlayer('Cerrado'), draft())
    await rejectsWith(
      'rival_not_on_board',
      requestToJoin(asker, { matchId: closed.id, tenantId: tenant.id }),
    )

    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const o = await welcomedPlayer(`Tablon${i}`)
      ids.push((await createMatch(o, draft({ withBoard: 'players' }))).id)
    }
    for (const id of ids.slice(0, 5))
      await requestToJoin(asker, { matchId: id, tenantId: tenant.id })
    await rejectsWith(
      'rival_limit_requests',
      requestToJoin(asker, { matchId: ids[5]!, tenantId: tenant.id }),
    )
  })

  it('2.6 un ban manual del complejo frena; un softban automático no', async () => {
    const su = adminSql()
    const manual = await welcomedPlayer('Baneado')
    await insertBan(su, { tenantId: tenant.id, playerId: manual, bannedBy: staffId })
    await rejectsWith('rival_banned', createMatch(manual, draft()))

    const auto = await welcomedPlayer('Soft')
    await insertBan(su, { tenantId: tenant.id, playerId: auto, bannedBy: null })
    await expect(createMatch(auto, draft())).resolves.toBeDefined()
  })

  it('2.7 publicar, sacar del tablón y cancelar el partido de otro falla como "no encontrado"', async () => {
    const org = await welcomedPlayer('Dueño')
    const intruder = await welcomedPlayer('Intruso')
    const m = await createMatch(org, draft())
    await rejectsWith('rival_not_found', publishToBoard(intruder, m.id, board('players')))
    await rejectsWith('rival_not_found', unpublishFromBoard(intruder, m.id))
    await rejectsWith('rival_not_found', cancelMatch(intruder, m.id))
    // Control: el dueño sí, y puede sacar y volver a poner.
    await publishToBoard(org, m.id, board('players', 'goalkeeper'))
    expect((await getPublicMatch(m.inviteCode))!.seekingPosition).toBe('goalkeeper')
    await unpublishFromBoard(org, m.id)
    expect((await getPublicMatch(m.inviteCode))!.seeking).toBeNull()
  })

  it('2.8 la reserva vinculada: del organizador y a la misma hora da el sello; otra, rival_booking_mismatch', async () => {
    const su = adminSql()
    const org = await welcomedPlayer('Reserva')
    const stranger = await welcomedPlayer('Ajeno')
    const courtId = await insertCourt(su, tenant.id)
    const date = addDays(artTodayStr(), 5)
    const mine = await insertBooking(su, {
      tenantId: tenant.id,
      courtId,
      playerId: org,
      date,
      timeStart: '20:00',
      timeEnd: '21:00',
      status: 'confirmed',
    })
    const theirs = await insertBooking(su, {
      tenantId: tenant.id,
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
    const parsed = (bookingId: string) =>
      createRivalMatchSchema.parse({
        tenantId: tenant.id,
        startsAt: startsAt.toISOString(),
        format: 5,
        level: 'parejo',
        bookingId,
      })

    await rejectsWith('rival_booking_mismatch', createMatch(org, parsed(theirs)))
    const ok = await createMatch(org, parsed(mine))
    expect((await getPublicMatch(ok.inviteCode))!.hasStamp).toBe(true)
    // El sello se deriva: si la reserva se cae, baja solo.
    await su`UPDATE bookings SET status = 'canceled_no_refund' WHERE id = ${mine}`
    expect((await getPublicMatch(ok.inviteCode))!.hasStamp).toBe(false)
  })

  it('2.9 denuncias: una por denunciante, partido y denunciado; solo a alguien que está en el partido', async () => {
    const org = await welcomedPlayer('Denunciado')
    const reporter = await welcomedPlayer('Denuncia')
    const m = await createMatch(org, draft())
    await reportMatch(reporter, m.id, 'spam')
    await rejectsWith('rival_already_reported', reportMatch(reporter, m.id, 'offensive'))
    // Al organizador sí (está en el plantel); a quien no está, no; a uno mismo, no.
    await reportPlayer(reporter, m.id, org, 'offensive')
    const outsider = await welcomedPlayer('Fuera')
    await rejectsWith('rival_invalid_report', reportPlayer(reporter, m.id, outsider, 'minor'))
    await rejectsWith('rival_invalid_report', reportPlayer(reporter, m.id, reporter, 'minor'))
    await rejectsWith(
      'rival_not_found',
      reportMatch(reporter, '99999999-9999-4999-8999-999999999999', 'spam'),
    )
  })

  it('2.10 un código mal formado en el link es "no encontrado", sin pasar por la base', async () => {
    const p = await welcomedPlayer('Link')
    await rejectsWith('rival_not_found', joinByInvite(p, 'abc'))
    await rejectsWith('rival_not_found', joinByInvite(p, 'AAAAAAAAAA'))
  })
})

// ─── 3. Tablón: paginación por cursor ────────────────────────────────────

describe('3. el tablón con cursor', () => {
  it('3.1 pagina por (hora, id) sin repetir ni saltear, solo lo publicado', async () => {
    const su = adminSql()
    const t = await createTestTenant(su)
    const orgs = await Promise.all([
      welcomedPlayer('P1'),
      welcomedPlayer('P2'),
      welcomedPlayer('P3'),
    ])
    const ids: string[] = []
    for (const [i, o] of orgs.entries()) {
      ids.push(
        (await createMatch(o, draft({ tenantId: t.id, hoursAhead: 40 + i, withBoard: 'players' })))
          .id,
      )
    }
    // Uno del grupo (sin publicar) en el mismo complejo: no aparece.
    await createMatch(orgs[0]!, draft({ tenantId: t.id, hoursAhead: 60 }))

    const p1 = await listBoard({ tenantId: t.id, limit: 2 })
    expect(p1.items.map((i) => i.id)).toEqual(ids.slice(0, 2))
    expect(p1.nextCursor).toEqual({ startsAt: p1.items[1]!.startsAt, id: ids[1] })
    const p2 = await listBoard({ tenantId: t.id, limit: 2, after: p1.nextCursor })
    expect(p2.items.map((i) => i.id)).toEqual([ids[2]])
    expect(p2.nextCursor).toBeNull()

    // Sin filtro de complejo también trae estos (el tablón es cross-tenant).
    const all = await listBoard({ limit: 50 })
    expect(all.items.map((i) => i.id)).toEqual(expect.arrayContaining(ids))
  })
})

// ─── 4. Mis partidos ─────────────────────────────────────────────────────

describe('4. listMyMatches', () => {
  it('4.1 trae los que organizo y en los que estoy, en cualquier estado, con los próximos arriba', async () => {
    const su = adminSql()
    const me = await welcomedPlayer('Yo')
    const [o1, o2, o3, o4, o5] = await Promise.all(
      ['O1', 'O2', 'O3', 'O4', 'O5'].map((n) => welcomedPlayer(n)),
    )

    const later = await createMatch(me, draft({ hoursAhead: 72 }))
    const sooner = await createMatch(me, draft({ hoursAhead: 24 }))
    const old = await createMatch(me, draft({ hoursAhead: 30 }))
    await su`UPDATE rival_matches SET starts_at = now() - interval '2 days' WHERE id = ${old.id}`

    // Pedido pendiente en un partido ajeno: la RLS no me deja leer esa fila, igual tiene que aparecer.
    const asked = await createMatch(o1!, draft({ hoursAhead: 48, withBoard: 'players' }))
    await requestToJoin(me, { matchId: asked.id, tenantId: tenant.id })
    // Un partido ajeno por link donde estoy confirmado, y uno donde me bajé.
    const joined = await createMatch(o2!, draft({ hoursAhead: 50 }))
    await joinByInvite(me, joined.inviteCode)
    const left = await createMatch(o3!, draft({ hoursAhead: 51 }))
    await joinByInvite(me, left.inviteCode)
    await leaveMatch(me, left.id)
    // Uno ajeno al que no tengo nada que ver: no aparece. Y uno oculto: tampoco, salvo para su dueño.
    const unrelated = await createMatch(o4!, draft({ hoursAhead: 52 }))
    const hidden = await createMatch(o5!, draft({ hoursAhead: 53 }))
    await joinByInvite(me, hidden.inviteCode)
    await su`UPDATE rival_matches SET hidden_at = now() WHERE id = ${hidden.id}`

    const mine = await listMyMatches(me)
    expect(mine.map((m) => m.id)).toEqual([
      sooner.id,
      asked.id,
      joined.id,
      left.id,
      later.id,
      old.id,
    ])
    expect(mine.map((m) => m.id)).not.toContain(unrelated.id)
    expect(mine.map((m) => m.id)).not.toContain(hidden.id)

    const byId = Object.fromEntries(mine.map((m) => [m.id, m]))
    expect(byId[sooner.id]).toMatchObject({
      isOrganizer: true,
      inviteCode: sooner.inviteCode,
      myStatus: 'confirmed',
      myRole: 'player',
      isHidden: false,
    })
    expect(byId[asked.id]).toMatchObject({
      isOrganizer: false,
      inviteCode: null,
      myStatus: 'requested',
      myOrigin: 'board',
      onBoard: true,
      tenantName: tenant.name,
    })
    expect(byId[joined.id]).toMatchObject({
      myStatus: 'confirmed',
      myOrigin: 'invite',
      inviteCode: null,
    })
    expect(byId[left.id]).toMatchObject({ myStatus: 'left' })
    expect(byId[old.id]!.startsAt.getTime()).toBeLessThan(Date.now())

    // El dueño del oculto lo sigue viendo, marcado.
    const theirs = await listMyMatches(o5!)
    expect(theirs.find((m) => m.id === hidden.id)).toMatchObject({
      isHidden: true,
      isOrganizer: true,
    })
    // Sin partidos, lista vacía.
    expect(await listMyMatches(await welcomedPlayer('Nadie'))).toEqual([])
  })
})

// ─── 5. El flag ──────────────────────────────────────────────────────────

describe('5. isRivalEnabled', () => {
  it('5.1 lee el flag GLOBAL de la base y un override por complejo no lo cambia', async () => {
    const su = adminSql()
    clearFeatureFlagCache()
    const setGlobal = (v: boolean) => su`
      INSERT INTO feature_flags (key, value, tenant_id) VALUES ('rival', ${v}, NULL)
      ON CONFLICT (key) WHERE tenant_id IS NULL DO UPDATE SET value = EXCLUDED.value
    `
    await setGlobal(false)
    expect(await isRivalEnabled()).toBe(false)

    // Un override en true para un complejo NO prende RIVAL (es solo global).
    await su`INSERT INTO feature_flags (key, value, tenant_id) VALUES ('rival', true, ${tenant.id})`
    clearFeatureFlagCache()
    expect(await isRivalEnabled()).toBe(false)

    await setGlobal(true)
    clearFeatureFlagCache()
    expect(await isRivalEnabled()).toBe(true)

    // Y uno en false tampoco lo apaga.
    await su`UPDATE feature_flags SET value = false WHERE key = 'rival' AND tenant_id = ${tenant.id}`
    clearFeatureFlagCache()
    expect(await isRivalEnabled()).toBe(true)

    await su`DELETE FROM feature_flags WHERE key = 'rival' AND tenant_id = ${tenant.id}`
    await setGlobal(false)
    clearFeatureFlagCache()
  })
})

// ─── 6. Orden de locks: el partido SIEMPRE antes que cualquier participante ───

describe('6. orden de locks (deadlock entre la baja del banco y la baja o el saque de un confirmado)', () => {
  /**
   * Por qué este test y no dos bajas a la vez: el cruce depende de que una transacción tenga tomada
   * la fila del participante cuando la otra promueve al banco, una ventana de microsegundos que en
   * CI sería un test flaky. Acá se frena a la operación en el lock del PARTIDO y se mira, desde
   * afuera, que todavía no tocó la fila del participante. Si la tomara antes (el orden viejo:
   * participante y después partido), el `FOR UPDATE NOWAIT` de abajo falla con 55P03; ese es
   * justo el lado del cruce que termina en 40P01.
   */
  async function blockedOnMatchWithoutParticipantLock(
    matchId: string,
    participantRowId: string,
    run: () => Promise<void>,
  ): Promise<void> {
    const su = adminSql()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let held!: () => void
    const heldP = new Promise<void>((r) => (held = r))
    // Quien tiene el partido tomado (p. ej. una promoción en curso de otra transacción).
    const holder = su.begin(async (tx) => {
      await tx`SELECT id FROM rival_matches WHERE id = ${matchId} FOR UPDATE`
      held()
      await gate
    })
    await heldP

    const op = run()
    const settled = op.then(
      () => 'ok' as const,
      (e: unknown) => e,
    )
    try {
      // Esperar a que la operación quede trabada en un lock (el pool de la app es otro rol).
      const deadline = Date.now() + 2_000
      let waiting = false
      while (!waiting && Date.now() < deadline) {
        const rows = await su<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE usename = 'turnogol_app' AND wait_event_type = 'Lock'
        `
        waiting = rows[0]!.n > 0
        if (!waiting) await new Promise((r) => setTimeout(r, 25))
      }
      expect(waiting, 'la operación debía quedar esperando el lock del partido').toBe(true)

      // La fila del participante tiene que estar LIBRE: la operación no la tomó antes que al partido.
      await su.begin(async (tx) => {
        await tx`SELECT id FROM rival_participants WHERE id = ${participantRowId} FOR UPDATE NOWAIT`
      })
    } finally {
      release()
      await holder
    }
    expect(await settled).toBe('ok')
  }

  async function fixture(): Promise<{
    org: string
    confirmed: string
    bench: string
    requester: string
    matchId: string
    rowOf: (p: string) => Promise<string>
  }> {
    const org = await welcomedPlayer('Orga')
    const confirmed = await welcomedPlayer('Confi')
    const bench = await welcomedPlayer('Banco')
    const requester = await welcomedPlayer('Pidio')
    const m = await createMatch(org, draft({ capacity: 2 }))
    await joinByInvite(confirmed, m.inviteCode) // 2/2
    await joinByInvite(bench, m.inviteCode) // banco
    await publishToBoard(org, m.id, board('players', 'any'))
    // El pedido del tablón sobre un partido ya lleno lo rechaza el trigger: se siembra por el pool
    // admin (lo que se mide es el orden de locks al decidirlo, no cómo llegó).
    await adminSql()`
      INSERT INTO rival_participants (tenant_id, match_id, player_id, role, status, origin)
      VALUES (${tenant.id}, ${m.id}, ${requester}, 'player', 'requested', 'board')
    `
    const rowOf = async (p: string): Promise<string> =>
      (
        await adminSql()<{ id: string }[]>`
          SELECT id FROM rival_participants WHERE match_id = ${m.id} AND player_id = ${p}
        `
      )[0]!.id
    return { org, confirmed, bench, requester, matchId: m.id, rowOf }
  }

  it('6.1 "me bajo" del banco toma el partido antes que su propia fila', async () => {
    const f = await fixture()
    await blockedOnMatchWithoutParticipantLock(f.matchId, await f.rowOf(f.bench), () =>
      leaveMatch(f.bench, f.matchId),
    )
    expect((await statusesOf(f.matchId))[f.bench]).toBe('left')
  })

  it('6.2 el organizador saca a un confirmado: toma el partido antes que la fila del confirmado', async () => {
    const f = await fixture()
    const row = await f.rowOf(f.confirmed)
    await blockedOnMatchWithoutParticipantLock(f.matchId, row, () => removeParticipant(f.org, row))
    const st = await statusesOf(f.matchId)
    expect(st[f.confirmed]).toBe('removed')
    expect(st[f.bench]).toBe('confirmed') // y entró el del banco
  })

  it('6.3 el organizador decide un pedido: toma el partido antes que la fila del pedido', async () => {
    const f = await fixture()
    const row = await f.rowOf(f.requester)
    await blockedOnMatchWithoutParticipantLock(f.matchId, row, () =>
      decideRequest(f.org, row, 'decline'),
    )
    expect((await statusesOf(f.matchId))[f.requester]).toBe('declined')
  })

  it('6.4 una baja que muere en un deadlock sale como "probá de nuevo", no como 500', async () => {
    // Un deadlock real entre dos transacciones del pool admin; el mapeo es el mismo que ve el service.
    const su = adminSql()
    const org = await welcomedPlayer('Orga')
    const m = await createMatch(org, draft({ capacity: 2 }))
    const a = await welcomedPlayer('Ana')
    await joinByInvite(a, m.inviteCode)
    const rowA = (
      await su<
        { id: string }[]
      >`SELECT id FROM rival_participants WHERE match_id = ${m.id} AND player_id = ${a}`
    )[0]!.id
    let gate1!: () => void
    const p1 = new Promise<void>((r) => (gate1 = r))
    let gate2!: () => void
    const p2 = new Promise<void>((r) => (gate2 = r))
    const t1 = su.begin(async (tx) => {
      await tx`SELECT id FROM rival_matches WHERE id = ${m.id} FOR UPDATE`
      gate1()
      await p2
      await tx`SELECT id FROM rival_participants WHERE id = ${rowA} FOR UPDATE`
    })
    const t2 = su.begin(async (tx) => {
      await p1
      await tx`SELECT id FROM rival_participants WHERE id = ${rowA} FOR UPDATE`
      gate2()
      await tx`SELECT id FROM rival_matches WHERE id = ${m.id} FOR UPDATE`
    })
    const results = await Promise.allSettled([t1, t2])
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    const mapped = mapRivalDbError(rejected[0]!.reason)
    expect(mapped).toBeInstanceOf(RivalError)
    expect(mapped?.code).toBe('rival_try_again')
  })
})

// ─── 7. Quien se bajó vuelve por el link (decisión 10) ───────────────────

describe('7. joinByInvite desde `left`', () => {
  it('7.1 vuelve como alta (joined = true); removed no vuelve y el error de un baneado es el de siempre', async () => {
    const [org, b, r, banned] = await Promise.all([
      welcomedPlayer('Org'),
      welcomedPlayer('Beto'),
      welcomedPlayer('Rudo'),
      welcomedPlayer('Bano'),
    ])
    const m = await createMatch(org, draft({ capacity: 5 }))
    await joinByInvite(b, m.inviteCode)
    const rJoin = await joinByInvite(r, m.inviteCode)
    await joinByInvite(banned, m.inviteCode)
    await leaveMatch(b, m.id)
    await leaveMatch(banned, m.id)
    await removeParticipant(org, rJoin.participantId)

    expect(await joinByInvite(b, m.inviteCode)).toMatchObject({ status: 'confirmed', joined: true })
    expect(await joinByInvite(r, m.inviteCode)).toMatchObject({ status: 'removed', joined: false })

    await insertBan(adminSql(), { tenantId: tenant.id, playerId: banned, bannedBy: staffId })
    await rejectsWith('rival_banned', joinByInvite(banned, m.inviteCode))
    expect((await statusesOf(m.id))[banned]).toBe('left')
  })
})

// ─── 8. Lecturas del formulario de "Armar un partido" ────────────────────

describe('8. listEligibleTenants, listUpcomingConfirmedBookings y getRivalWelcomeState', () => {
  it('8.1 listEligibleTenants usa el mismo filtro que createMatch: oculto, bloqueado o sin onboarding no salen', async () => {
    const su = adminSql()
    const hidden = await createTestTenant(su)
    await su`UPDATE tenants SET marketplace_visible = false WHERE id = ${hidden.id}`
    const blocked = await createTestTenant(su)
    await su`UPDATE tenants SET status = 'blocked' WHERE id = ${blocked.id}`
    const noOnboarding = await createTestTenant(su, { onboardingCompleted: false })

    const ids = (await listEligibleTenants()).map((t) => t.id)
    expect(ids).toContain(tenant.id)
    for (const t of [hidden, blocked, noOnboarding]) expect(ids).not.toContain(t.id)
  })

  it('8.2 listUpcomingConfirmedBookings trae solo MIS reservas confirmadas y futuras, con el formato de la cancha', async () => {
    const su = adminSql()
    const me = await welcomedPlayer('Mia')
    const other = await welcomedPlayer('Otra')
    const courtId = await insertCourt(su, tenant.id)
    await su`UPDATE courts SET format = 7 WHERE id = ${courtId}`
    const date = addDays(artTodayStr(), 3)
    const book = (
      playerId: string,
      o: { timeStart: string; timeEnd: string; status?: string; date?: string },
    ) =>
      insertBooking(su, {
        tenantId: tenant.id,
        courtId,
        playerId,
        date: o.date ?? date,
        timeStart: o.timeStart,
        timeEnd: o.timeEnd,
        status: o.status ?? 'confirmed',
      })
    const mine = await book(me, { timeStart: '20:00', timeEnd: '21:00' })
    await book(me, { timeStart: '21:00', timeEnd: '22:00', status: 'canceled_no_refund' })
    await book(me, { timeStart: '22:00', timeEnd: '23:00', date: addDays(artTodayStr(), 20) })
    // El schema admite hasta hoy+7 ART: una reserva a +8 no se puede vincular, ni siquiera listar.
    await book(me, { timeStart: '18:00', timeEnd: '19:00', date: addDays(artTodayStr(), 8) })
    const edge = await book(me, {
      timeStart: '18:00',
      timeEnd: '19:00',
      date: addDays(artTodayStr(), 7),
    })
    await book(other, { timeStart: '19:00', timeEnd: '20:00' })

    const list = await listUpcomingConfirmedBookings(me)
    expect(list.map((b) => b.id)).toEqual([mine, edge])
    expect(list[0]).toMatchObject({ tenantId: tenant.id, format: 7 })
    expect(list[0]!.startsAt).toBeInstanceOf(Date)
  })

  it('8.3 getRivalWelcomeState: sin aceptar es false; aceptada la versión vigente, true; una vieja vuelve a false', async () => {
    const su = adminSql()
    const fresh = (await createTestPlayer(su)).id
    expect(await getRivalWelcomeState(fresh)).toMatchObject({
      welcomed: false,
      position: null,
      zone: null,
    })
    await acceptRivalWelcome(fresh, { firstName: 'Nuevo', position: 'any', zone: 'Luján' })
    expect(await getRivalWelcomeState(fresh)).toEqual({
      firstName: 'Nuevo',
      welcomed: true,
      position: 'any',
      zone: 'Luján',
    })
    await su`UPDATE players SET rival_terms_version = 'rival-vieja' WHERE id = ${fresh}`
    // Re-aceptación: sigue devolviendo lo que ya había cargado, para precargar la tarjeta.
    expect(await getRivalWelcomeState(fresh)).toMatchObject({
      welcomed: false,
      position: 'any',
      zone: 'Luján',
    })
  })
})

// ─── 9. Repetir ──────────────────────────────────────────────────────────

describe('9. getRepeatPrefill', () => {
  it('9.1 el organizador recibe los datos del partido con el día +7 en ART; otro jugador, null', async () => {
    const org = await welcomedPlayer('Repe')
    const other = await welcomedPlayer('Ajeno')
    const created = await createMatch(org, draft({ capacity: 8, format: 7 }))
    const [row] = await adminSql()<{ starts_at: Date }[]>`
      SELECT starts_at FROM rival_matches WHERE id = ${created.id}
    `
    const startsAt = row!.starts_at

    expect(await getRepeatPrefill(org, created.id)).toEqual({
      tenantId: tenant.id,
      date: addDays(artDateOf(startsAt), 7),
      time: artTimeOf(startsAt),
      format: 7,
      capacity: 8,
      level: 'parejo',
    })

    // Ni siquiera quien está adentro puede repetir un partido que no armó.
    await joinByInvite(other, created.inviteCode)
    expect(await getRepeatPrefill(other, created.id)).toBeNull()
    expect(await getRepeatPrefill(org, '33333333-3333-4333-8333-333333333333')).toBeNull()
    expect(await getRepeatPrefill(org, 'no-es-uuid')).toBeNull()
  })

  it('9.2 un partido ya vencido también se puede repetir', async () => {
    const org = await welcomedPlayer('Vieja')
    const created = await createMatch(org, draft())
    await adminSql()`UPDATE rival_matches SET starts_at = now() - interval '2 days' WHERE id = ${created.id}`
    expect(await getRepeatPrefill(org, created.id)).toMatchObject({ tenantId: tenant.id })
  })
})

// ─── 10. Lecturas del tablón (PR4) ───────────────────────────────────────

describe('10. getBoardMatch, listBoardTenants, getMyMatch y getBoardPublishPrefill', () => {
  /** Partido con su propio organizador (tope de 3 activos por persona) en el complejo dado. */
  async function boardMatch(
    t: { id: string },
    o: { capacity?: number; withBoard?: 'players' | 'rival' | null } = {},
  ): Promise<{ org: string; id: string; code: string }> {
    const org = await welcomedPlayer('Org')
    const withBoard = o.withBoard === undefined ? 'players' : o.withBoard
    const created = await createMatch(
      org,
      draft({
        tenantId: t.id,
        capacity: o.capacity ?? 4,
        ...(withBoard ? { withBoard } : {}),
      }),
    )
    return { org, id: created.id, code: created.inviteCode }
  }

  it('10.1 getBoardMatch: devuelve la tarjeta de lo visible y null para todo lo demás', async () => {
    const su = adminSql()
    const visible = await boardMatch(tenant)
    const card = await getBoardMatch(visible.id)
    expect(card).toMatchObject({
      id: visible.id,
      tenantId: tenant.id,
      tenantName: tenant.name,
      seeking: 'players',
      seekingPosition: 'any',
      capacity: 4,
      confirmedCount: 1,
    })
    expect(JSON.stringify(card)).not.toContain(visible.code)
    expect(Object.keys(card!)).not.toContain('inviteCode')
    expect(Object.keys(card!)).not.toContain('organizerPlayerId')

    const unpublished = await boardMatch(tenant, { withBoard: null })
    expect(await getBoardMatch(unpublished.id)).toBeNull()

    const hidden = await boardMatch(tenant)
    await su`UPDATE rival_matches SET hidden_at = now() WHERE id = ${hidden.id}`
    expect(await getBoardMatch(hidden.id)).toBeNull()

    const canceled = await boardMatch(tenant)
    await cancelMatch(canceled.org, canceled.id)
    expect(await getBoardMatch(canceled.id)).toBeNull()

    const expired = await boardMatch(tenant)
    await su`UPDATE rival_matches SET starts_at = now() - interval '1 hour' WHERE id = ${expired.id}`
    expect(await getBoardMatch(expired.id)).toBeNull()

    // Lleno buscando jugadores: sale. Buscando rival: sigue, aunque esté lleno.
    const fullPlayers = await boardMatch(tenant, { capacity: 2 })
    await joinByInvite(await welcomedPlayer('Lleno'), fullPlayers.code)
    expect(await getBoardMatch(fullPlayers.id)).toBeNull()
    const fullRival = await boardMatch(tenant, { capacity: 5, withBoard: 'rival' })
    await su`UPDATE rival_matches SET confirmed_count = capacity WHERE id = ${fullRival.id}`
    expect(await getBoardMatch(fullRival.id)).toMatchObject({ id: fullRival.id, seeking: 'rival' })

    // Complejo que dejó de ser público: tampoco sale por id.
    const t2 = await createTestTenant(su)
    const other = await boardMatch(t2)
    expect(await getBoardMatch(other.id)).not.toBeNull()
    await su`UPDATE tenants SET marketplace_visible = false WHERE id = ${t2.id}`
    expect(await getBoardMatch(other.id)).toBeNull()

    expect(await getBoardMatch('no-es-uuid')).toBeNull()
    expect(await getBoardMatch('44444444-4444-4444-8444-444444444444')).toBeNull()
  })

  it('10.2 listBoardTenants: solo complejos con publicaciones visibles, sin repetir y con id y nombre', async () => {
    const su = adminSql()
    const withPost = await createTestTenant(su)
    const onlyHidden = await createTestTenant(su)
    const onlyUnpublished = await createTestTenant(su)
    const empty = await createTestTenant(su)
    await boardMatch(withPost)
    await boardMatch(withPost)
    const h = await boardMatch(onlyHidden)
    await su`UPDATE rival_matches SET hidden_at = now() WHERE id = ${h.id}`
    await boardMatch(onlyUnpublished, { withBoard: null })

    const list = await listBoardTenants()
    const ids = list.map((t) => t.id)
    expect(ids).toContain(withPost.id)
    for (const t of [onlyHidden, onlyUnpublished, empty]) expect(ids).not.toContain(t.id)
    expect(list.find((t) => t.id === withPost.id)).toEqual({ id: withPost.id, name: withPost.name })
    expect(ids.length).toBe(new Set(ids).size)
  })

  it('10.2b un complejo suspendido, bloqueado o sin onboarding no sale por getBoardMatch ni por listBoardTenants', async () => {
    const su = adminSql()
    const t = await createTestTenant(su)
    const m = await boardMatch(t)
    expect(await getBoardMatch(m.id)).not.toBeNull() // control
    expect((await listBoardTenants()).map((x) => x.id)).toContain(t.id)
    for (const status of ['suspended', 'blocked']) {
      await su.unsafe(`UPDATE tenants SET status = '${status}' WHERE id = '${t.id}'`)
      expect(await getBoardMatch(m.id), status).toBeNull()
      expect(
        (await listBoardTenants()).map((x) => x.id),
        status,
      ).not.toContain(t.id)
    }
    await su`UPDATE tenants SET status = 'active' WHERE id = ${t.id}`
    expect(await getBoardMatch(m.id)).not.toBeNull()
    await su`UPDATE tenants SET settings = settings || '{"onboarding_completed": false}'::jsonb WHERE id = ${t.id}`
    expect(await getBoardMatch(m.id)).toBeNull()
    expect((await listBoardTenants()).map((x) => x.id)).not.toContain(t.id)
  })

  it('10.2c publicar "Busca rival" después exige cupo = formato; "Busca jugadores" siempre se puede', async () => {
    const wide = await boardMatch(tenant, { capacity: 10, withBoard: null }) // F5, cupo 10
    await rejectsWith('rival_capacity_mismatch', publishToBoard(wide.org, wide.id, board('rival')))
    const [row] = await adminSql()<{ on_board: boolean }[]>`
      SELECT on_board FROM rival_matches WHERE id = ${wide.id}
    `
    expect(row?.on_board).toBe(false)
    await expect(publishToBoard(wide.org, wide.id, board('players'))).resolves.toBeUndefined()

    const exact = await boardMatch(tenant, { capacity: 5, withBoard: null }) // F5, cupo 5
    await expect(publishToBoard(exact.org, exact.id, board('rival'))).resolves.toBeUndefined()
  })

  it('10.3 getMyMatch: organizador, aceptado, pedido y rechazado ven el suyo; un tercero, null', async () => {
    const m = await boardMatch(tenant, { capacity: 4 })
    const accepted = await welcomedPlayer('Aceptado')
    const pending = await welcomedPlayer('Pendiente')
    const declined = await welcomedPlayer('Rechazado')
    const stranger = await welcomedPlayer('Tercero')
    const reqA = await requestToJoin(accepted, { matchId: m.id, tenantId: tenant.id })
    await requestToJoin(pending, { matchId: m.id, tenantId: tenant.id })
    const reqD = await requestToJoin(declined, { matchId: m.id, tenantId: tenant.id })
    await decideRequest(m.org, reqA.participantId, 'accept')
    await decideRequest(m.org, reqD.participantId, 'decline')

    expect(await getMyMatch(m.org, m.id)).toMatchObject({
      id: m.id,
      isOrganizer: true,
      inviteCode: m.code,
    })
    expect(await getMyMatch(accepted, m.id)).toMatchObject({
      id: m.id,
      isOrganizer: false,
      myStatus: 'confirmed',
      myOrigin: 'board',
      participantId: reqA.participantId,
      inviteCode: null,
    })
    expect(await getMyMatch(pending, m.id)).toMatchObject({
      myStatus: 'requested',
      inviteCode: null,
    })
    expect(await getMyMatch(declined, m.id)).toMatchObject({ myStatus: 'declined' })

    expect(await getMyMatch(stranger, m.id)).toBeNull()
    expect(await getMyMatch(accepted, 'no-es-uuid')).toBeNull()
  })

  it('10.4 getContactLink: link solo para el aceptado; null para pedido, rechazado, tercero, organizador y tras cancelar', async () => {
    const m = await boardMatch(tenant)
    const [acc, pend, dec, stranger] = await Promise.all([
      welcomedPlayer('Acc'),
      welcomedPlayer('Pend'),
      welcomedPlayer('Dec'),
      welcomedPlayer('Ter'),
    ])
    const rA = await requestToJoin(acc, { matchId: m.id, tenantId: tenant.id })
    await requestToJoin(pend, { matchId: m.id, tenantId: tenant.id })
    const rD = await requestToJoin(dec, { matchId: m.id, tenantId: tenant.id })
    await decideRequest(m.org, rA.participantId, 'accept')
    await decideRequest(m.org, rD.participantId, 'decline')

    expect(await getContactLink(acc, m.id)).toContain('https://wa.me/5491155551234')
    for (const who of [pend, dec, stranger, m.org]) {
      expect(await getContactLink(who, m.id)).toBeNull()
    }
    await cancelMatch(m.org, m.id)
    expect(await getContactLink(acc, m.id)).toBeNull()
  })

  it('10.5 requestToJoin: el ban manual tira rival_banned; el softban automático pasa', async () => {
    const su = adminSql()
    const m = await boardMatch(tenant)
    const manual = await welcomedPlayer('BanManual')
    await insertBan(su, { tenantId: tenant.id, playerId: manual, bannedBy: staffId })
    await rejectsWith('rival_banned', requestToJoin(manual, { matchId: m.id, tenantId: tenant.id }))

    const auto = await welcomedPlayer('BanAuto')
    await insertBan(su, { tenantId: tenant.id, playerId: auto, bannedBy: null })
    await expect(requestToJoin(auto, { matchId: m.id, tenantId: tenant.id })).resolves.toBeDefined()
  })

  it('10.6 getBoardPublishPrefill: el teléfono tal cual, o null', async () => {
    const su = adminSql()
    const withPhone = await welcomedPlayer('ConTel')
    await su`UPDATE players SET phone = '+54 9 11 5555-1234' WHERE id = ${withPhone}`
    expect(await getBoardPublishPrefill(withPhone)).toEqual({ whatsapp: '+54 9 11 5555-1234' })
    const without = await welcomedPlayer('SinTel')
    expect(await getBoardPublishPrefill(without)).toEqual({ whatsapp: null })
  })
})
