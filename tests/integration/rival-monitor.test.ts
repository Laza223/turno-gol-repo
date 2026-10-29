import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  hideMatch,
  removePlayerAvatar,
  restoreMatch,
  RivalMatchNotFoundError,
} from '@/modules/super-admin/rival-moderation.service'
import { getRivalMonitor, listRivalReports } from '@/modules/super-admin/rival-monitor.service'
import { adminSql } from '../helpers/admin-db'
import { cleanupAll, createTestPlayer, createTestTenant, ensureRoles } from '../helpers/tenant'
import { insertBooking, insertCourt } from '../helpers/factories'

// R2 mockeado: solo importa qué clave se borra y qué ve la base en ese momento.
const R2_BASE = 'https://media.turnogol.test'
const r2 = vi.hoisted(() => ({ deleteImage: vi.fn() }))
vi.mock('@/shared/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/storage/r2')>()),
  deleteImage: r2.deleteImage,
}))

/**
 * Panel /super-admin/rival (fase 7), contra la base real con el pool worker del servicio.
 * El umbral y el filtro anti-griefing los calcula la DB (migr. 099): acá se prueba que el
 * panel los respeta y los muestra, no que se reimplementan. Las denuncias se siembran como
 * el jugador (`app.current_player_id` en la transacción) para que corran los triggers.
 */

const NOW = new Date()
const ADMIN_ID = randomUUID()

let su: ReturnType<typeof adminSql>
let tenantId: string
let courtId: string

beforeAll(async () => {
  su = adminSql()
  getSql()
  await ensureRoles(su)
}, 60_000)

afterAll(async () => {
  await cleanupAll(su)
  await closeSql()
})

beforeEach(async () => {
  await cleanupAll(su)
  tenantId = (await createTestTenant(su, { name: 'Complejo Rival' })).id
  courtId = await insertCourt(su, tenantId)
})

async function player(opts: { ageDays?: number; played?: 'booking' | 'rival' | null } = {}) {
  const p = await createTestPlayer(su)
  const ageDays = opts.ageDays ?? 30
  await su`UPDATE players SET created_at = now() - ${ageDays + ' days'}::interval WHERE id = ${p.id}`
  if (opts.played === 'booking') {
    await insertBooking(su, {
      tenantId,
      courtId,
      playerId: p.id,
      date: '2026-01-10',
      status: 'completed',
    })
  }
  if (opts.played === 'rival') {
    const org = await createTestPlayer(su)
    const past = await match(org.id, { startsInHours: -48 })
    await su`
      INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
      VALUES (${tenantId}, ${past}, ${p.id}, 'confirmed', 'invite')`
  }
  return p.id
}

/** Un jugador que sí cuenta para ocultar (30 días y una reserva completada). */
const qualified = () => player({ played: 'booking' })

async function match(
  organizerId: string,
  o: { startsInHours?: number; onBoard?: boolean } = {},
): Promise<string> {
  const rows = await su<{ id: string }[]>`
    INSERT INTO rival_matches (tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared)
    VALUES (${tenantId}, ${organizerId}, now() + ${(o.startsInHours ?? 48) + ' hours'}::interval, 5, 10, 'parejo', true)
    RETURNING id`
  const id = rows[0]!.id
  if (o.onBoard === true) {
    // Publicar exige el WhatsApp guardado (trigger de 099).
    await su`INSERT INTO rival_match_contacts (match_id, whatsapp_digits) VALUES (${id}, '5491100000000')`
    await su`UPDATE rival_matches SET on_board = true, seeking = 'players', seeking_position = 'any' WHERE id = ${id}`
  }
  return id
}

async function report(
  reporterId: string,
  matchId: string,
  reportedId: string | null = null,
): Promise<boolean> {
  return su.begin(async (tx) => {
    await tx`SELECT set_config('app.current_player_id', ${reporterId}, true)`
    const rows = await tx<{ counts: boolean }[]>`
      INSERT INTO rival_reports (match_id, reporter_player_id, reported_player_id, reason)
      VALUES (${matchId}, ${reporterId}, ${reportedId}, 'spam')
      RETURNING counts_for_autohide AS counts`
    return rows[0]!.counts
  })
}

const hiddenAt = async (id: string) =>
  (await su<{ hidden_at: Date | null }[]>`SELECT hidden_at FROM rival_matches WHERE id = ${id}`)[0]!
    .hidden_at

const audits = (resourceId: string) =>
  su<{ action: string; actor_id: string; actor_type: string; tenant_id: string }[]>`
    SELECT action, actor_id, actor_type, tenant_id FROM audit_logs
    WHERE resource_id = ${resourceId} ORDER BY created_at`

