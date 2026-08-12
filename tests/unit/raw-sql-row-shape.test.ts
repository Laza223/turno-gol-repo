import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Candado estático (B8): la forma de fila que se le promete a un `tx.execute()`
 * no puede contradecir lo que el driver devuelve.
 *
 * `tests/unit/sql-number-type-honesty.test.ts` (B8 parte 1) cubre `sql<number>`
 * y dejó escrito por qué NO cubre los casts de fila: emparejar campo con columna
 * estáticamente da falsos positivos, y un candado con falsos positivos termina
 * desactivado. Ese diagnóstico es correcto — al escanear el repo, la heurística
 * de emparejado se equivocó sola en cada `Promise.all` de dos queries.
 *
 * Pero hay DOS subclases que se deciden mirando el TIPO solo, sin abrir el SQL,
 * y por eso entran sin falsos positivos:
 *
 *  1. **`Date` en la fila de un `tx.execute`.** Ese camino nunca devuelve un
 *     Date: timestamptz y date llegan como string (tabla completa en
 *     `src/shared/db/client.ts`). No importa qué columna sea: si el tipo dice
 *     Date, miente. Y miente en la dirección cara — `x.getTime()` compila y da
 *     NaN, que fue el gotcha real del repo con los holds de seña.
 *
 *  2. **`typeof <tabla>.$inferSelect` sobre SQL crudo.** Ese tipo describe la
 *     salida del QUERY BUILDER: claves camelCase. El SQL crudo devuelve las
 *     claves como las nombra Postgres: snake_case. La intersección de campos
 *     útiles es la de nombres de una sola palabra; todo lo demás llega
 *     `undefined` con TypeScript en verde. Así estaba
 *     `autoCompleteOverdueBookings`, y el worker no lo notó porque solo usaba
 *     `.length`.
 *
 * Los dos son "siempre mal", no "sospechoso": por eso el test exige lista vacía
 * en vez de un umbral.
 */

function findFiles(root: string, regex: RegExp, acc: string[] = []): string[] {
  if (!existsSync(root)) return acc
  for (const entry of readdirSync(root)) {
    const p = path.join(root, entry)
    if (statSync(p).isDirectory()) findFiles(p, regex, acc)
    else if (regex.test(entry)) acc.push(p)
  }
  return acc
}

const ROOT = path.resolve(__dirname, '..', '..')
const rel = (f: string): string => path.relative(ROOT, f).replace(/\\/g, '/')

const SOURCE_FILES = findFiles(path.join(ROOT, 'src'), /\.tsx?$/).filter(
  (f) => !/\.(test|stories)\.tsx?$/.test(f),
)

type Site = { where: string; type: string }

/**
 * Cada anotación de fila cruda del archivo: lo que va después de
 * `as unknown as` o del genérico de `.execute<…>`. Se balancean `{}`/`<>` para
 * cortar donde el tipo termina de verdad y no en el primer salto de línea.
 */
function rowTypeAnnotations(src: string): Site[] {
  const out: Site[] = []
  const push = (idx: number, from: number): void => {
    let depth = 0
    let started = false
    for (let j = from; j < src.length; j++) {
      const c = src[j]!
      if (c === '{' || c === '<' || c === '(') {
        depth++
        started = true
      } else if (c === '}' || c === '>' || c === ')') {
        depth--
        if (started && depth <= 0) {
          out.push({
            where: `${src.slice(0, idx).split('\n').length}`,
            type: src.slice(from, j + 1),
          })
          return
        }
        if (depth < 0) return
      } else if (c === '\n' && !started && src.slice(from, j).trim()) {
        out.push({ where: `${src.slice(0, idx).split('\n').length}`, type: src.slice(from, j) })
        return
      }
    }
  }
  for (const m of src.matchAll(/as unknown as\s*/g)) push(m.index, m.index + m[0].length)
  for (const m of src.matchAll(/\.execute\s*</g)) push(m.index, m.index + m[0].length - 1)
  return out
}

/** ¿El archivo lee la base con SQL crudo? Si no, sus casts no son de este candado. */
function usesRawSql(src: string): boolean {
  return /\.execute\s*[<(]/.test(src) || /\bgetSql\(\)|\bgetWorkerSql\(\)/.test(src)
}

const dateOffenders: Site[] = []
const inferSelectOffenders: Site[] = []
let inspected = 0

for (const file of SOURCE_FILES) {
  const src = readFileSync(file, 'utf8')
  if (!usesRawSql(src)) continue
  for (const site of rowTypeAnnotations(src)) {
    inspected++
    const where = `${rel(file)}:${site.where}`
    // `Date` como TIPO de un campo (`x: Date`), no `new Date(...)` ni `Date[]`
    // en una firma de función.
    if (/^\s*"?[A-Za-z_]\w*"?\??:\s*[^\n]*\bDate\b/m.test(site.type)) {
      dateOffenders.push({ where, type: site.type.replace(/\s+/g, ' ').trim().slice(0, 120) })
    }
    if (/\$inferSelect\b/.test(site.type)) {
      inferSelectOffenders.push({
        where,
        type: site.type.replace(/\s+/g, ' ').trim().slice(0, 120),
      })
    }
  }
}

const detail = (sites: Site[]): string => sites.map((s) => `\n  ${s.where}\n    ${s.type}`).join('')

describe('la fila prometida a tx.execute no puede contradecir al driver', () => {
  it('mira un conjunto real de anotaciones', () => {
    // Si esto cae a cero el extractor se rompió y el candado dejó de mirar nada
    // — el modo de falla peligroso es "verde porque no revisó", no "rojo".
    expect(inspected).toBeGreaterThan(50)
  })

  it('ningún campo de una fila cruda se declara Date', () => {
    expect(
      dateOffenders,
      `tx.execute nunca devuelve Date (timestamptz y date llegan string; ver la tabla en ` +
        `src/shared/db/client.ts). Declaralo string y envolvé en new Date(...) al mapear:` +
        detail(dateOffenders),
    ).toEqual([])
  })

  it('ninguna fila cruda se tipa con $inferSelect', () => {
    expect(
      inferSelectOffenders,
      `$inferSelect describe la salida del query builder (camelCase); el SQL crudo devuelve ` +
        `snake_case, así que los campos multi-palabra valen undefined. Escribí el tipo ` +
        `snake_case a mano, o pasá la query al query builder y quedate sin cast:` +
        detail(inferSelectOffenders),
    ).toEqual([])
  })
})
