/**
 * D5 #6 — drift entre Drizzle (src/shared/db/schema/*.ts) y las migraciones SQL
 * a mano (fuente de verdad real, src/shared/db/migrations/0*.sql). Ambas
 * definen el mismo schema por separado, sin test que las mantenga en sync.
 * Corre contra la DB local ya migrada (getSql(), pool superusuario) y compara:
 *
 *   1. Tablas: Drizzle vs information_schema.tables — solo schema `public`
 *      (auth/storage/pgboss/supabase_migrations/etc. son de OTROS schemas,
 *      jamás candidatos porque la query ya filtra table_schema='public').
 *   2. Columnas por tabla: nombre + tipo SQL + nullability, vs
 *      information_schema.columns. `getTableConfig()` introspecciona los
 *      objetos Drizzle en runtime (no hace falta duplicar el mapeo a mano).
 *   3. Enums: labels de cada `pgEnum` (src/shared/db/schema/enums.ts) vs
 *      pg_enum/pg_type.
 *   4. Invariante D3-H1 (lección 2026-07-23, migr. 054): un índice de
 *      EXPRESIÓN sobre una tabla con RLS habilitada cuya expresión llama una
 *      función no-LEAKPROOF queda inusable bajo RLS (Postgres se niega a
 *      empujar quals no-leakproof bajo la barrera de seguridad de las
 *      policies) → Seq Scan silencioso. Debe haber CERO.
 *   5. Índices: todo índice declarado en Drizzle EXISTE en la DB. Nació de la
 *      auditoría de performance del 2026-08-29: el schema declaraba 21 índices
 *      que `053_index_hygiene.sql` ya había dropeado, y nada lo detectaba
 *      porque las secciones 1-3 comparan tablas, columnas y enums, nunca
 *      índices. Un schema que declara índices inexistentes miente como
 *      documentación (se lee para decidir si una query tiene soporte) y haría
 *      que `db:generate` produjera un diff fantasma.
 *
 * Drift real conocido, allowlisteado explícitamente más abajo (no arreglar acá,
 * ver comentarios en cada allowlist).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getTableConfig,
  isPgEnum,
  PgArray,
  PgEnumColumn,
  PgEnumObjectColumn,
  PgTable,
  type PgColumn,
} from 'drizzle-orm/pg-core'
import { is } from 'drizzle-orm'
import { closeSql, getSql } from '@/shared/db/client'
import * as schema from '@/shared/db/schema'

type DbColumn = {
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: 'YES' | 'NO'
  numeric_precision: number | null
  numeric_scale: number | null
}

// ─── Allowlists de drift conocido/explícito ────────────────────────────
//
// audit_logs.before_state / after_state: hallazgo original (D5 #6, citando
// docs/qa/HAPPY_PATHS_RUN_2026-07-16.md:166) las marcaba "columnas muertas
// (schema drift)". Verificado en esta tarea: EXISTEN en ambos lados (migr.
// 004_isolated_tables.sql:475-476 y src/shared/db/schema/audit-logs.ts) con
// tipo/nullability idénticos — el drift NO es Drizzle-vs-DB, es que ningún
// call site de auditoría (insertAuditLog/insertSystemAuditLog) las puebla
// nunca (dead en el sentido de código de aplicación, no de schema). Se deja
// la entrada igual, EXPLÍCITA: si algún día se dropean de un lado sin el
// otro, este test debe seguir siendo la fuente de verdad; el drop en sí es
// un contract change (cualquier lector externo de audit_logs las vería
// desaparecer) y queda en backlog — NO se toca en esta tarea.
const KNOWN_DEAD_BUT_NOT_DRIFTED_COLUMNS = new Set<string>([
  'audit_logs.before_state',
  'audit_logs.after_state',
])

// Tablas que la DB tiene (schema public) pero Drizzle NO debe conocer.
// Vacío tras verificar: los 27 exports de tabla en src/shared/db/schema.ts
// matchean 1:1 con las 27 BASE TABLE de information_schema.tables
// (table_schema='public') — ver evidencia en el reporte de esta tarea.
const DB_ONLY_TABLES_ALLOWLIST = new Set<string>([])

// Columnas DB-only NO documentadas arriba que este test encuentre en el
// futuro se agregan acá con el prefijo pedido por el contrato, citando el
// hallazgo — hoy vacío salvo la entrada de audit_logs (que técnicamente no
// dispara falla, ver comentario arriba).
const KNOWN_DB_ONLY_COLUMNS = new Set<string>([...KNOWN_DEAD_BUT_NOT_DRIFTED_COLUMNS])

// ─── Mapeo de tipo base (elemento de array) → udt_name de Postgres ─────
// Solo los tipos base que el schema usa hoy dentro de `.array()`
// (courts.photos, tenants.closed_dates/court_surfaces/court_formats).
const ARRAY_BASE_TO_UDT: Record<string, string> = {
  text: 'text',
  date: 'date',
  integer: 'int4',
  smallint: 'int2',
  bigint: 'int8',
  boolean: 'bool',
  uuid: 'uuid',
  numeric: 'numeric',
  jsonb: 'jsonb',
  // ENUMs usados como array. El `udt_name` de un array de ENUM es `_<nombre del
  // tipo>`, igual que el de los tipos base — sin esta entrada, cualquier columna
  // `player_tag[]` se reporta como "tipo base sin mapear" (que es exactamente
  // cómo este test avisó de la migr. 074).
  player_tag: 'player_tag',
}

/**
 * Guard con parámetro anotado explícitamente `[string, unknown]` (no inferido
 * del contexto de `.filter`): así la verificación de "el tipo del predicate es
 * asignable al tipo del parámetro" corre contra ESTA firma, no contra la unión
 * gigantesca de tipos literales que `typeof schema` produce (cada tabla tiene
 * un `name` literal distinto) — evita TS2677.
 */
