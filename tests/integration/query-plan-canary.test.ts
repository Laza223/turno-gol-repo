/**
 * Canario de plan de ejecución — protege la clase D3-H1.
 * (docs/audit/reports/fase-d3-queries-rol-real-report.md)
 *
 * La clase: los índices de expresión ART
 * `(occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date` (creados
 * en la migración 053) eran INUSABLES bajo el rol real `turnogol_app` con RLS
 * activa — `timezone(text, timestamptz)` no es LEAKPROOF (`pg_proc.proleakproof
 * = f`), así que Postgres se niega a evaluar quals no-leakproof debajo de la
 * barrera de seguridad de las policies: la expresión NUNCA baja como Index
 * Cond bajo RLS, aunque el índice exista y "matchee" completo (ambas columnas)
 * si lo probás como superusuario (RLS bypasseada).
 *
 * El fix (fase D3) migró los 8 callers estilo expresión (`cashflow.service.ts`,
 * `canteen-report.service.ts`, `daily-close.service.ts`, `dashboard/queries.ts`)
 * a un rango UTC sargable vía `artDayRangeUtc()` (src/shared/time/art-date.ts):
 * los operadores de comparación (`>=`/`<`) sobre la columna cruda SÍ son
 * leakproof y entran por los índices crudos `idx_cash_flows_tenant_date` /
 * `idx_stock_movements_tenant_day`. La migración 054 dropeó los 2 índices de
 * expresión (quedaban como costo de escritura puro, inusables bajo RLS).
 *
 * Determinismo (`SET LOCAL enable_seqscan = off`): Postgres implementa los
 * `enable_*` no como un booleano que prohíbe el plan, sino sumándole un costo
 * artificial altísimo (`disable_cost`, 1e10) a las alternativas de Seq Scan.
 * Si un índice PUEDE usarse para la query, su costo real sigue siendo menor a
 * 1e10 y el planner lo prefiere frente a Seq Scan — sin importar volumen. Pero
 * OJO con una sorpresa empírica (ver más abajo): con MUY pocas filas, si la
 * tabla tiene VARIOS índices cuya columna líder es `tenant_id` (como
 * cash_flows: _tenant_date/_tenant_type/_tenant_category), `enable_seqscan =
 * off` por sí solo NO alcanza para forzar que el planner elija el índice
 * "correcto" — cualquiera de ellos sirve la igualdad de `tenant_id` y el
 * empate de costo (sin ANALYZE representativo) se resuelve arbitrariamente.
 * Los canarios positivos de abajo siembran un puñado de filas EXTRA con fechas
 * viejas (no solo el día de hoy) + `ANALYZE`, para que la selectividad real
 * del rango de fecha le dé al índice correcto una ventaja de costo genuina
 * (medida, no asumida) — igual que pasaría en producción con volumen real.
 *
 * El canario NEGATIVO tiene una sorpresa más filosa todavía: con los índices
 * `_tenant_date/_tenant_type/_tenant_category` presentes, el planner SIGUE
 * pudiendo resolver la igualdad `tenant_id = X` con CUALQUIERA de ellos (no
 * hace falta el índice de expresión para eso) — así que el nodo NUNCA es un
 * "Seq Scan" puro incluso bajo RLS, aunque el índice de expresión "de facto"
 * quede inusable para la parte de fecha. La evidencia real y determinista de
 * la clase no es "Node Type = Seq Scan": es que el `Index Cond` de la
 * expresión ART NUNCA incluye la comparación de fecha bajo `turnogol_app`
 * (queda como `Filter` post-scan), mientras que como superusuario el MISMO
 * índice sí empuja las DOS columnas al `Index Cond`. Por eso el negativo
 * DROPea temporalmente (dentro de la misma transacción, rollback al final)
 * los otros índices con `tenant_id` líder en `cash_flows` — así el índice de
 * expresión recreado es el ÚNICO candidato y el contraste queda limpio.
 *
 * Si este archivo se pone en rojo:
 *  - Si falla un canario POSITIVO (el Index Cond deja de incluir
 *    `occurred_at`, o aparece un Seq Scan real): algún caller volvió a
 *    filtrar `occurred_at` con la expresión `AT TIME ZONE ...::date` en el
 *    WHERE (usarla en el SELECT/GROUP BY para etiquetar el día es inofensivo,
 *    post-filtro). Migrarlo a `artDayRangeUtc()`.
 *  - Si falla el canario NEGATIVO (el Index Cond bajo `turnogol_app` SÍ
 *    empieza a incluir la comparación de fecha): significa que Postgres pasó
 *    a tratar `timezone()` como LEAKPROOF (poco probable) o que cambió cómo
 *    RLS empuja quals no-leakproof — la clase D3-H1 murió. En ese caso,
 *    revisar si este archivo (y la migración de los callers a
 *    `artDayRangeUtc()`) siguen teniendo sentido.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TransactionSql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import { artDayRangeUtc, todayART } from '@/shared/time/art-date'
import { createTestStaffUser, createTestTenant, ensureRoles } from '../helpers/tenant'

// ─── Helpers de parseo de plan ──────────────────────────────────────────
type PlanNode = Record<string, unknown> & {
  'Node Type'?: string
  'Relation Name'?: string
  'Index Name'?: string
  'Index Cond'?: string
  Filter?: string
  Plans?: PlanNode[]
}

function flatten(node: PlanNode): PlanNode[] {
  const children = node.Plans ?? []
  return [node, ...children.flatMap(flatten)]
}

/** Extrae el nodo raíz de `EXPLAIN (FORMAT JSON) ...` (rows[0]['QUERY PLAN'][0].Plan). */
function planRoot(rows: unknown): PlanNode {
  const arr = rows as Array<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>
  return arr[0]['QUERY PLAN'][0].Plan
}

