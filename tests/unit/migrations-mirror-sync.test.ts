import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Candado anti-drift entre los DOS árboles de migraciones (fase D7).
 *
 * `src/shared/db/migrations/NNN_nombre.sql` es la fuente de verdad (la que
 * aplica el CI a su Postgres efímero). `supabase/migrations/<ts>_nombre.sql`
 * es el espejo que consumen `supabase db reset` (schema local) y
 * `supabase db push` (el deploy a producción, workflow `db-migrate.yml`).
 *
 * Si el espejo se desincroniza, pasan dos cosas silenciosas:
 *   1. `supabase db reset` deja el schema local distinto de producción — el
 *      caso real de la migr. 061, que estuvo sin espejo hasta 2026-07-26 y
 *      nadie lo notó porque nada lo verificaba.
 *   2. El deploy a prod SALTEA esa migración: `db push` solo mira el espejo.
 *      Es decir, el drift del espejo se convierte en drift de producción.
 *
 * `pnpm db:sync-supabase` regenera el espejo entero; está deny-listeado en
 * `.claude/settings.json`, así que un agente copia el archivo a mano — razón
 * de más para que exista este test.
 */

const SOURCE_DIR = join(process.cwd(), 'src/shared/db/migrations')
const MIRROR_DIR = join(process.cwd(), 'supabase/migrations')
const TIMESTAMP_BASE = '20260424' // debe coincidir con scripts/sync-supabase-migrations.mjs

type Migration = { file: string; seq: string; name: string }

function readSource(): Migration[] {
  return readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
    .sort()
    .map((file) => ({ file, seq: file.slice(0, 3), name: file.slice(4, -4) }))
}

function readMirror(): Migration[] {
  return readdirSync(MIRROR_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const [, ts, name] = file.match(/^(\d{14})_(.+)\.sql$/) ?? []
      return { file, seq: ts?.slice(-3) ?? '', name: name ?? '' }
    })
}

describe('migraciones: el espejo de supabase/ está sincronizado (D7)', () => {
  const source = readSource()
  const mirror = readMirror()

  it('hay exactamente un espejo por cada migración canónica', () => {
    const sourceNames = source.map((m) => `${m.seq}_${m.name}`)
    const mirrorNames = mirror.map((m) => `${m.seq}_${m.name}`)

    const faltantes = sourceNames.filter((n) => !mirrorNames.includes(n))
    const sobrantes = mirrorNames.filter((n) => !sourceNames.includes(n))

    expect(
      faltantes,
      `Sin espejo en supabase/migrations/ (el deploy a prod las SALTEA): ${faltantes.join(', ')}. ` +
        'Corré `pnpm db:sync-supabase` o copiá el archivo con el nombre ' +
        `${TIMESTAMP_BASE}<NNN con 6 dígitos>_<nombre>.sql`,
    ).toEqual([])

    expect(
      sobrantes,
      `Espejos huérfanos (sin canónica en src/shared/db/migrations/): ${sobrantes.join(', ')}`,
    ).toEqual([])
  })

  it('el nombre del espejo respeta la convención <base><seq 6 dígitos>_<nombre>', () => {
    const malFormados = mirror
      .filter((m) => {
        const expected = `${TIMESTAMP_BASE}${m.seq.padStart(6, '0')}_${m.name}.sql`
        return m.file !== expected
      })
      .map((m) => m.file)

    expect(
      malFormados,
      `Nombre fuera de convención (db push ordena por timestamp): ${malFormados.join(', ')}`,
    ).toEqual([])
  })

  it('el contenido del espejo es idéntico al de la migración canónica', () => {
    const divergentes: string[] = []

    for (const src of source) {
      const twin = mirror.find((m) => m.seq === src.seq && m.name === src.name)
      if (!twin) continue // ya lo reporta el primer test
      const a = readFileSync(join(SOURCE_DIR, src.file), 'utf8')
      const b = readFileSync(join(MIRROR_DIR, twin.file), 'utf8')
      if (a !== b) divergentes.push(`${src.file} ≠ ${twin.file}`)
    }

    expect(
      divergentes,
      `Espejo con contenido distinto a la canónica — prod recibiría un SQL que nadie revisó: ${divergentes.join(', ')}`,
    ).toEqual([])
  })

  it('la numeración canónica no tiene huecos ni duplicados', () => {
    const seqs = source.map((m) => Number(m.seq))
    const duplicados = seqs.filter((n, i) => seqs.indexOf(n) !== i)
    const huecos: number[] = []
    for (let i = 1; i < seqs.length; i++) {
      if (seqs[i] !== seqs[i - 1] + 1) huecos.push(seqs[i - 1] + 1)
    }

    expect(duplicados, `Números de migración duplicados: ${duplicados.join(', ')}`).toEqual([])
    expect(
      huecos,
      `Huecos en la numeración (una migración renumerada a mano deja el orden ambiguo): ${huecos.join(', ')}`,
    ).toEqual([])
  })
})