function isTableEntry(entry: [string, unknown]): entry is [string, PgTable] {
  return is(entry[1], PgTable)
}

/**
 * Compara el tipo SQL de una columna Drizzle contra su fila de
 * information_schema.columns. Devuelve `null` si coincide, o un mensaje
 * legible con la diferencia si no.
 */
function checkColumnType(col: PgColumn, dbCol: DbColumn): string | null {
  const sqlType = col.getSQLType()

  if (is(col, PgEnumColumn) || is(col, PgEnumObjectColumn)) {
    if (dbCol.data_type !== 'USER-DEFINED' || dbCol.udt_name !== sqlType) {
      return `esperado enum '${sqlType}' (data_type=USER-DEFINED, udt_name=${sqlType}), DB tiene data_type=${dbCol.data_type} udt_name=${dbCol.udt_name}`
    }
    return null
  }

  if (is(col, PgArray)) {
    const baseSqlType = col.baseColumn.getSQLType()
    const baseUdt = ARRAY_BASE_TO_UDT[baseSqlType]
    if (!baseUdt) {
      return `tipo base de array sin mapear: '${baseSqlType}' — agregar a ARRAY_BASE_TO_UDT en este test`
    }
    const expectedUdt = `_${baseUdt}`
    if (dbCol.data_type !== 'ARRAY' || dbCol.udt_name !== expectedUdt) {
      return `esperado array de ${baseSqlType} (data_type=ARRAY, udt_name=${expectedUdt}), DB tiene data_type=${dbCol.data_type} udt_name=${dbCol.udt_name}`
    }
    return null
  }

  const numericMatch = /^numeric\((\d+),\s*(\d+)\)$/.exec(sqlType)
  if (numericMatch) {
    const precision = Number(numericMatch[1])
    const scale = Number(numericMatch[2])
    if (
      dbCol.data_type !== 'numeric' ||
      dbCol.numeric_precision !== precision ||
      dbCol.numeric_scale !== scale
    ) {
      return `esperado numeric(${precision},${scale}), DB tiene data_type=${dbCol.data_type} precision=${dbCol.numeric_precision} scale=${dbCol.numeric_scale}`
    }
    return null
  }
  if (sqlType === 'numeric') {
    if (dbCol.data_type !== 'numeric') {
      return `esperado numeric, DB tiene data_type=${dbCol.data_type}`
    }
    return null
  }

  // Drizzle no agrega " without time zone" a `time` sin withTimezone.
  if (sqlType === 'time') {
    if (dbCol.data_type !== 'time without time zone') {
      return `esperado 'time without time zone', DB tiene data_type=${dbCol.data_type}`
    }
    return null
  }

  // Resto: comparación directa contra data_type (uuid, text, integer,
  // smallint, boolean, date, jsonb, 'timestamp with time zone').
  if (dbCol.data_type !== sqlType) {
    return `esperado data_type='${sqlType}', DB tiene data_type='${dbCol.data_type}'`
  }
  return null
}

