/**
 * Migración 055_role_timeouts.sql — verifica que turnogol_app/turnogol_worker
 * tengan sus timeouts de rol seteados, LEYENDO EL CATÁLOGO (pg_roles.rolconfig),
 * no reconectando/impersonando el rol.
 *
 * Gotcha (ver header de la migración): `ALTER ROLE ... SET` aplica al LOGIN de
 * la sesión — el rolconfig se carga recién cuando la conexión autentica CON ESE
 * ROL. Este test corre contra la DB con `postgres` (superuser, ver DEFAULT_URL
 * de client.ts) y jamás hace `SET ROLE turnogol_app`: si lo hiciera, el
 * rolconfig del rol NO se propagaría a la sesión ya conectada y el test daría
 * un falso negativo (o peor, un falso positivo si comparara `SHOW
 * statement_timeout` de la sesión, que seguiría siendo el default del
 * superuser). Por eso se lee `pg_roles.rolconfig` directo, que es la fuente de
 * verdad independiente de cómo se conectó esta sesión.
 *
 * Si `rolconfig` da NULL, la migración 055 nunca corrió contra esta DB.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { ensureRoles } from '../helpers/tenant'

type RoleConfigRow = { rolconfig: string[] | null }

function parseRolConfig(rolconfig: string[] | null): Record<string, string> {
  return Object.fromEntries(
    (rolconfig ?? []).map((entry) => {
      const idx = entry.indexOf('=')
      return [entry.slice(0, idx), entry.slice(idx + 1)]
    }),
  )
}

afterAll(async () => closeSql())

describe('role session timeouts (migración 055)', () => {
  it('turnogol_app: statement_timeout=15s, lock_timeout=3s, idle_in_transaction_session_timeout=60s', async () => {
    const sql = getSql()
    await ensureRoles(sql) // crea turnogol_app si faltara (037 lo asume creado a mano) — NO setea timeouts.

    const rows = await sql<RoleConfigRow[]>`
      SELECT rolconfig FROM pg_roles WHERE rolname = 'turnogol_app'
    `
    const rolconfig = rows[0]?.rolconfig ?? null
    expect(
      rolconfig,
      'turnogol_app.rolconfig es NULL — migración 055 no aplicada contra esta DB ' +
        '(ALTER ROLE turnogol_app SET statement_timeout/lock_timeout/idle_in_transaction_session_timeout nunca corrió)',
    ).not.toBeNull()

    const config = parseRolConfig(rolconfig)
    expect(config.statement_timeout).toBe('15s')
    expect(config.lock_timeout).toBe('3s')
    // 60s, no 30s: margen 2x sobre el worst-case de llamadas MP dentro de tx
    // (clase Saga pre-cargada a D4 — ver header de la migración 055).
    expect(config.idle_in_transaction_session_timeout).toBe('60s')
  })

  it('turnogol_worker: statement_timeout=120s, lock_timeout=10s, idle_in_transaction_session_timeout=120s', async () => {
    const sql = getSql()

    const rows = await sql<RoleConfigRow[]>`
      SELECT rolconfig FROM pg_roles WHERE rolname = 'turnogol_worker'
    `
    const rolconfig = rows[0]?.rolconfig ?? null
    expect(
      rolconfig,
      'turnogol_worker.rolconfig es NULL — migración 055 no aplicada contra esta DB ' +
        '(ALTER ROLE turnogol_worker SET statement_timeout/lock_timeout/idle_in_transaction_session_timeout nunca corrió). ' +
        'Nota: 038_turnogol_worker_role.sql crea el rol si falta, pero no lo crea este test — debe existir por migración.',
    ).not.toBeNull()

    const config = parseRolConfig(rolconfig)
    expect(config.statement_timeout).toBe('120s')
    expect(config.lock_timeout).toBe('10s')
    expect(config.idle_in_transaction_session_timeout).toBe('120s')
  })
})
