// scripts/sync-supabase-migrations.mjs
// Copia los SQL canónicos de src/shared/db/migrations/ a supabase/migrations/
// con prefijo timestamp para que `supabase db reset` los aplique en orden.
//
// Uso: pnpm db:sync-supabase
//
// Source of truth: src/shared/db/migrations/00{1..8}_*.sql
// Target:          supabase/migrations/202604240000{1..8}_*.sql

import { readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE_DIR = 'src/shared/db/migrations'
const TARGET_DIR = 'supabase/migrations'
const TIMESTAMP_BASE = '20260424'  // YYYYMMDD del lanzamiento del schema

async function main() {
  // 1) Limpiar copias previas en TARGET_DIR (no borra .gitkeep).
  const existing = await readdir(TARGET_DIR)
  for (const file of existing) {
    if (file.endsWith('.sql')) {
      await unlink(join(TARGET_DIR, file))
      console.log(`- removed ${file}`)
    }
  }

  // 2) Leer todos los .sql canónicos en orden.
  const sources = (await readdir(SOURCE_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (sources.length === 0) {
    console.error(`No .sql files found in ${SOURCE_DIR}`)
    process.exit(1)
  }

  // 3) Copiar cada uno con prefijo timestamp.
  // Formato Supabase: <timestamp>_<name>.sql donde timestamp = YYYYMMDDHHMMSS.
  for (const file of sources) {
    // file = "001_extensions.sql" → idx = "01"
    const idx = file.match(/^(\d{3})_/)?.[1]
    if (!idx) {
      console.warn(`Skipping ${file} (no NNN_ prefix)`)
      continue
    }
    const seq = idx.padStart(6, '0')  // "000001"
    const targetName = `${TIMESTAMP_BASE}${seq}_${file.slice(4)}`
    const content = await readFile(join(SOURCE_DIR, file), 'utf8')
    await writeFile(join(TARGET_DIR, targetName), content, 'utf8')
    console.log(`+ wrote ${targetName}`)
  }

  console.log(`\nSynced ${sources.length} migration(s) to ${TARGET_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
