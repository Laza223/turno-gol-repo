import type { Config } from 'drizzle-kit'

export default {
  schema: './src/shared/db/schema',
  out: './src/shared/db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config