/** Versión compacta del plan para mensajes de falla útiles (sin ruido de costos). */
function compactPlan(root: PlanNode): string {
  const pick = (n: PlanNode): unknown => ({
    nodeType: n['Node Type'],
    relation: n['Relation Name'],
    indexName: n['Index Name'],
    indexCond: n['Index Cond'],
    filter: n.Filter,
    plans: n.Plans?.map(pick),
  })
  return JSON.stringify(pick(root))
}

function seqScanOn(root: PlanNode, relation: string): PlanNode | undefined {
  return flatten(root).find((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === relation)
}

function indexCondMentions(root: PlanNode, column: string): boolean {
  return flatten(root).some(
    (n) => typeof n['Index Cond'] === 'string' && n['Index Cond']!.includes(column),
  )
}

/** Concatena Index Cond / Filter de todos los nodos sobre `relation` (para el negativo). */
function condTextsFor(root: PlanNode, relation: string): { indexCond: string; filter: string } {
  const nodes = flatten(root).filter((n) => n['Relation Name'] === relation)
  return {
    indexCond: nodes.map((n) => n['Index Cond'] ?? '').join(' | '),
    filter: nodes.map((n) => n.Filter ?? '').join(' | '),
  }
}

class RollbackMarker extends Error {}

/**
 * A diferencia de `withContextRollback` (client.ts) — que fija rol/contexto
 * ANTES de llamar a `fn` — este helper no toca el rol: el canario negativo
 * necesita correr una fase completa como superusuario (control) y RECIÉN
 * DESPUÉS, en la MISMA transacción, cambiar a `turnogol_app` — el índice (y
 * los DROP de sus competidores) hechos en la fase superuser deben seguir
 * vigentes para la fase RLS. Rollback incondicional al final (nunca persiste
 * nada, incluidos el CREATE/DROP INDEX temporales).
 */
async function runRollback(fn: (tx: TransactionSql) => Promise<void>): Promise<void> {
  const sql = getSql()
  await sql
    .begin(async (tx) => {
      await fn(tx)
      throw new RollbackMarker()
    })
    .catch((e) => {
      if (!(e instanceof RollbackMarker)) throw e
    })
}

// ─── Seed ────────────────────────────────────────────────────────────────
// No hace falta volumen tipo D3 (miles de filas): alcanza con un puñado de
// filas VIEJAS (fuera del rango del día) además de las de "hoy", para que
// ANALYZE le dé al planner una selectividad real que distinga
// idx_cash_flows_tenant_date/idx_stock_movements_tenant_day de los otros
// índices con tenant_id líder — ver cabecera ("sorpresa empírica").
const SEED_DAYS = 40

let tenantId: string
let staffUserId: string
let productId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const staff = await createTestStaffUser(sql)
  staffUserId = staff.id

  const productRows = await sql<{ id: string }[]>`
    INSERT INTO canteen_products (tenant_id, name, price, stock)
    VALUES (${tenantId}, ${'Canario producto'}, 100000, 10)
    RETURNING id
  `
  productId = productRows[0].id

  // 1 fila por día durante SEED_DAYS días (i=0 = hoy, dentro del rango que
  // consultan los canarios positivos; i=1..39 = fuera de rango). kind='sale'
  // exige cash_flow_id o tab_id (chk_sale_has_parent) — se encadena al
  // cash_flow del mismo día.
  const now = new Date()
  for (let i = 0; i < SEED_DAYS; i++) {
    const occurredAt = new Date(now.getTime() - i * 24 * 3600_000)
    const cfRows = await sql<{ id: string }[]>`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tenantId}, 'income', 'product_sale', 1000, 'cash', ${'query-plan-canary'}, ${staffUserId}, ${occurredAt})
      RETURNING id
    `
    await sql`
      INSERT INTO stock_movements (tenant_id, product_id, kind, qty, unit_price, cash_flow_id, created_by, occurred_at)
      VALUES (${tenantId}, ${productId}, 'sale', -1, 100000, ${cfRows[0].id}, ${staffUserId}, ${occurredAt})
    `
  }

  // Sin ANALYZE, una tabla recién sembrada no tiene stats (reltuples/histograma)
  // y el planner empata el costo entre CUALQUIER índice cuya columna líder sea
  // tenant_id — el desempate sería arbitrario y no reflejaría el plan real que
  // usa la app con datos reales (ver cabecera).
  await sql`ANALYZE cash_flows`
  await sql`ANALYZE stock_movements`
}, 30_000)

