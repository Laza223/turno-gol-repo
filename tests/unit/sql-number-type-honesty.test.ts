import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Candado estático (B8): `sql<number>` no puede mentir sobre lo que devuelve
 * el driver.
 *
 * postgres-js parsea a JS number SOLO los oids `[21, 23, 26, 700, 701]` —
 * int2, int4, oid, float4, float8 (`node_modules/postgres/src/types.js`). Todo
 * lo demás llega como **string**, e int8/bigint y numeric están en ese "todo lo
 * demás". Y en Postgres:
 *
 *   COUNT(*)        -> bigint
 *   SUM(integer)    -> bigint
 *   SUM(bigint)     -> numeric
 *   AVG(cualquiera) -> numeric
 *
 * Los dos pools (`src/shared/db/client.ts`) se crean sin opción `types`, así
 * que el default aplica. Un `sql<number>` sobre un agregado sin castear le
 * dice a TypeScript "esto es un número" cuando en runtime es un string, y TS
 * deja de avisar: `total + otro` concatena en silencio ("100" + 50 = "10050")
 * y `a > b` compara alfabéticamente ("9" > "100" es true).
 *
 * Hoy el repo está limpio, pero lo está **por convención**: cada sitio se
 * acordó de poner `::int` o de envolver en `Number()`. Este test es lo que
 * convierte esa convención en una regla — sin él, el próximo `SUM()` sin
 * castear entra sin que nadie lo note.
 *
 * ALCANCE, explícito: cubre `sql<number>`, que es la forma en que Drizzle
 * declara el tipo pegado al SQL y por lo tanto la única verificable leyendo una
 * sola expresión. NO cubre `tx.execute<{x: number}>(...)` ni
 * `as unknown as Array<{x: number}>`: ahí el tipo y el SQL están separados y
 * decidir estáticamente cuál columna corresponde a cuál campo da falsos
 * positivos — y un candado con falsos positivos termina desactivado. Para esos
 * la barrera sigue siendo la revisión.
 */

function findFiles(root: string, regex: RegExp, acc: string[] = []): string[] {
  if (!existsSync(root)) return acc
  for (const entry of readdirSync(root)) {
    const p = path.join(root, entry)
    const s = statSync(p)
    if (s.isDirectory()) findFiles(p, regex, acc)
    else if (regex.test(entry)) acc.push(p)
  }
  return acc
}

const ROOT = path.resolve(__dirname, '..', '..')
const rel = (f: string): string => path.relative(ROOT, f).replace(/\\/g, '/')

/** Agregados cuyo tipo de retorno en Postgres NO es int4. */
const RETURNS_NON_INT4 = /\b(COUNT|SUM|AVG)\s*\(|\bAS\s+(BIGINT|NUMERIC|DECIMAL)\b|::\s*(bigint|numeric|decimal)\b/i

/** Casts que SÍ dejan al driver devolver un number de verdad. */
const SAFE_CAST = /::\s*(int|int2|int4|integer|smallint|float|float4|float8|real|double precision)\b|\bAS\s+(INT|INT2|INT4|INTEGER|SMALLINT|REAL|DOUBLE PRECISION)\b/i

/**
 * Extrae el cuerpo de cada `sql<number>\`...\`` de un archivo. El template
 * puede tener interpolaciones `${...}` con backticks adentro? No en este repo
 * — se corta en el primer backtick de cierre, que alcanza para el chequeo.
 */
function extractSqlNumberBodies(src: string): Array<{ body: string; line: number }> {
  const out: Array<{ body: string; line: number }> = []
  const marker = 'sql<number>`'
  let idx = src.indexOf(marker)
  while (idx !== -1) {
    const start = idx + marker.length
    const end = src.indexOf('`', start)
    if (end === -1) break
    out.push({
      body: src.slice(start, end),
      line: src.slice(0, idx).split('\n').length,
    })
    idx = src.indexOf(marker, end)
  }
  return out
}

const SOURCE_FILES = findFiles(path.join(ROOT, 'src'), /\.tsx?$/).filter(
  (f) => !/\.(test|stories)\.tsx?$/.test(f),
)

type Offender = { where: string; body: string }

const offenders: Offender[] = []
let checked = 0

for (const file of SOURCE_FILES) {
  const src = readFileSync(file, 'utf8')
  if (!src.includes('sql<number>`')) continue
  for (const { body, line } of extractSqlNumberBodies(src)) {
    checked++
    if (RETURNS_NON_INT4.test(body) && !SAFE_CAST.test(body)) {
      offenders.push({ where: `${rel(file)}:${line}`, body: body.replace(/\s+/g, ' ').trim() })
    }
  }
}

describe('sql<number> no puede mentir sobre el tipo que devuelve el driver', () => {
  it('encuentra un conjunto real de expresiones para revisar', () => {
    // Si esto baja a 0, el extractor se rompió y el candado dejó de mirar nada.
    expect(checked).toBeGreaterThan(5)
  })

  it('ningún sql<number> envuelve un agregado bigint/numeric sin castear', () => {
    const detail = offenders
      .map(
        (o) =>
          `\n  ${o.where}\n    ${o.body}\n    -> devuelve bigint/numeric, que postgres-js entrega como STRING.` +
          `\n       Arreglo: agregá "::int" si el valor entra en int4, o declaralo "sql<string>"` +
          `\n       y convertí con Number() en el consumidor (los centavos de ARS pasan de int4` +
          `\n       arriba de ~$21M, así que ahí el casteo correcto es sql<string>).`,
      )
      .join('')
    expect(offenders, `sql<number> sobre agregados sin castear:${detail}`).toEqual([])
  })
})