describe('D5 #6 — schema drift Drizzle vs DB migrada', () => {
  let dbTableNames: Set<string>
  let dbColumnsByTable: Map<string, DbColumn[]>
  let dbEnumsByName: Map<string, string[]>

  beforeAll(async () => {
    const sql = getSql()

    const tableRows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    dbTableNames = new Set(tableRows.map((r) => r.table_name))

    const columnRows = await sql<(DbColumn & { table_name: string })[]>`
      SELECT table_name, column_name, data_type, udt_name, is_nullable,
             numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `
    dbColumnsByTable = new Map()
    for (const row of columnRows) {
      const list = dbColumnsByTable.get(row.table_name) ?? []
      list.push(row)
      dbColumnsByTable.set(row.table_name, list)
    }

    const enumRows = await sql<{ typname: string; enumlabel: string }[]>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `
    dbEnumsByName = new Map()
    for (const row of enumRows) {
      const list = dbEnumsByName.get(row.typname) ?? []
      list.push(row.enumlabel)
      dbEnumsByName.set(row.typname, list)
    }
  }, 30_000)

  afterAll(async () => {
    await closeSql()
  })

  // Todo export de src/shared/db/schema.ts que sea una PgTable (el barrel
  // también reexporta los enums desde enums.ts — se filtran acá).
  const drizzleTables = (Object.entries(schema) as [string, unknown][]).filter(isTableEntry)

  // ─── 1. Tablas ────────────────────────────────────────────────────
  describe('1. tablas', () => {
    it('toda tabla Drizzle existe en la DB (schema public)', () => {
      const missing = drizzleTables
        .map(([exportName, table]) => ({ exportName, name: getTableConfig(table).name }))
        .filter(({ name }) => !dbTableNames.has(name))
        .map(
          ({ exportName, name }) =>
            `${exportName} (tabla '${name}') declarada en Drizzle, ausente en la DB`,
        )
      expect(missing).toEqual([])
    })

    it('toda tabla DB (schema public) está declarada en Drizzle', () => {
      const drizzleTableNames = new Set(drizzleTables.map(([, t]) => getTableConfig(t).name))
      const extra = [...dbTableNames]
        .filter((name) => !drizzleTableNames.has(name) && !DB_ONLY_TABLES_ALLOWLIST.has(name))
        .map((name) => `'${name}' existe en la DB, ausente en Drizzle (drift no documentado)`)
      expect(extra).toEqual([])
    })
  })

  // ─── 2. Columnas por tabla ──────────────────────────────────────────
  describe('2. columnas por tabla', () => {
    for (const [, table] of drizzleTables) {
      const { name: tableName, columns } = getTableConfig(table)

      it(`${tableName}: columnas coinciden (nombre + tipo + nullability)`, () => {
        const dbCols = dbColumnsByTable.get(tableName) ?? []
        const dbColsByName = new Map(dbCols.map((c) => [c.column_name, c]))
        const drizzleColNames = new Set(columns.map((c) => c.name))

        const issues: string[] = []

        for (const col of columns) {
          const dbCol = dbColsByName.get(col.name)
          if (!dbCol) {
            issues.push(`${tableName}.${col.name}: existe en Drizzle, ausente en la DB`)
            continue
          }

          const drizzleNotNull = col.notNull
          const dbNotNull = dbCol.is_nullable === 'NO'
          if (drizzleNotNull !== dbNotNull) {
            issues.push(
              `${tableName}.${col.name}: nullability difiere (Drizzle notNull=${drizzleNotNull}, DB is_nullable=${dbCol.is_nullable})`,
            )
          }

          const typeIssue = checkColumnType(col, dbCol)
          if (typeIssue) {
            issues.push(`${tableName}.${col.name}: ${typeIssue}`)
          }
        }

        for (const dbCol of dbCols) {
          if (drizzleColNames.has(dbCol.column_name)) continue
          const key = `${tableName}.${dbCol.column_name}`
          if (KNOWN_DB_ONLY_COLUMNS.has(key)) continue
          issues.push(`${key}: existe en la DB, ausente en Drizzle (drift no documentado)`)
        }

        expect(issues).toEqual([])
      })
    }
  })

  // ─── 3. Enums ───────────────────────────────────────────────────────
  describe('3. enums', () => {
    const drizzleEnums = (Object.values(schema) as unknown[]).filter(isPgEnum)

    for (const en of drizzleEnums) {
      it(`enum ${en.enumName}: labels coinciden con pg_enum`, () => {
        const dbLabels = dbEnumsByName.get(en.enumName)
        expect(
          dbLabels,
          `enum '${en.enumName}' no existe en la DB (pg_enum, schema public)`,
        ).toBeDefined()
        expect([...en.enumValues]).toEqual(dbLabels)
      })
    }

    it('todo enum DB (schema public) está declarado en Drizzle', () => {
      const drizzleEnumNames = new Set(drizzleEnums.map((e) => e.enumName))
      const extra = [...dbEnumsByName.keys()]
        .filter((name) => !drizzleEnumNames.has(name))
        .map((name) => `'${name}' existe en pg_enum, ausente en Drizzle (drift no documentado)`)
      expect(extra).toEqual([])
    })
  })

  // ─── 4. Invariante D3-H1: índices de expresión + RLS + no-leakproof ──
  describe('4. invariante D3-H1: índice de expresión inusable bajo RLS', () => {
    it('CERO índices de expresión sobre tablas RLS que llamen una función no-leakproof', async () => {
      const sql = getSql()

      // indexprs IS NOT NULL: índice cuya lista de columnas indexadas
      // contiene al menos una EXPRESIÓN (no solo columnas planas).
      // relrowsecurity: solo tablas con RLS habilitada — la clase D3-H1 es
      // específicamente que Postgres se niega a empujar un qual no-leakproof
      // bajo la barrera de seguridad de las policies, así que el índice
      // queda inusable para el planner (Seq Scan silencioso).
      // NOT indisexclusion: excluye los índices GIST que respaldan EXCLUDE
      // constraints (no_overlapping_bookings/no_overlapping_abonados, que sí
      // usan tsrange()/tstzrange() — no-leakproof por catálogo). La
      // restricción leakproof-bajo-RLS aplica a queries del planner
      // (SELECT/UPDATE/DELETE con quals evaluados bajo la security barrier);
      // el chequeo de una EXCLUDE constraint corre vía un index probe interno
      // del executor al insertar/actualizar (check_exclusion_constraint), no
      // pasa por el pipeline de rewriter+planner con RLS — no es la misma
      // clase de bug que timezone() en un índice pensado para acelerar un
      // WHERE (idx_cash_flows_tenant_day_art / idx_stock_movements_tenant_day_art,
      // dropeados en 054 justamente por esto).
      const candidates = await sql<{ table_name: string; index_name: string; expr: string }[]>`
        SELECT c.relname AS table_name, ic.relname AS index_name,
               pg_get_expr(ix.indexprs, ix.indrelid) AS expr
        FROM pg_index ix
        JOIN pg_class c ON c.oid = ix.indrelid
        JOIN pg_class ic ON ic.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE ix.indexprs IS NOT NULL
          AND n.nspname = 'public'
          AND c.relrowsecurity
          AND NOT ix.indisexclusion
      `

      const offenders: string[] = []
      for (const row of candidates) {
        const fnNames = [...row.expr.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)].map((m) => m[1]!)
        if (fnNames.length === 0) continue

        const leaky = await sql<{ proname: string }[]>`
          SELECT DISTINCT proname FROM pg_proc
          WHERE proname = ANY(${fnNames}) AND proleakproof = false
        `
        if (leaky.length > 0) {
          offenders.push(
            `${row.table_name}.${row.index_name}: expr="${row.expr}" usa función(es) no-leakproof [${leaky.map((l) => l.proname).join(', ')}] — inusable bajo RLS (D3-H1)`,
          )
        }
      }

      expect(offenders).toEqual([])
    })
  })

  // ─── 5. Índices declarados en Drizzle que no existen en la DB ────────
  describe('5. índices', () => {
    it('todo índice declarado en Drizzle existe en la DB', async () => {
      const sql = getSql()
      const rows = await sql<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      `
      const dbIndexNames = new Set(rows.map((r) => r.indexname))

      const missing: string[] = []
      for (const [, table] of drizzleTables) {
        const { name: tableName, indexes } = getTableConfig(table)
        for (const idx of indexes) {
          const name = idx.config.name
          if (!name || dbIndexNames.has(name)) continue
          missing.push(`${tableName}: índice '${name}' declarado en Drizzle, ausente en la DB`)
        }
      }

      expect(missing).toEqual([])
    })

    // La dirección inversa (índice en la DB ausente en Drizzle) NO se valida, y
    // es deliberado: las migraciones SQL a mano son la fuente de verdad de este
    // repo (drizzle.config.ts, `db:push`/`db:generate` denegados), y muchas
    // crean cosas que Drizzle no modela — las EXCLUDE constraints GiST
    // (`no_overlapping_bookings`), los índices parciales con predicado sobre
    // enums, y los UNIQUE inline que Drizzle sí declara pero con otra sintaxis
    // (`.unique()` en la columna, que no aparece como índice en
    // `getTableConfig`). Exigirlo obligaría a una allowlist de ~28 entradas que
    // se pudre sola. Lo que importa —y lo que efectivamente se rompió— es la
    // dirección de arriba: que el schema no declare índices que no existen.
  })
})
