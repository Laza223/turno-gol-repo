/**
 * Wipe legal Ley 25.326 §16 bajo el ROL REAL de producción (`turnogol_worker`),
 * no bajo el superusuario local.
 *
 * Por qué existe este archivo (clase "local enmascara", PR #30 / D5):
 * `getWorkerSql()` cae a `DATABASE_URL` (superusuario) cuando
 * `WORKER_DATABASE_URL` no está seteada — así que TODOS los tests del worker
 * corrían con un rol que puede setear GUCs SUSET y saltarse GRANTs. El wipe
 * estuvo ROTO en prod (`SET LOCAL session_replication_role` → "permission
 * denied to set parameter" bajo turnogol_worker) con la suite entera en verde.
 *
 * Acá el pool worker LOGUEA como `turnogol_worker` de verdad (se le habilita
 * LOGIN temporalmente — en prod el rol ya es LOGIN, ver deploy-playbook §7;
 * loguear en vez de SET ROLE también activa el rolconfig de la migr. 055,
 * mismo comportamiento que prod). El primer test es un tripwire: si el pool
 * vuelve a caer al superusuario, FALLA — no enmascara.
 *
 * El seed sigue corriendo por el pool superusuario (`getSql()`), igual que en
 * data-retention-cleanup.test.ts: lo que se prueba bajo rol real es el WIPE.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, getWorkerSql } from '@/shared/db/client'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { cleanupAll, ensureRoles } from '../helpers/tenant'
import { FULL, ZERO, countChildren, setupTenant } from '../helpers/retention'
import { runDataRetentionCleanup } from '@/shared/jobs/workers/data-retention-cleanup.worker'

const WORKER_TEST_PASSWORD = 'turnogol_worker_it'
const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

let prevWorkerUrl: string | undefined
let gateway: MockGateway

beforeAll(async () => {
  // Los pools son singletons que además sobreviven al reset de módulos entre
  // archivos vía globalThis (client.ts). Adoptarlos y cerrarlos ANTES de tocar
  // el env: si quedara vivo un pool worker superusuario de otro archivo,
  // getWorkerSql() lo reusaría y este archivo probaría contra el rol
  // equivocado (el tripwire de abajo lo cazaría, pero mejor no llegar ahí).
  getSql()
  getWorkerSql()
  await closeSql()

  prevWorkerUrl = process.env.WORKER_DATABASE_URL
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_URL)
  url.username = 'turnogol_worker'
  url.password = WORKER_TEST_PASSWORD
  process.env.WORKER_DATABASE_URL = url.toString()

  const su = getSql() // recreado desde DATABASE_URL: sigue siendo superusuario
  await ensureRoles(su)
  // 038 crea el rol NOLOGIN (la password de prod se setea a mano fuera de las
  // migraciones). Habilitar LOGIN solo mientras dura este archivo.
  await su.unsafe(`ALTER ROLE turnogol_worker LOGIN PASSWORD '${WORKER_TEST_PASSWORD}'`)
  await cleanupAll(su)

  gateway = new MockGateway()
  setBillingGateway(gateway)
}, 30_000)

afterAll(async () => {
  const su = getSql()
  await cleanupAll(su)
  await su.unsafe('ALTER ROLE turnogol_worker NOLOGIN')
  await su.unsafe('ALTER ROLE turnogol_worker PASSWORD NULL')
  if (prevWorkerUrl === undefined) {
    delete process.env.WORKER_DATABASE_URL
  } else {
    process.env.WORKER_DATABASE_URL = prevWorkerUrl
  }
  setBillingGateway(null)
  await closeSql()
}, 30_000)

describe('data-retention bajo turnogol_worker (rol real de prod)', () => {
  it('tripwire anti-enmascare: el pool worker corre como turnogol_worker, sin superuser, con BYPASSRLS', async () => {
    const sql = getWorkerSql()
    const [row] = await sql<
      Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>
    >`
      SELECT current_user,
             r.rolsuper,
             r.rolbypassrls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `
    // Si esto falla, WORKER_DATABASE_URL no se aplicó y el resto del archivo
    // estaría probando contra el superusuario — el bug exacto que dejó el
    // wipe roto en prod sin que ningún test lo viera.
    expect(row.current_user).toBe('turnogol_worker')
    expect(row.rolsuper).toBe(false)
    expect(row.rolbypassrls).toBe(true)
  })

  it('premisa del rediseño: session_replication_role sigue denegado para el rol worker', async () => {
    // Documenta POR QUÉ wipeTenant no puede usar replica role (GUC SUSET,
    // GRANT SET ON PARAMETER inaplicable en Supabase). Si algún día esto
    // deja de fallar, el approach de la migr. 058 puede simplificarse.
    const sql = getWorkerSql()
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL session_replication_role = 'replica'`)
      }),
    ).rejects.toThrow(/permission denied/)
  })

  it('wipe completo bajo rol real: borra todas las hijas (incluida la FK circular con booking terminal), anonimiza y cancela MP', async () => {
    const { tenantId, playerId } = await setupTenant({
      scheduleDaysAgo: 1,
      status: 'blocked',
      mpSubscriptionId: 'mp-live-worker-role',
    })
    const sql = getSql()

    expect(await countChildren(sql, tenantId)).toEqual(FULL)

    // Bajo turnogol_worker esto ejercita TODO lo que el superusuario
    // enmascaraba: SET CONSTRAINTS (sin privilegios) en vez del GUC SUSET,
    // GRANT DELETE de 057/058 sobre audit_logs/daily_cash_closes, y la FK
    // enforcement real con fk_bookings_payment diferida.
    await runDataRetentionCleanup()

    expect(await countChildren(sql, tenantId)).toEqual(ZERO)

    const [tenant] = await sql<
      Array<{ status: string; name: string; mp_access_token: string | null }>
    >`
      SELECT status, name, mp_access_token FROM tenants WHERE id = ${tenantId}
    `
    expect(tenant.status).toBe('deleted')
    expect(tenant.name).toBe('[deleted]')
    expect(tenant.mp_access_token).toBeNull()

    // Cross-tenant por Ley 25.326: el jugador NO se borra.
    const [playerRow] = await sql<{ id: string }[]>`
      SELECT id FROM players WHERE id = ${playerId}
    `
    expect(playerRow?.id).toBe(playerId)

    // Post-commit best-effort: el preapproval capturado bajo lock se canceló.
    expect(gateway.cancelPreapprovalCalls).toContain('mp-live-worker-role')
  }, 60_000)
})
