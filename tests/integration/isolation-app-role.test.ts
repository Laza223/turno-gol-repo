/**
 * Aislamiento entre complejos medido con el ROL REAL de producción
 * (`turnogol_app`), entrando por LOGIN y por los mismos envoltorios que usa la
 * aplicación (`withTenantContext` / `withPlayerContext`).
 *
 * Por qué existe, además de `isolation.test.ts`:
 *
 *   `.env.test` apunta `DATABASE_URL` a `postgres`, que en esta base tiene
 *   BYPASSRLS. La suite vieja tapa eso a mano con `SET LOCAL ROLE` adentro de
 *   cada transacción, y en la mayoría de sus bloques asume `authenticated`, no
 *   el rol de la app. O sea: mide policies, pero por un camino que en
 *   producción no existe, y ningún test pasa hoy por `withTenantContext`.
 *
 *   Acá el pool de la app LOGUEA como `turnogol_app` de verdad. Eso activa
 *   también el `rolconfig` de la migración 055 y la matriz de GRANT/REVOKE
 *   real, que `SET ROLE` desde superusuario reproduce sólo a medias.
 *
 * Los cuatro controles del bloque 0 son bloqueantes: si alguno cae, lo que se
 * mida después es basura. En particular el control NEGATIVO ("la fila existe y
 * se ve desde su propio contexto"): sin él, una base vacía daría cero en toda
 * la grilla y parecería un aprobado perfecto.
 *
 * La lista de tablas se LEE de la base, no de CLAUDE.md: una tabla nueva que
 * nadie documentó entra sola a la grilla. La forma de las policies también se
 * lee, pero las afirmaciones usan la lista DECLARADA y el caso 0.5 contrasta
 * una contra otra — ver el comentario de `OPEN_READ_DECLARADA` para saber por
 * qué esa distinción no es burocracia.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  closeSql,
  getDb,
  getSql,
  getWorkerSql,
  withPlayerContext,
  withTenantContext,
  type DbTx,
} from '@/shared/db/client'
import { adminSql } from '../helpers/admin-db'
import { cleanupAll, createTestTenant } from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

const APP_TEST_PASSWORD = 'turnogol_app_audit_rls'
const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
const GRID_OUT = process.env.RLS_GRID_OUT ?? ''

let prevAppUrl: string | undefined
let prevAdminUrl: string | undefined
let prevPoolMax: string | undefined
let prevAppVerifier: string | null = null
let appCouldLoginBefore = false

type Ctx = { id: string; slug: string; name: string }
let tenantA: Ctx
let tenantB: Ctx
let A: IsolationSeed
let B: IsolationSeed

/** id de la fila sembrada por tabla, para cada complejo. */
const rowA: Record<string, string> = {}
const rowB: Record<string, string> = {}
/** Fila de B serializada, leída por el pool admin: insumo del alta-spoof. */
const rowJsonB: Record<string, Record<string, unknown>> = {}
/** Columnas insertables por tabla (sin las generadas): lista para el alta-spoof. */
const insertableCols: Record<string, string[]> = {}
let tenantTables: string[] = []
/** Clasificación LEÍDA de la base en cada corrida. */
const tenantScoped = new Set<string>()
const playerScoped = new Set<string>()
const openRead = new Set<string>()

/**
 * Clasificación DECLARADA. Las afirmaciones de la grilla usan ésta, nunca la
 * leída, y el caso 0.5 contrasta una contra otra.
 *
 * No es burocracia: la primera versión de este archivo derivaba la excepción de
 * lectura abierta del catálogo, y en la prueba de mutación —abrir a mano la
 * policy de SELECT de `payments`— la suite siguió en VERDE, porque la tabla se
 * reclasificaba sola como "excepción de diseño" y el caso pasaba a esperar que
 * la fila ajena SÍ se viera. Un arnés que se adapta a la rotura no mide nada.
 */
const OPEN_READ_DECLARADA = ['reviews']
const TENANT_SCOPED_DECLARADA = [
  'abonados',
  'analytics_events',
  'audit_logs',
  'bookings',
  'canteen_products',
  'canteen_tabs',
  'cash_flows',
  'courts',
  'daily_cash_closes',
  'daily_cash_opens',
  'feature_flags',
  'notifications',
  'payments',
  'player_tenant_relationships',
  'players',
  'push_subscriptions',
  'staff_users',
  'stock_movements',
  'tenant_player_bans',
  'tenant_staff_members',
  'tenant_subscriptions',
  'tournament_match_events',
  'tournament_matches',
  'tournament_stages',
  'tournament_team_players',
  'tournament_teams',
  'tournaments',
]
const PLAYER_SCOPED_DECLARADA = [
  'bookings',
  'courts',
  'payments',
  'player_favorites',
  'player_tenant_relationships',
  'players',
  'tenant_player_bans',
]

/** Celdas medidas, para el informe. */
type Cell = {
  tabla: string
  operacion: string
  resultado: string
  mecanismo: string
  aislado: boolean
}
const grid: Cell[] = []
function record(c: Cell): Cell {
  grid.push(c)
  return c
}

/** El SQLSTATE viaja en `cause` cuando Drizzle envuelve el error de postgres-js. */
function pgCode(e: unknown): string | undefined {
  const any = e as { code?: string; cause?: { code?: string } }
  return any?.code ?? any?.cause?.code
}
function pgMessage(e: unknown): string {
  const any = e as { message?: string; cause?: { message?: string } }
  return any?.cause?.message ?? any?.message ?? String(e)
}

class Rollback extends Error {}

/**
 * Corre `fn` por el envoltorio de producción que corresponda y SIEMPRE deshace.
 * `kind: 'none'` abre la transacción sin setear ningún contexto — el modo de
 * falla más probable en producción: una consulta que se olvidó del envoltorio.
 */
