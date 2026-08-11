import { promises as fs } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

/**
 * Shared utilities for the QA Happy-Paths run. NOT a spec (no `.spec.ts`), so the
 * runner does not collect it. Two jobs:
 *   1) writeEvidence(): dump the DB row(s) + notes a case relied on to a JSON file,
 *      so the ledger and the adversarial verifiers can inspect the exact state.
 *   2) getSql(): a raw superuser SQL client for prerequisite seeding + verification
 *      queries the service-role client can't do (RLS-forced tables, backdating,
 *      arbitrary SQL). Points at local Supabase (127.0.0.1:54322).
 */

const QA_EVIDENCE_DIR = path.resolve('test-results/qa/evidence')

const SUPERUSER_DSN = process.env.DBQ_DSN ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

/** A short-lived superuser SQL client. Caller must `await sql.end()`. */
export function getSql() {
  return postgres(SUPERUSER_DSN, { max: 1, prepare: false, onnotice: () => {} })
}

/**
 * Run a one-off SQL statement/query and close the client. Returns the rows.
 * Use for prereq seeding, backdating, and DB assertions inside specs.
 */
export async function runSql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const sql = getSql()
  try {
    const rows = params.length
      ? await sql.unsafe(query, params as never[])
      : await sql.unsafe(query)
    return rows as unknown as T[]
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// Lazy, never-connected client dedicated a envolver params JSONB (postgres.js
// `sql.json(value)` es la única forma correcta de bindear un objeto/array como
// jsonb: pasar `JSON.stringify(value)` como texto + castear `::jsonb` en la
// query lo DOBLE-CODIFICA — postgres.js serializa el string de vuelta a JSON
// antes de enviarlo, así que Postgres recibe un jsonb *string* (todo el array
// escapado adentro de un `"..."`) en vez de un array/objeto real. Confirmado a
// mano contra Postgres local: `jsonb_typeof(...)` da 'string', no 'array'.
// El wrapper que devuelve `.json()` (una instancia de `Parameter`) es un
// value-object plano, no atado a la conexión — funciona igual pasado a
// `runSql()`, que abre SU PROPIO cliente por llamada.
let jsonParamClient: postgres.Sql | null = null
export function jsonParam(value: unknown): postgres.Parameter {
  jsonParamClient ??= postgres(SUPERUSER_DSN, { max: 1, prepare: false, onnotice: () => {} })
  return jsonParamClient.json(value as postgres.JSONValue)
}

/** Persist evidence for a case to test-results/qa/evidence/<caseId>.json. */
export async function writeEvidence(caseId: string, data: unknown): Promise<void> {
  await fs.mkdir(QA_EVIDENCE_DIR, { recursive: true })
  const payload = {
    caseId,
    capturedAt: new Date().toISOString(),
    data,
  }
  await fs.writeFile(
    path.join(QA_EVIDENCE_DIR, `${caseId}.json`),
    JSON.stringify(payload, null, 2),
    'utf-8',
  )
}