afterAll(async () => {
  const sql = getSql()
  await sql`DELETE FROM stock_movements WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM canteen_products WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM tenants WHERE id = ${tenantId}`
  await sql`DELETE FROM staff_users WHERE id = ${staffUserId}`
  await closeSql()
})

// ─── Canarios positivos ──────────────────────────────────────────────────
// Forma real del WHERE tal como lo emite el servicio hoy (rango UTC sargable
// vía artDayRangeUtc — ver getDaySummary/getCashFlows en cashflow.service.ts
// y getSalesRanking en canteen-report.service.ts).
describe('canarios positivos: rango UTC sargable usa índice, no Seq Scan (turnogol_app + RLS)', () => {
  // Mismo patrón que el negativo: fase superusuario que DROPea (en tx, con
  // rollback) los OTROS índices tenant_id-líder de la tabla objetivo. Sin
  // esto el assert depende del DESEMPATE del planner entre índices que
  // comparten columna líder (verificación adversarial D5 lo reprodujo: con
  // stats distintas elegía idx_cash_flows_tenant_type y el occurred_at
  // quedaba como Filter — plan correcto, canario rojo). Con un único
  // candidato, el assert prueba lo que la clase D3-H1 exige de verdad: que
  // el rango sargable PUEDE bajar como Index Cond bajo turnogol_app + RLS.
  it('cash_flows por tenant + rango occurred_at (forma de getDaySummary)', async () => {
    const { fromUtc, toUtc } = artDayRangeUtc(todayART())
    let root!: PlanNode
    await runRollback(async (tx) => {
      await tx.unsafe('SET LOCAL enable_seqscan = off')
      await tx.unsafe('DROP INDEX IF EXISTS idx_cash_flows_tenant_type')
      await tx.unsafe('DROP INDEX IF EXISTS idx_cash_flows_tenant_category')

      await tx.unsafe('SET LOCAL ROLE turnogol_app')
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
      const rows = await tx.unsafe(
        `EXPLAIN (FORMAT JSON) SELECT type, category, method, SUM(amount)::int AS total
         FROM cash_flows
         WHERE tenant_id = $1
           AND occurred_at >= $2
           AND occurred_at < $3
         GROUP BY type, category, method`,
        [tenantId, fromUtc.toISOString(), toUtc.toISOString()],
      )
      root = planRoot(rows)
    })

    expect(
      seqScanOn(root, 'cash_flows'),
      `Seq Scan inesperado sobre cash_flows con rango sargable. Plan: ${compactPlan(root)}`,
    ).toBeUndefined()
    expect(
      indexCondMentions(root, 'occurred_at'),
      `Ningún Index Cond sobre occurred_at en el plan. Plan: ${compactPlan(root)}`,
    ).toBe(true)
  })

  it('stock_movements por tenant + rango occurred_at (forma de getSalesRanking)', async () => {
    const { fromUtc, toUtc } = artDayRangeUtc(todayART())
    let root!: PlanNode
    await runRollback(async (tx) => {
      await tx.unsafe('SET LOCAL enable_seqscan = off')
      await tx.unsafe('DROP INDEX IF EXISTS idx_stock_movements_product')

      await tx.unsafe('SET LOCAL ROLE turnogol_app')
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
      const rows = await tx.unsafe(
        `EXPLAIN (FORMAT JSON)
         SELECT sm.product_id, cp.name AS product_name,
                SUM(-sm.qty)::int AS units, SUM(-sm.qty * sm.unit_price)::int AS revenue
         FROM stock_movements sm
         JOIN canteen_products cp ON cp.id = sm.product_id
         LEFT JOIN canteen_tabs ct ON ct.id = sm.tab_id
         WHERE sm.tenant_id = $1
           AND sm.kind = 'sale'
           AND (sm.tab_id IS NULL OR ct.status <> 'canceled')
           AND sm.occurred_at >= $2
           AND sm.occurred_at < $3
         GROUP BY sm.product_id, cp.name`,
        [tenantId, fromUtc.toISOString(), toUtc.toISOString()],
      )
      root = planRoot(rows)
    })

    expect(
      seqScanOn(root, 'stock_movements'),
      `Seq Scan inesperado sobre stock_movements con rango sargable. Plan: ${compactPlan(root)}`,
    ).toBeUndefined()
    expect(
      indexCondMentions(root, 'occurred_at'),
      `Ningún Index Cond sobre occurred_at en el plan. Plan: ${compactPlan(root)}`,
    ).toBe(true)
  })
})