describe('umbral de 3 denuncias', () => {
  it('2 denuncias que cuentan no ocultan; la 3.ª sí', async () => {
    const org = await player()
    const m = await match(org, { onBoard: true })
    expect(await report(await qualified(), m)).toBe(true)
    expect(await report(await qualified(), m)).toBe(true)
    expect(await hiddenAt(m)).toBeNull()
    await report(await qualified(), m)
    expect(await hiddenAt(m)).not.toBeNull()

    const [listed] = await listRivalReports()
    expect(listed).toMatchObject({ matchId: m, countingReporters: 3, openReports: 3 })
    expect(listed!.hiddenAt).not.toBeNull()
  })

  it('3 denuncias de la misma persona no ocultan (UNIQUE) ni se pueden repetir', async () => {
    const m = await match(await player())
    const rep = await qualified()
    await report(rep, m)
    await expect(report(rep, m)).rejects.toThrow()
    expect(await hiddenAt(m)).toBeNull()
  })

  it('las denuncias a personas no cuentan para el umbral', async () => {
    const org = await player()
    const m = await match(org)
    const target = await player()
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${m}, ${target}, 'confirmed', 'invite')`
    for (let i = 0; i < 3; i++) await report(await qualified(), m, target)
    expect(await hiddenAt(m)).toBeNull()
    const [listed] = await listRivalReports()
    expect(listed!.reports).toHaveLength(3)
    expect(listed!.countingReporters).toBe(0)
  })
})

describe('filtro anti-griefing', () => {
  it('cuenta de menos de 7 días no cuenta, pero aparece en la lista', async () => {
    const m = await match(await player())
    const young = await player({ ageDays: 3, played: 'booking' })
    expect(await report(young, m)).toBe(false)
    const [listed] = await listRivalReports()
    expect(listed!.reports[0]).toMatchObject({ countsForAutohide: false })
    expect(listed!.countingReporters).toBe(0)
  })

  it('sin reserva completada ni partido jugado no cuenta', async () => {
    const m = await match(await player())
    expect(await report(await player({ played: null }), m)).toBe(false)
    expect(await listRivalReports()).toHaveLength(1)
  })

  it('7 días o más y una reserva completada: cuenta', async () => {
    const m = await match(await player())
    expect(await report(await player({ ageDays: 8, played: 'booking' }), m)).toBe(true)
  })

  it('7 días o más y un partido RIVAL jugado: cuenta', async () => {
    const m = await match(await player())
    expect(await report(await player({ played: 'rival' }), m)).toBe(true)
  })

  it('el organizador no cuenta contra su propio partido', async () => {
    const org = await player({ played: 'booking' })
    const m = await match(org)
    expect(await report(org, m)).toBe(false)
    expect(await listRivalReports()).toHaveLength(1)
  })
})

describe('ocultar y restaurar', () => {
  it('cambia hidden_at y audita con el system admin y el complejo del partido', async () => {
    const m = await match(await player())
    await hideMatch(m, ADMIN_ID)
    expect(await hiddenAt(m)).not.toBeNull()
    await restoreMatch(m, ADMIN_ID)
    expect(await hiddenAt(m)).toBeNull()
    expect(await audits(m)).toEqual([
      {
        action: 'rival.match_hidden',
        actor_id: ADMIN_ID,
        actor_type: 'system',
        tenant_id: tenantId,
      },
      {
        action: 'rival.match_restored',
        actor_id: ADMIN_ID,
        actor_type: 'system',
        tenant_id: tenantId,
      },
    ])
  })

  it('es idempotente: repetir no duplica la auditoría', async () => {
    const m = await match(await player())
    await restoreMatch(m, ADMIN_ID)
    expect(await audits(m)).toHaveLength(0)
    await hideMatch(m, ADMIN_ID)
    await hideMatch(m, ADMIN_ID)
    expect(await audits(m)).toHaveLength(1)
  })

  it('un partido que no existe da error de dominio', async () => {
    await expect(hideMatch(randomUUID(), ADMIN_ID)).rejects.toBeInstanceOf(RivalMatchNotFoundError)
  })

  it('la denuncia es "abierta" solo si es posterior a la última restauración', async () => {
    const org = await player()
    const m = await match(org)
    await report(await qualified(), m)
    await hideMatch(m, ADMIN_ID)
    await restoreMatch(m, ADMIN_ID)
    let [listed] = await listRivalReports()
    expect(listed).toMatchObject({ openReports: 0, hiddenAt: null })
    expect(listed!.reports[0]!.open).toBe(false)
    await report(await qualified(), m)
    ;[listed] = await listRivalReports()
    expect(listed!.openReports).toBe(1)
  })

  it('lista los ocultos primero', async () => {
    const org = await player()
    const a = await match(org)
    const b = await match(org)
    await report(await qualified(), a)
    await report(await qualified(), b)
    await report(await qualified(), b)
    await hideMatch(a, ADMIN_ID)
    expect((await listRivalReports()).map((x) => x.matchId)).toEqual([a, b])
  })
})

describe('lo que expone la lista', () => {
  it('no trae teléfono, email ni invite_code; solo nombre corto y motivo', async () => {
    const org = await player()
    const m = await match(org)
    const target = await player()
    await su`UPDATE players SET phone = '+5491155550000', first_name = 'Juan', last_name = 'Pérez' WHERE id = ${target}`
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${m}, ${target}, 'confirmed', 'invite')`
    await su`INSERT INTO rival_match_contacts (match_id, whatsapp_digits) VALUES (${m}, '5491155551111')`
    const rep = await qualified()
    await report(rep, m, target)

    const list = await listRivalReports()
    const json = JSON.stringify(list)
    const [{ invite_code }] = await su<{ invite_code: string }[]>`
      SELECT invite_code FROM rival_matches WHERE id = ${m}`
    expect(json).not.toContain(invite_code)
    expect(json).not.toContain('5491155550000')
    expect(json).not.toContain('5491155551111')
    expect(json).not.toContain('@')
    expect(json).not.toMatch(/phone|email|invite/i)
    expect(list[0]!.reports[0]).toMatchObject({ reportedName: 'Juan P.', reason: 'spam' })
  })
})

