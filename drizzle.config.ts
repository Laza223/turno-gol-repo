import type { Config } from 'drizzle-kit'

// drizzle-kit 0.31: la sintaxis legacy de 0.20 (`driver: 'pg'` +
// `dbCredentials.connectionString`, y los subcomandos `push:pg` / `generate:pg`)
// se removió. Ahora es `dialect` + `dbCredentials.url`, y los subcomandos son
// `push` / `generate` a secas.
//
// Ojo: las migraciones REALES del proyecto son los `0*.sql` escritos a mano en
// src/shared/db/migrations (001–042: incluyen RLS, triggers y grants que
// drizzle-kit no genera). Este config existe para `db:studio`/`db:generate`;
// `db:push` y `db:migrate` están DENEGADOS en .claude/settings.json a propósito.
export default {
  schema: './src/shared/db/schema',
  out: './src/shared/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