// ─── Canario negativo (control) ──────────────────────────────────────────
// Prueba la CLASE, no la ausencia trivial del índice (dropeado en 054): se
// recrea el índice de expresión DENTRO de la transacción del test (rollback
// al final = nunca persiste) y se demuestra el contraste real — como
// superusuario el Index Cond incluye AMBAS columnas (tenant_id + fecha); como
// turnogol_app+RLS, la misma comparación de fecha queda relegada a un Filter
// post-scan y NUNCA aparece en el Index Cond (ver cabecera para el porqué de
// no usar "Node Type = Seq Scan" como discriminador acá).
describe('canario negativo (control): índice de expresión ART sigue INUSABLE bajo turnogol_app + RLS', () => {
  it('D3-H1: mismo índice matchea las 2 columnas como superusuario, solo tenant_id bajo turnogol_app', async () => {
    let superIndexCond = ''
    let appIndexCond = ''
    let appFilter = ''
    let superPlanMsg = ''
    let appPlanMsg = ''

    await runRollback(async (tx) => {
      await tx.unsafe('SET LOCAL enable_seqscan = off')

      // Sacar del medio los OTROS índices con tenant_id líder en cash_flows:
      // si quedan, el planner puede resolver `tenant_id = X` con cualquiera de
      // ellos y el contraste se ensucia (ver cabecera). Rollback los restaura.
      await tx.unsafe('DROP INDEX IF EXISTS idx_cash_flows_tenant_date')
      await tx.unsafe('DROP INDEX IF EXISTS idx_cash_flows_tenant_type')
      await tx.unsafe('DROP INDEX IF EXISTS idx_cash_flows_tenant_category')

      // Recrear el índice de expresión que la migración 054 dropeó en prod.
      // CREATE INDEX en tx sobre tabla chica es barato; rollback lo deshace.
      await tx.unsafe(`
        CREATE INDEX idx_canary_cash_flows_expr_art
        ON cash_flows (tenant_id, ((occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date))
      `)

      const exprQuery = `
        EXPLAIN (FORMAT JSON)
        SELECT * FROM cash_flows
        WHERE tenant_id = $1
          AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = CURRENT_DATE
      `

      // Control: TODAVÍA como superusuario (sin SET ROLE) — RLS bypasseada
      // (los superusuarios ignoran RLS aunque la tabla tenga FORCE). El
      // índice de expresión recién creado debe empujar LAS DOS columnas al
      // Index Cond. Si esto falla, el problema es la query/índice de este
      // test, no la clase D3-H1 (evitaría un falso negativo más abajo).
      const superRoot = planRoot(await tx.unsafe(exprQuery, [tenantId]))
      ;({ indexCond: superIndexCond } = condTextsFor(superRoot, 'cash_flows'))
      superPlanMsg = compactPlan(superRoot)

      // El canario real: MISMA query, MISMO índice existente (único candidato
      // para tenant_id ahora), bajo turnogol_app + RLS activa.
      await tx.unsafe('SET LOCAL ROLE turnogol_app')
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`

      const appRoot = planRoot(await tx.unsafe(exprQuery, [tenantId]))
      ;({ indexCond: appIndexCond, filter: appFilter } = condTextsFor(appRoot, 'cash_flows'))
      appPlanMsg = compactPlan(appRoot)
    })

    expect(
      superIndexCond.includes('CURRENT_DATE'),
      'Control roto: el índice de expresión no empujó la comparación de fecha ' +
        `al Index Cond ni siquiera como superusuario — revisar la query/índice ` +
        `de este test antes de confiar en el negativo. Plan: ${superPlanMsg}`,
    ).toBe(true)

    expect(
      appIndexCond.includes('CURRENT_DATE'),
      'D3-H1 dejó de reproducirse: bajo turnogol_app+RLS, el Index Cond ' +
        'empezó a incluir la comparación de fecha (antes solo llegaba tenant_id, ' +
        'con la fecha relegada a un Filter post-scan). Si esto pasó, Postgres ' +
        'pasó a tratar timezone() como leakproof (poco probable) o cambió el ' +
        'pushdown de quals bajo RLS — la clase D3-H1 murió, revisar si este ' +
        `archivo sigue teniendo sentido. Plan: ${appPlanMsg}`,
    ).toBe(false)

    expect(
      appFilter.includes('CURRENT_DATE'),
      'Se esperaba que la comparación de fecha quedara como Filter post-scan ' +
        `bajo turnogol_app+RLS (nunca desapareció del plan del todo). Plan: ${appPlanMsg}`,
    ).toBe(true)
  })
})