describe('quitar la foto', () => {
  const withAvatar = async () => {
    const target = await player()
    await su`UPDATE players SET avatar_url = 'https://cdn.test/a.jpg' WHERE id = ${target}`
    return target
  }
  const avatarOf = async (id: string) =>
    (await su<{ avatar_url: string | null }[]>`SELECT avatar_url FROM players WHERE id = ${id}`)[0]!
      .avatar_url

  it('deja avatar_url en NULL y audita', async () => {
    const m = await match(await player())
    const target = await withAvatar()
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${m}, ${target}, 'confirmed', 'invite')`
    await removePlayerAvatar(target, m, ADMIN_ID)
    expect(await avatarOf(target)).toBeNull()
    expect(await audits(target)).toEqual([
      {
        action: 'rival.avatar_removed',
        actor_id: ADMIN_ID,
        actor_type: 'system',
        tenant_id: tenantId,
      },
    ])
    // Sin foto no hay nada que quitar: no se audita otra vez.
    await removePlayerAvatar(target, m, ADMIN_ID)
    expect(await audits(target)).toHaveLength(1)
  })

  it('también vale para quien fue denunciado en ese partido', async () => {
    const m = await match(await player())
    const target = await withAvatar()
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${m}, ${target}, 'confirmed', 'invite')`
    await report(await qualified(), m, target)
    await su`DELETE FROM rival_participants WHERE match_id = ${m} AND player_id = ${target}`
    await removePlayerAvatar(target, m, ADMIN_ID)
    expect(await avatarOf(target)).toBeNull()
  })

  it('una persona sin vínculo con el partido: error y sin auditoría', async () => {
    const m = await match(await player())
    const stranger = await withAvatar()
    await expect(removePlayerAvatar(stranger, m, ADMIN_ID)).rejects.toThrow()
    expect(await avatarOf(stranger)).not.toBeNull()
    expect(await audits(stranger)).toHaveLength(0)
  })

  it('dos clics a la vez dejan una sola auditoría', async () => {
    const m = await match(await player())
    const target = await withAvatar()
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${m}, ${target}, 'confirmed', 'invite')`
    await Promise.all([
      removePlayerAvatar(target, m, ADMIN_ID),
      removePlayerAvatar(target, m, ADMIN_ID),
    ])
    expect(await audits(target)).toHaveLength(1)
  })

  it('borra el objeto en R2 después del commit, una sola vez', async () => {
    // `unstubEnvs` (vitest.config) lo deshace antes de cada test.
    vi.stubEnv('R2_PUBLIC_BASE_URL', R2_BASE)
    const m = await match(await player())
    const target = await player()
    await su`UPDATE players SET avatar_url = ${`${R2_BASE}/rival/avatars/x.jpg`} WHERE id = ${target}`
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${m}, ${target}, 'confirmed', 'invite')`
    // Otra conexión: ve solo lo ya commiteado.
    const seen: Array<string | null> = []
    r2.deleteImage.mockReset().mockImplementation(async () => {
      seen.push(await avatarOf(target))
    })

    await removePlayerAvatar(target, m, ADMIN_ID)
    expect(r2.deleteImage).toHaveBeenCalledExactlyOnceWith('rival/avatars/x.jpg')
    expect(seen).toEqual([null])

    // Sin foto no hay objeto que borrar.
    await removePlayerAvatar(target, m, ADMIN_ID)
    expect(r2.deleteImage).toHaveBeenCalledTimes(1)
  })
})