async function tx<T>(
  ctx: { kind: 'tenant' | 'player' | 'none'; id?: string },
  fn: (t: DbTx) => Promise<T>,
): Promise<T> {
  let out!: T
  let inner: unknown = null
  const body = async (t: DbTx): Promise<never> => {
    try {
      out = await fn(t)
    } catch (e) {
      inner = e
    }
    throw new Rollback('rollback')
  }
  try {
    if (ctx.kind === 'tenant') await withTenantContext(ctx.id!, body)
    else if (ctx.kind === 'player') await withPlayerContext(ctx.id!, body)
    else await getDb().transaction(body)
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  if (inner) throw inner
  return out
}

async function rowCount(
  ctx: { kind: 'tenant' | 'player' | 'none'; id?: string },
  statement: ReturnType<typeof drizzleSql>,
): Promise<number> {
  const res = (await tx(ctx, (t) => t.execute(statement))) as unknown as unknown[]
  return res.length
}

beforeAll(async () => {
  // Los pools son singletons que sobreviven entre archivos vía globalThis.
  // Adoptarlos y cerrarlos ANTES de tocar el entorno: si quedara vivo un pool
  // superusuario de otro archivo, `getDb()` lo reusaría y toda la grilla
  // mediría contra el rol equivocado.
  getSql()
  getWorkerSql()
  await closeSql()

  const original = process.env.DATABASE_URL ?? DEFAULT_URL

  // El pool de siembra tiene que quedarse en el superusuario: es el gancho que
  // `admin-db.ts` dejó preparado y que hasta ahora nadie usaba.
  prevAdminUrl = process.env.TEST_ADMIN_DATABASE_URL
  process.env.TEST_ADMIN_DATABASE_URL = original

  // Una sola conexión: hace determinista la prueba de contexto que sobrevive.
  prevPoolMax = process.env.DATABASE_POOL_MAX
  process.env.DATABASE_POOL_MAX = '1'

  const su = adminSql()

  const before = (
    await su<Array<{ can_login: boolean; verifier: string | null }>>`
      SELECT rolcanlogin AS can_login, rolpassword AS verifier
      FROM pg_authid WHERE rolname = 'turnogol_app'
    `
  )[0]
  appCouldLoginBefore = before?.can_login === true
  prevAppVerifier = before?.verifier ?? null
  // La 037 no crea el rol (nace NOLOGIN en el bootstrap; en prod le ponen
  // credencial a mano). Se le habilita LOGIN sólo mientras dura este archivo y
  // se devuelve el verifier SCRAM exacto en el afterAll.
  await su.unsafe(`ALTER ROLE turnogol_app LOGIN PASSWORD '${APP_TEST_PASSWORD}'`)

  prevAppUrl = process.env.DATABASE_URL
  const appUrl = new URL(original)
  appUrl.username = 'turnogol_app'
  appUrl.password = APP_TEST_PASSWORD
  process.env.DATABASE_URL = appUrl.toString()

  // ── Siembra: SIEMPRE por el pool admin, nunca por el pool que se mide.
  await cleanupAll(su)
  await su`DELETE FROM feature_flags WHERE key LIKE 'audit_flag_%'`
  tenantA = await createTestTenant(su)
  tenantB = await createTestTenant(su)
  A = await seedIsolationData(su, tenantA.id)
  B = await seedIsolationData(su, tenantB.id)

  tenantTables = (
    await su<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'tenant_id'
        )
      ORDER BY c.relname
    `
  ).map((r) => r.relname)

  // Clasificación derivada del catálogo, no de una lista a mano: si una policy
  // cambia de forma, la fila se reclasifica sola en la próxima corrida.
  const pol = await su<Array<{ relname: string; expr: string }>>`
    SELECT c.relname, COALESCE(pg_get_expr(p.polqual, p.polrelid), '') AS expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE p.polcmd IN ('r', '*')
  `
  for (const p of pol) {
    if (p.expr.includes('app.current_tenant_id')) tenantScoped.add(p.relname)
    if (p.expr.includes('app.current_player_id')) playerScoped.add(p.relname)
    if (p.expr.trim() === 'true') openRead.add(p.relname)
  }

  const seeded = (s: IsolationSeed): Record<string, string> => ({
    abonados: s.abonadoId,
    audit_logs: s.auditLogId,
    bookings: s.bookingId,
    cash_flows: s.cashFlowId,
    courts: s.courtId,
    daily_cash_closes: s.dailyCashCloseId,
    notifications: s.notificationId,
    payments: s.paymentId,
    player_tenant_relationships: s.ptrId,
    tenant_player_bans: s.banId,
    tenant_staff_members: s.staffMemberId,
    tenant_subscriptions: s.subscriptionId,
    tournament_match_events: s.tournamentMatchEventId,
    tournament_matches: s.tournamentMatchId,
    tournament_stages: s.tournamentStageId,
    tournament_team_players: s.tournamentTeamPlayerId,
    tournament_teams: s.tournamentTeamId,
    tournaments: s.tournamentId,
  })
  Object.assign(rowA, seeded(A))
  Object.assign(rowB, seeded(B))

  // Las nueve tablas que `seedIsolationData` no cubre. Sin fila sembrada, su
  // celda daría cero por vacía y no por aislamiento — el falso verde que este
  // archivo existe para evitar.
  for (const [tenant, seed, tag] of [
    [tenantA, A, 'a'],
    [tenantB, B, 'b'],
  ] as const) {
    const target = tag === 'a' ? rowA : rowB
    const one = async (table: string, q: Promise<Array<{ id: string }>>): Promise<void> => {
      target[table] = (await q)[0]!.id
    }
    await one(
      'push_subscriptions',
      su`INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
         VALUES (${tenant.id}, ${seed.staffUserId}, ${`https://push.audit/${tenant.id}`}, 'p256dh', 'auth')
         RETURNING id`,
    )
    await one(
      'player_favorites',
      su`INSERT INTO player_favorites (player_id, tenant_id)
         VALUES (${seed.playerId}, ${tenant.id}) RETURNING id`,
    )
    await one(
      'canteen_products',
      su`INSERT INTO canteen_products (tenant_id, name, price, stock)
         VALUES (${tenant.id}, 'Agua auditoria', 150000, 10) RETURNING id`,
    )
    await one(
      'canteen_tabs',
      su`INSERT INTO canteen_tabs (tenant_id, debtor_name, total_amount, created_by)
         VALUES (${tenant.id}, 'Fiado auditoria', 150000, ${seed.staffUserId}) RETURNING id`,
    )
    await one(
      'stock_movements',
      su`INSERT INTO stock_movements (tenant_id, product_id, kind, qty, created_by)
         VALUES (${tenant.id}, ${target['canteen_products']}, 'purchase', 5, ${seed.staffUserId})
         RETURNING id`,
    )
    await one(
      'daily_cash_opens',
      su`INSERT INTO daily_cash_opens (tenant_id, date, opening_cash, opened_by)
         VALUES (${tenant.id}, ${tag === 'a' ? '2019-06-01' : '2019-06-02'}, 250000, ${seed.staffUserId})
         RETURNING id`,
    )
    await one(
      'feature_flags',
      su`INSERT INTO feature_flags (key, value, tenant_id)
         VALUES (${`audit_flag_${tag}`}, true, ${tenant.id}) RETURNING id`,
    )
    await one(
      'analytics_events',
      su`INSERT INTO analytics_events (category, event, tenant_id, data)
         VALUES ('funnel', 'checkout.viewed', ${tenant.id}, ${su.json({ audit: true })}) RETURNING id`,
    )
    // La reseña exige una reserva completada del mismo complejo y jugador.
    await su`UPDATE bookings SET status = 'completed' WHERE id = ${seed.bookingId}`
    await one(
      'reviews',
      su`INSERT INTO reviews (tenant_id, player_id, booking_id, rating, comment)
         VALUES (${tenant.id}, ${seed.playerId}, ${seed.bookingId}, 5, ${`resena auditoria ${tag}`})
         RETURNING id`,
    )
  }

  // La fila de B tal cual está en la base, insumo del alta-spoof genérica, más
  // la lista de columnas insertables: las GENERATED (hoy
  // `tournament_teams.name_normalized`) rechazan cualquier valor explícito con
  // un 428C9 que no tiene nada que ver con el aislamiento.
  const cols = await su<Array<{ relname: string; attname: string }>>`
    SELECT c.relname, a.attname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attgenerated = ''
      AND a.attidentity = ''
    ORDER BY a.attnum
  `
  for (const c of cols) {
    if (!insertableCols[c.relname]) insertableCols[c.relname] = []
    insertableCols[c.relname]!.push(c.attname)
  }
  for (const t of tenantTables) {
    const id = rowB[t]
    if (!id) continue
    const r = (await su.unsafe(`SELECT to_jsonb(x) AS j FROM ${t} x WHERE x.id = $1`, [id]))[0]
    rowJsonB[t] = (r as unknown as { j: Record<string, unknown> }).j
  }
}, 180_000)

afterAll(async () => {
  await closeSql()
  const su = adminSql()
  await cleanupAll(su)
  await su`DELETE FROM feature_flags WHERE key LIKE 'audit_flag_%'`
  if (appCouldLoginBefore && prevAppVerifier) {
    // Máquina de desarrollo: se devuelve el verifier SCRAM tal cual estaba, sin
    // conocerlo ni escribirlo en ningún lado. Si no, la app local deja de
    // conectar y todo el panel tira 500.
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

  if (GRID_OUT) {
    mkdirSync(dirname(GRID_OUT), { recursive: true })
    writeFileSync(
      GRID_OUT,
      JSON.stringify(
        {
          grid,
          tenantTables,
          tenantScoped: [...tenantScoped].sort(),
          playerScoped: [...playerScoped].sort(),
          openRead: [...openRead].sort(),
        },
        null,
        2,
      ),
    )
  }
}, 180_000)

// ─────────────────────────────────────────────────────────────────────────
// 0. LOS CUATRO CONTROLES. Si alguno cae, lo de abajo no significa nada.
// ─────────────────────────────────────────────────────────────────────────
describe('0. controles', () => {
  it('0.1 identidad: turnogol_app, sin superusuario, sin BYPASSRLS y sin ser dueño de tablas', async () => {
    const rows = (await getDb().execute(drizzleSql`
      SELECT current_user::text                                   AS usuario,
             r.rolsuper                                           AS superusuario,
             r.rolbypassrls                                       AS bypassrls,
             current_setting('row_security')                      AS row_security,
             (SELECT count(*)::int FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r'
                 AND pg_get_userbyid(c.relowner) = current_user)  AS tablas_propias
      FROM pg_roles r WHERE r.rolname = current_user
    `)) as unknown as Array<{
      usuario: string
      superusuario: boolean
      bypassrls: boolean
      row_security: string
      tablas_propias: number
    }>
    const row = rows[0]!
    expect(row.usuario).toBe('turnogol_app')
    expect(row.superusuario).toBe(false)
    expect(row.bypassrls).toBe(false)
    expect(row.row_security).toBe('on')
    // Sin FORCE, el dueño de una tabla se saltea sus propias policies.
    expect(row.tablas_propias).toBe(0)
  })

  it('0.2 permisos: la matriz vigente coincide con la que definen las migraciones', async () => {
    const su = adminSql()
    const rows = await su<Array<{ table_name: string; privs: string }>>`
      SELECT table_name, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS privs
      FROM information_schema.table_privileges
      WHERE grantee = 'turnogol_app' AND table_schema = 'public'
      GROUP BY table_name
    `
    const actual: Record<string, string> = Object.fromEntries(
      rows.map((r) => [r.table_name, r.privs]),
    )
    // Las revocaciones acumuladas (008, 037, 048, 049, 059, 065, 072, 084 y 085). Si
    // una tabla nueva llega sin su REVOKE, o si alguien re-otorga de más, esto
    // se pone rojo ANTES de que la grilla mida nada.
    const recortes: Record<string, string> = {
      audit_logs: 'INSERT,SELECT',
      daily_cash_closes: 'INSERT,SELECT',
      stock_movements: 'INSERT,SELECT',
      canteen_products: 'INSERT,SELECT,UPDATE',
      canteen_tabs: 'INSERT,SELECT,UPDATE',
      daily_cash_opens: 'INSERT,SELECT,UPDATE',
      tournament_match_events: 'DELETE,INSERT,SELECT',
      analytics_events: 'DELETE,INSERT,SELECT',
      // Migración 085 (H-3): las seis globales, sin borrado; el catálogo
      // comercial, de sólo lectura.
      tenants: 'INSERT,SELECT,UPDATE',
      players: 'INSERT,SELECT,UPDATE',
      staff_users: 'INSERT,SELECT,UPDATE',
      processed_webhooks: 'INSERT,SELECT,UPDATE',
      plans: 'SELECT',
      price_versions: 'SELECT',
    }
    for (const [t, esperado] of Object.entries(recortes)) {
      expect(`${t}=${actual[t] ?? 'SIN PERMISOS'}`).toBe(`${t}=${esperado}`)
    }
    // Deny-all: el registro de envíos de push no es visible para la app.
    expect(actual['push_send_log'] ?? 'SIN PERMISOS').toBe('SIN PERMISOS')
  })

  it('0.3 control NEGATIVO: cada fila sembrada SÍ se ve desde su propio contexto', async () => {
    const invisibles: string[] = []
    for (const t of tenantTables) {
      const id = rowA[t]
      if (!id) {
        invisibles.push(`${t} (sin sembrar)`)
        continue
      }
      // El contexto correcto depende de la policy de la tabla, no de una lista
      // a mano: `player_favorites` sólo tiene policies por jugador, así que
      // desde contexto de complejo da cero POR DISEÑO y no por aislamiento.
      const ctx: { kind: 'tenant' | 'player'; id: string } = TENANT_SCOPED_DECLARADA.includes(t)
        ? { kind: 'tenant', id: tenantA.id }
        : { kind: 'player', id: A.playerId }
      const n = await rowCount(
        ctx,
        drizzleSql`SELECT id FROM ${drizzleSql.identifier(t)} WHERE id = ${id}::uuid`,
      )
      if (n !== 1) invisibles.push(`${t} (${n} filas, contexto ${ctx.kind})`)
    }
    // Si esto falla, la grilla entera daría cero por vacía, no por aislamiento.
    expect(invisibles).toEqual([])
  })

  it('0.4 control POSITIVO: con contexto de A, la fila de B devuelve cero', async () => {
    const n = await rowCount(
      { kind: 'tenant', id: tenantA.id },
      drizzleSql`SELECT id, tenant_id FROM bookings WHERE id = ${rowB['bookings']}::uuid`,
    )
    expect(n).toBe(0)
  })

  it('0.5 la forma de las policies de lectura sigue siendo la declarada', () => {
    // El candado que la prueba de mutación exigió. Si alguien abre una policy
    // de lectura —a propósito o por accidente— acá se pone rojo, en vez de que
    // la grilla la absorba como "excepción de diseño" y siga en verde.
    expect([...openRead].sort()).toEqual(OPEN_READ_DECLARADA)
    expect([...tenantScoped].sort()).toEqual(TENANT_SCOPED_DECLARADA)
    expect([...playerScoped].sort()).toEqual(PLAYER_SCOPED_DECLARADA)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 1. LA GRILLA: cada tabla con `tenant_id`, cuatro operaciones desde A contra
//    filas de B, más la columna "sin contexto".
//    Cada celda registra el resultado Y el mecanismo: no es lo mismo un cero
//    porque la policy filtró que un cero porque la operación está revocada.
// ─────────────────────────────────────────────────────────────────────────
describe('1. grilla cross-tenant (contexto de A contra filas de B)', () => {
  it('1.0 la grilla cubre TODAS las tablas con columna de complejo que hay en la base', () => {
    // El candado contra el olvido: si una migración agrega una tabla con
    // `tenant_id`, la lista declarada deja de coincidir con la base y este caso
    // se pone rojo. Sin esto, la tabla nueva quedaría fuera de la grilla y la
    // auditoría diría "todo aislado" sin haberla mirado nunca.
    expect(tenantTables).toEqual(tenantTablesLazy())
    expect(tenantTables.filter((t) => !rowB[t])).toEqual([])
  })

  describe('1.1 lectura ajena → 0 filas', () => {
    it.for(tenantTablesLazy())('%s', async (t) => {
      const n = await rowCount(
        { kind: 'tenant', id: tenantA.id },
        drizzleSql`SELECT id FROM ${drizzleSql.identifier(t)} WHERE id = ${rowB[t]!}::uuid`,
      )
      const abierta = OPEN_READ_DECLARADA.includes(t)
      record({
        tabla: t,
        operacion: 'SELECT',
        resultado: `${n} filas`,
        mecanismo: abierta
          ? 'policy de lectura abierta (USING true) — excepción de diseño'
          : TENANT_SCOPED_DECLARADA.includes(t)
            ? 'policy por complejo'
            : 'sin policy de lectura por complejo',
        aislado: n === 0,
      })
      if (abierta) {
        // Excepción documentada: la lectura pública de reseñas es a propósito.
        // Lo que se afirma acá es que sigue siendo la ÚNICA así.
        expect(n).toBe(1)
      } else {
        expect(n).toBe(0)
      }
    })
  })

  describe('1.2 modificación ajena → 0 filas afectadas', () => {
    it.for(tenantTablesLazy())('%s', async (t) => {
      let n = -1
      let mecanismo = 'policy de modificación por complejo'
      try {
        n = await rowCount(
          { kind: 'tenant', id: tenantA.id },
          drizzleSql`UPDATE ${drizzleSql.identifier(t)} SET tenant_id = tenant_id
                     WHERE id = ${rowB[t]!}::uuid RETURNING id`,
        )
      } catch (e) {
        // 42501 acá es el privilegio revocado, no la policy: también aísla,
        // pero por otro mecanismo, y el informe tiene que decir cuál.
        expect(pgCode(e)).toBe('42501')
        n = 0
        mecanismo = `privilegio revocado (${pgMessage(e).slice(0, 60)})`
      }
      record({
        tabla: t,
        operacion: 'UPDATE',
        resultado: `${n} filas`,
        mecanismo,
        aislado: n === 0,
      })
      expect(n).toBe(0)
    })
  })

  describe('1.3 borrado ajeno → 0 filas afectadas', () => {
    it.for(tenantTablesLazy())('%s', async (t) => {
      let n = -1
      let mecanismo = 'policy de borrado por complejo'
      try {
        n = await rowCount(
          { kind: 'tenant', id: tenantA.id },
          drizzleSql`DELETE FROM ${drizzleSql.identifier(t)} WHERE id = ${rowB[t]!}::uuid RETURNING id`,
        )
      } catch (e) {
        expect(pgCode(e)).toBe('42501')
        n = 0
        mecanismo = `privilegio revocado (${pgMessage(e).slice(0, 60)})`
      }
      record({
        tabla: t,
        operacion: 'DELETE',
        resultado: `${n} filas`,
        mecanismo,
        aislado: n === 0,
      })
      expect(n).toBe(0)
    })
  })

  describe('1.4 alta con complejo ajeno → rechazada', () => {
    // Genérica a propósito: se copia la fila REAL de B (leída por el pool
    // admin) cambiándole sólo el id. Así el alta siempre llega con todas sus
    // claves foráneas satisfechas y muere en la comprobación de RLS de ESA
    // tabla, en vez de morir antes por un 23503 y pasar por la razón
    // equivocada — que es como esta clase de test ya falló en el repo.
    it.for(tenantTablesLazy())('%s', async (t) => {
      // Una sola excepción a la copia literal: `notifications` tiene un trigger
      // que valida el destinatario ANTES de que corra la comprobación de RLS,
      // así que con el destinatario de B el alta moriría con un 23503 y la
      // policy no se ejercitaría nunca. Se le pone un destinatario válido bajo
      // el contexto de A para que el único motivo de rechazo posible sea RLS.
      const overrides: Record<string, Record<string, unknown>> = {
        notifications: { recipient_id: A.playerId },
      }
      const payload = JSON.stringify({
        ...rowJsonB[t],
        ...(overrides[t] ?? {}),
        id: randomUUID(),
      })
      const lista = insertableCols[t]!.map((c) => `"${c}"`).join(', ')
      let mecanismo = ''
      let rechazada = false
      try {
        await tx({ kind: 'tenant', id: tenantA.id }, (x) =>
          x.execute(
            // El `::text::jsonb` no es decorativo: el pool tiene serializador de
            // jsonb, así que un parámetro casteado directo a jsonb se
            // serializaría DOS veces y llegaría como un escalar de texto.
            drizzleSql`INSERT INTO ${drizzleSql.identifier(t)} (${drizzleSql.raw(lista)})
                       SELECT ${drizzleSql.raw(lista)}
                       FROM jsonb_populate_record(NULL::${drizzleSql.identifier(t)}, ${payload}::text::jsonb)`,
          ),
        )
      } catch (e) {
        rechazada = true
        mecanismo = `${pgCode(e)} ${pgMessage(e)}`
      }
      // Se registra ANTES de afirmar: una celda que se pierde porque el assert
      // tiró primero deja un agujero mudo en el informe.
      record({
        tabla: t,
        operacion: 'INSERT ajeno',
        resultado: rechazada ? 'rechazada' : 'ACEPTADA',
        mecanismo: mecanismo || 'ninguno: el alta pasó',
        aislado: rechazada,
      })
      expect(rechazada).toBe(true)
      // El rechazo tiene que ser de RLS y sobre ESTA tabla. Un 23503 o un 23505
      // querría decir que el alta murió antes de llegar a la policy — pasaría
      // por la razón equivocada, que es como esta clase de test ya falló acá.
      expect(`${t}: ${mecanismo}`).toContain(`42501`)
      expect(`${t}: ${mecanismo.toLowerCase()}`).toContain(`for table "${t}"`)
    })
  })

  describe('1.5 sin ningún contexto → 0 filas', () => {
    // El modo de falla más probable en producción: una consulta que se olvidó
    // del envoltorio. Con el contexto vacío, `NULLIF(current_setting(...))`
    // da NULL y toda comparación falla — salvo donde la policy es abierta.
    it.for(tenantTablesLazy())('%s', async (t) => {
      const n = await rowCount(
        { kind: 'none' },
        drizzleSql`SELECT id FROM ${drizzleSql.identifier(t)} WHERE id = ${rowB[t]!}::uuid`,
      )
      const abierta = OPEN_READ_DECLARADA.includes(t)
      record({
        tabla: t,
        operacion: 'SELECT sin contexto',
        resultado: `${n} filas`,
        mecanismo: abierta ? 'policy abierta (USING true)' : 'contexto vacío → comparación NULL',
        aislado: n === 0,
      })
      expect(n).toBe(abierta ? 1 : 0)
    })
  })
})

// `it.for` necesita el arreglo al momento de recolectar los casos, y
// `tenantTables` se llena recién en el `beforeAll`. Esta lista fija es el
// espejo declarado; el caso 1.0 falla si la base trae alguna tabla que no esté
// acá, así que no puede desincronizarse en silencio.
function tenantTablesLazy(): string[] {
  return [
    'abonados',
    'analytics_events',
    'audit_logs',
    'bookings',
    'canteen_products',
    'canteen_tabs',
    'cash_flows',
    'courts',
    'daily_cash_closes',
    'daily_cash_opens',
    'feature_flags',
    'notifications',
    'payments',
    'player_favorites',
    'player_tenant_relationships',
    'push_subscriptions',
    'reviews',
    'stock_movements',
    'tenant_player_bans',
    'tenant_staff_members',
    'tenant_subscriptions',
    'tournament_match_events',
    'tournament_matches',
    'tournament_stages',
    'tournament_team_players',
    'tournament_teams',
    'tournaments',
  ]
}

// ─────────────────────────────────────────────────────────────────────────
// 2. LAS TRES HÍBRIDAS, POR LOS DOS CAMINOS.
//    Tienen policies duales (por complejo y por jugador). Probar sólo el
//    camino del personal deja la mitad de la superficie sin medir.
// ─────────────────────────────────────────────────────────────────────────
describe('2. híbridas: camino de personal y camino de jugador', () => {
  it('2.1 relación jugador-complejo: el jugador de B no ve la fila de A', async () => {
    const n = await rowCount(
      { kind: 'player', id: B.playerId },
      drizzleSql`SELECT id FROM player_tenant_relationships WHERE id = ${rowA['player_tenant_relationships']!}::uuid`,
    )
    record({
      tabla: 'player_tenant_relationships',
      operacion: 'SELECT camino jugador',
      resultado: `${n} filas`,
      mecanismo: 'policy por jugador',
      aislado: n === 0,
    })
    expect(n).toBe(0)
  })

  it('2.2 relación jugador-complejo: el jugador A no puede darse de alta a nombre de B', async () => {
    let mecanismo = ''
    try {
      await tx({ kind: 'player', id: A.playerId }, (x) =>
        x.execute(drizzleSql`INSERT INTO player_tenant_relationships (tenant_id, player_id)
                             VALUES (${tenantB.id}::uuid, ${B.playerId}::uuid)`),
      )
    } catch (e) {
      mecanismo = `${pgCode(e)} ${pgMessage(e)}`
    }
    record({
      tabla: 'player_tenant_relationships',
      operacion: 'INSERT camino jugador (suplantando)',
      resultado: mecanismo ? 'rechazada' : 'ACEPTADA',
      mecanismo,
      aislado: Boolean(mecanismo),
    })
    expect(mecanismo.toLowerCase()).toContain('for table "player_tenant_relationships"')
  })

  it('2.3 favoritos: un jugador no ve el favorito de otro', async () => {
    const n = await rowCount(
      { kind: 'player', id: B.playerId },
      drizzleSql`SELECT id FROM player_favorites WHERE id = ${rowA['player_favorites']!}::uuid`,
    )
    record({
      tabla: 'player_favorites',
      operacion: 'SELECT camino jugador',
      resultado: `${n} filas`,
      mecanismo: 'policy por jugador',
      aislado: n === 0,
    })
    expect(n).toBe(0)
  })

  it('2.4 favoritos: un jugador no puede darle un favorito a otro', async () => {
    let mecanismo = ''
    try {
      await tx({ kind: 'player', id: B.playerId }, (x) =>
        x.execute(drizzleSql`INSERT INTO player_favorites (player_id, tenant_id)
                             VALUES (${A.playerId}::uuid, ${tenantB.id}::uuid)`),
      )
    } catch (e) {
      mecanismo = `${pgCode(e)} ${pgMessage(e)}`
    }
    record({
      tabla: 'player_favorites',
      operacion: 'INSERT camino jugador (suplantando)',
      resultado: mecanismo ? 'rechazada' : 'ACEPTADA',
      mecanismo,
      aislado: Boolean(mecanismo),
    })
    expect(mecanismo.toLowerCase()).toContain('for table "player_favorites"')
  })

  it('2.5 favoritos: desde contexto de personal no se ve nada, ni propio ni ajeno', async () => {
    // No tiene policy por complejo: el panel no lee esta tabla con contexto de
    // personal. Si algún día empezara a verse, sería una policy nueva sin
    // revisar.
    const n = await rowCount(
      { kind: 'tenant', id: tenantA.id },
      drizzleSql`SELECT id FROM player_favorites`,
    )
    expect(n).toBe(0)
  })

  it('2.6 reseñas: la lectura sigue abierta por diseño, pero ya no expone a la persona', async () => {
    // Excepción de diseño: el portal público muestra reseñas. Lo que se mide
    // acá es el ALCANCE de esa excepción, que es la pregunta que importa —
    // qué columnas viajan, no cuántas filas.
    const rows = (await tx({ kind: 'none' }, (x) =>
      x.execute(drizzleSql`SELECT tenant_id, booking_id, rating, comment
                           FROM reviews ORDER BY created_at`),
    )) as unknown as Array<Record<string, unknown>>
    const complejos = new Set(rows.map((r) => String(r['tenant_id'])))
    expect(complejos.size).toBe(2)

    // Y el identificador de la persona ya NO se lee, ni siquiera con la policy
    // abierta: la migración 084 lo sacó del permiso por columna. Es lo que
    // ataba la reseña a alguien; `booking_id` queda, y por sí solo no resuelve
    // a nadie porque `bookings` sí tiene RLS.
    let mecanismo = ''
    try {
      await tx({ kind: 'none' }, (x) =>
        x.execute(drizzleSql`SELECT player_id FROM reviews LIMIT 1`),
      )
    } catch (e) {
      mecanismo = `${pgCode(e)} ${pgMessage(e)}`
    }
    record({
      tabla: 'reviews',
      operacion: 'SELECT sin contexto (alcance)',
      resultado: `${rows.length} filas de ${complejos.size} complejos; player_id ${mecanismo ? 'denegado' : 'LEÍDO'}`,
      mecanismo:
        mecanismo ||
        'policy abierta (USING true) y sin recorte por columna: la barrera sería sólo la proyección del código',
      aislado: Boolean(mecanismo),
    })
    // El código exacto importa: cualquier otro error leído como denegación
    // daría un verde falso.
    expect(mecanismo || 'LEÍDO').toContain('42501')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. EL CONTEXTO QUE SOBREVIVE.
//    Con el pool en una sola conexión, dos transacciones consecutivas caen sí
//    o sí en la misma conexión física. Si la segunda heredara el contexto de
//    la primera, en producción un pedido leería los datos del pedido anterior.
// ─────────────────────────────────────────────────────────────────────────
describe('3. el contexto no sobrevive entre transacciones de la misma conexión', () => {
  it('3.1 después de un contexto de complejo, la transacción siguiente no hereda nada', async () => {
    const propias = await rowCount(
      { kind: 'tenant', id: tenantA.id },
      drizzleSql`SELECT id FROM bookings WHERE id = ${rowA['bookings']!}::uuid`,
    )
    expect(propias).toBe(1)
    const heredadas = await rowCount(
      { kind: 'none' },
      drizzleSql`SELECT id FROM bookings WHERE id = ${rowA['bookings']!}::uuid`,
    )
    record({
      tabla: 'bookings',
      operacion: 'contexto heredado (complejo)',
      resultado: `${heredadas} filas`,
      mecanismo: 'set_config con alcance de transacción',
      aislado: heredadas === 0,
    })
    expect(heredadas).toBe(0)
  })

  it('3.2 después de un contexto de jugador, la transacción siguiente no hereda nada', async () => {
    const propias = await rowCount(
      { kind: 'player', id: A.playerId },
      drizzleSql`SELECT id FROM bookings WHERE id = ${rowA['bookings']!}::uuid`,
    )
    expect(propias).toBe(1)
    const heredadas = await rowCount(
      { kind: 'none' },
      drizzleSql`SELECT id FROM bookings WHERE id = ${rowA['bookings']!}::uuid`,
    )
    record({
      tabla: 'bookings',
      operacion: 'contexto heredado (jugador)',
      resultado: `${heredadas} filas`,
      mecanismo: 'set_config con alcance de transacción',
      aislado: heredadas === 0,
    })
    expect(heredadas).toBe(0)
  })

  it('3.3 el complejo de una transacción no se filtra a la siguiente con OTRO complejo', async () => {
    await rowCount(
      { kind: 'tenant', id: tenantA.id },
      drizzleSql`SELECT id FROM bookings WHERE id = ${rowA['bookings']!}::uuid`,
    )
    const n = await rowCount(
      { kind: 'tenant', id: tenantB.id },
      drizzleSql`SELECT id FROM bookings WHERE id = ${rowA['bookings']!}::uuid`,
    )
    expect(n).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 4. LAS GLOBALES SIN RLS.
//    Acá la pregunta no es "¿está aislado?" — no lo está, por diseño — sino
//    "¿hasta dónde llega el rol de la aplicación?". Estos casos FIJAN la
//    exposición conocida: si alguno se pone rojo, la barrera cambió y el
//    informe de la auditoría quedó desactualizado.
// ─────────────────────────────────────────────────────────────────────────
describe('4. tablas globales: alcance real del rol de la aplicación', () => {
  const CIFRADO_FALSO = `${'a'.repeat(32)}:${'b'.repeat(32)}:${'c'.repeat(64)}`

  it('4.1 ninguna de las cuatro globales tiene RLS', async () => {
    const su = adminSql()
    const rows = await su<Array<{ relname: string; rls: boolean }>>`
      SELECT c.relname, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('tenants', 'plans', 'price_versions', 'processed_webhooks')
      ORDER BY c.relname
    `
    expect(rows.map((r) => `${r.relname}=${r.rls}`)).toEqual([
      'plans=false',
      'price_versions=false',
      'processed_webhooks=false',
      'tenants=false',
    ])
  })

  it('4.2 con contexto del complejo A, el rol de la app lee la fila del complejo B', async () => {
    // El contexto de complejo no limita nada acá: `tenants` no tiene RLS.
    const rows = (await tx({ kind: 'tenant', id: tenantA.id }, (x) =>
      x.execute(drizzleSql`SELECT id, name, email FROM tenants WHERE id = ${tenantB.id}::uuid`),
    )) as unknown as Array<Record<string, unknown>>
    record({
      tabla: 'tenants',
      operacion: 'SELECT ajeno',
      resultado: `${rows.length} filas`,
      mecanismo: 'sin RLS: el único límite es el WHERE que escribió el programador',
      aislado: false,
    })
    expect(rows.length).toBe(1)
    expect(rows[0]!['name']).toBe(tenantB.name)
  })

  it('4.3 las credenciales de MercadoPago de OTRO complejo son legibles por el rol de la app', async () => {
    // Se siembra un valor con la FORMA del sobre cifrado (iv:tag:texto), nunca
    // una credencial real, y se lee desde el contexto del otro complejo.
    const su = adminSql()
    await su`UPDATE tenants SET mp_access_token = ${CIFRADO_FALSO}, mp_refresh_token = ${CIFRADO_FALSO} WHERE id = ${tenantB.id}`
    const rows = (await tx({ kind: 'tenant', id: tenantA.id }, (x) =>
      x.execute(
        drizzleSql`SELECT mp_access_token, mp_refresh_token FROM tenants WHERE id = ${tenantB.id}::uuid`,
      ),
    )) as unknown as Array<Record<string, string>>
    record({
      tabla: 'tenants',
      operacion: 'SELECT credenciales ajenas',
      resultado: `${rows.length} filas; sin permiso por columna`,
      mecanismo:
        'sin RLS y con permiso de SELECT sobre toda la tabla: el cifrado es la única barrera',
      aislado: false,
    })
    expect(rows[0]!['mp_access_token']).toBe(CIFRADO_FALSO)
    // Lo leído tiene la forma del sobre cifrado, no la de una credencial de
    // MercadoPago en claro (que empieza con APP_USR o TEST).
    expect(rows[0]!['mp_access_token']).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)
    await su`UPDATE tenants SET mp_access_token = NULL, mp_refresh_token = NULL WHERE id = ${tenantB.id}`
  })

  it('4.4 el rol de la app sigue pudiendo pisar la fila de otro complejo (límite conocido)', async () => {
    // No es una fuga de lectura, es alcance de escritura: cualquier consulta
    // sin el filtro correcto puede pisar datos de otro complejo. No se puede
    // revocar la modificación acá — la aplicación edita su PROPIA fila de
    // complejo (ajustes, credenciales de MercadoPago) y la tabla no tiene RLS
    // que distinga una de otra. Queda registrado como límite, no como
    // aprobación: lo que sí se cerró en la migración 085 es el borrado.
    const pisadas = await rowCount(
      { kind: 'tenant', id: tenantA.id },
      drizzleSql`UPDATE tenants SET name = 'pisado por otro complejo' WHERE id = ${tenantB.id}::uuid RETURNING id`,
    )
    record({
      tabla: 'tenants',
      operacion: 'UPDATE ajeno',
      resultado: `${pisadas} filas`,
      mecanismo: 'sin RLS y con permiso de UPDATE: nada lo frena en la base',
      aislado: false,
    })
    expect(pisadas).toBe(1)
  })

  it('4.6 el catálogo comercial es de sólo lectura para el rol de la app (migr. 085)', async () => {
    for (const tabla of ['plans', 'price_versions']) {
      let mecanismo = ''
      try {
        await tx({ kind: 'tenant', id: tenantA.id }, (x) =>
          x.execute(drizzleSql`UPDATE ${drizzleSql.identifier(tabla)} SET id = id RETURNING id`),
        )
      } catch (e) {
        mecanismo = `${pgCode(e)} ${pgMessage(e)}`
      }
      record({
        tabla,
        operacion: 'UPDATE del catálogo',
        resultado: mecanismo ? 'denegado' : 'ESCRITO',
        mecanismo,
        aislado: Boolean(mecanismo),
      })
      // El código exacto importa: un error de sintaxis o de columna inexistente
      // también "tira", y leído como denegación daría un verde falso.
      expect(`${tabla}: ${mecanismo || 'ESCRITO'}`).toContain('42501')
    }
  })

  it('4.7 ninguna de las seis tablas globales se puede BORRAR desde el rol de la app (migr. 085)', async () => {
    const globales = [
      'tenants',
      'players',
      'staff_users',
      'plans',
      'price_versions',
      'processed_webhooks',
    ]
    const escritas: string[] = []
    for (const tabla of globales) {
      let denegado = false
      let mecanismo = ''
      try {
        await tx({ kind: 'tenant', id: tenantA.id }, (x) =>
          x.execute(
            drizzleSql`DELETE FROM ${drizzleSql.identifier(tabla)} WHERE id = ${tenantB.id}::uuid RETURNING id`,
          ),
        )
      } catch (e) {
        mecanismo = `${pgCode(e)} ${pgMessage(e)}`
        // Mismo cuidado que en 4.6: sólo cuenta como denegación el permiso
        // insuficiente, no cualquier error.
        denegado = mecanismo.includes('42501')
      }
      record({
        tabla,
        operacion: 'DELETE',
        resultado: denegado ? 'denegado' : 'PERMITIDO',
        mecanismo,
        aislado: denegado,
      })
      if (!denegado) escritas.push(tabla)
    }
    expect(escritas).toEqual([])
  })

  it('4.5 el registro de envíos de push sigue denegado para el rol de la app', async () => {
    let mecanismo = ''
    try {
      await tx({ kind: 'tenant', id: tenantA.id }, (x) =>
        x.execute(drizzleSql`SELECT dedupe_key FROM push_send_log LIMIT 1`),
      )
    } catch (e) {
      mecanismo = `${pgCode(e)} ${pgMessage(e)}`
    }
    record({
      tabla: 'push_send_log',
      operacion: 'SELECT',
      resultado: mecanismo ? 'denegado' : 'LEÍDO',
      mecanismo,
      aislado: Boolean(mecanismo),
    })
    expect(mecanismo).toContain('42501')
  })
})
