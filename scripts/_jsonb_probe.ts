/**
 * Probe de jsonb contra Postgres REAL.
 *
 * Verifica que una columna jsonb quede como OBJETO at-rest (no como un string
 * JSON doble-codificado) por los DOS caminos que comparten la misma instancia de
 * postgres-js: el query-builder de drizzle y el SQL crudo (`sql.json`).
 *
 * Existe porque las lecturas vía drizzle ENMASCARAN el bug (fromDriver hace
 * JSON.parse), así que un test que escribe y lee con drizzle pasa igual estando
 * roto. La pregunta hay que hacérsela a Postgres con jsonb_typeof().
 *
 * Regresión que cubre: drizzle 0.45 pisa los serializers de json/jsonb del
 * cliente postgres-js con una identidad (ver restoreJsonSerializers en
 * src/shared/db/client.ts).
 *
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
 *     pnpm tsx scripts/_jsonb_probe.ts
 */
import { pgTable, serial } from 'drizzle-orm/pg-core'
import { getSql, getDb } from '../src/shared/db/client'
import { jsonb } from '../src/shared/db/jsonb'

const PAYLOAD = { slotsGenerated: 8, nested: { a: 'ok' } }

const probe = pgTable('_jsonb_probe', {
  id: serial('id').primaryKey(),
  meta: jsonb('meta').$type<typeof PAYLOAD>(),
})

async function main() {
  const sql = getSql()
  await sql`DROP TABLE IF EXISTS _jsonb_probe`
  await sql`CREATE TABLE _jsonb_probe (id serial primary key, meta jsonb)`

  // getDb() construye drizzle sobre la MISMA instancia y restaura los serializers.
  const db = getDb()

  // Camino 1: query-builder de drizzle.
  await db.insert(probe).values({ meta: PAYLOAD })
  // Camino 2: SQL crudo sobre la misma conexión.
  await sql`INSERT INTO _jsonb_probe (meta) VALUES (${sql.json(PAYLOAD)})`

  const rows = await sql<{ typeof: string; scalar: string; nested: string }[]>`
    SELECT jsonb_typeof(meta)      AS typeof,
           meta->>'slotsGenerated' AS scalar,
           meta->'nested'->>'a'    AS nested
    FROM _jsonb_probe ORDER BY id
  `

  const names = ['drizzle  ', 'sql crudo']
  let ok = true
  rows.forEach((r, i) => {
    const good = r.typeof === 'object' && r.scalar === '8' && r.nested === 'ok'
    ok &&= good
    console.log(
      `${names[i]}  jsonb_typeof=${r.typeof}  ->>'slotsGenerated'=${r.scalar}  ->'nested'->>'a'=${r.nested}  ${good ? '✅' : '❌'}`,
    )
  })
  if (rows.length !== 2) ok = false

  console.log(
    ok
      ? '\n✅ jsonb OK por los dos caminos: objeto at-rest, operadores SQL funcionan'
      : '\n❌ jsonb CORRUPTO (se esperaba jsonb_typeof=object en ambos)',
  )

  await sql`DROP TABLE _jsonb_probe`
  await sql.end()
  process.exit(ok ? 0 : 1)
}

void main()