describe('métricas', () => {
  it('cuenta lo sembrado en la semana actual y por complejo', async () => {
    const org = await player()
    const m = await match(org, { onBoard: true })
    const joiner = await player({ ageDays: 0 })
    // Sin actor los triggers no sellan las fechas: se ponen a mano.
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin, confirmed_at, decided_at)
             VALUES (${tenantId}, ${m}, ${joiner}, 'confirmed', 'board', now(), now())`
    const declined = await player()
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${m}, ${declined}, 'requested', 'board')`
    await su`UPDATE rival_participants SET status = 'declined' WHERE match_id = ${m} AND player_id = ${declined}`
    await su`UPDATE players SET signup_source = 'rival' WHERE id = ${joiner}`
    await su`INSERT INTO rival_alert_subscriptions (player_id, tenant_id) VALUES (${joiner}, ${tenantId})`
    await report(await qualified(), m)

    const mon = await getRivalMonitor(NOW)
    expect(mon.weeks).toHaveLength(8)
    const cur = mon.weeks[0]!
    expect(cur).toMatchObject({
      matchesCreated: 1,
      matchesOnBoard: 1,
      peopleJoined: 1,
      requestsAccepted: 1,
      requestsDeclined: 1,
      newAccounts: 1,
      reports: 1,
      matchesHidden: 0,
    })
    // Bajas y entradas del banco no se miden (falta guardar cuándo pasan): no hay un 0 falso.
    expect(cur).not.toHaveProperty('left')
    expect(cur).not.toHaveProperty('fromBench')
    expect(mon.weeks.slice(1).every((w) => w.matchesCreated === 0)).toBe(true)
    expect(mon.activeAlertSubscriptions).toBe(1)
    expect(mon.tenants).toEqual([
      expect.objectContaining({
        name: 'Complejo Rival',
        matchesCreated: 1,
        matchesOnBoard: 1,
        peopleJoined: 1,
        reports: 1,
      }),
    ])
  })

  it('una persona que se suma a 2 partidos cuenta una sola vez, por semana y por complejo', async () => {
    const org = await player()
    const m1 = await match(org)
    const m2 = await match(org)
    const joiner = await player()
    for (const m of [m1, m2]) {
      await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin, confirmed_at)
               VALUES (${tenantId}, ${m}, ${joiner}, 'confirmed', 'invite', now())`
    }
    const mon = await getRivalMonitor(NOW)
    expect(mon.weeks[0]!.peopleJoined).toBe(1)
    expect(mon.tenants[0]!.peopleJoined).toBe(1)
  })

  it('alertas enviadas y pedidos sin respuesta (partido ya empezado)', async () => {
    const org = await player()
    const past = await match(org, { startsInHours: -48 })
    const asker = await player()
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${past}, ${asker}, 'requested', 'board')`
    // Un pedido de un partido futuro todavía no es "sin respuesta".
    const future = await match(org)
    const asker2 = await player()
    await su`INSERT INTO rival_participants (tenant_id, match_id, player_id, status, origin)
             VALUES (${tenantId}, ${future}, ${asker2}, 'requested', 'board')`
    await su`INSERT INTO rival_alert_sends (match_id, player_id, sent_on) VALUES (${future}, ${asker2}, current_date)`
    const cur = (await getRivalMonitor(NOW)).weeks[0]!
    expect(cur.requestsUnanswered).toBe(1)
    expect(cur.alertsSent).toBe(1)
  })

  it('completos y mediana de minutos hasta completarse', async () => {
    const m = await match(await player())
    await su`UPDATE rival_matches SET created_at = now() - interval '1 hour', filled_at = now() WHERE id = ${m}`
    const cur = (await getRivalMonitor(NOW)).weeks[0]!
    expect(cur.matchesFilled).toBe(1)
    expect(cur.medianMinutesToFill).toBe(60)
  })
})
