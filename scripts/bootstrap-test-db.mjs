// Bootstrap a local Postgres for integration tests.
// Creates required roles, then runs migrations 001..009 from src/shared/db/migrations.
// Mirrors the CI workflow.
import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
const MIGRATIONS_DIR = 'src/shared/db/migrations'

async function main() {
  const sql = postgres(URL, { max: 1, prepare: false, onnotice: () => {} })

  console.log('>>> creating roles')
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_app') THEN
        CREATE ROLE turnogol_app NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END $$;
  `)

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sqlText = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    console.log(`>>> applying ${file}`)
    await sql.unsafe(sqlText)
  }

  await sql.end()
  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
