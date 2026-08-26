import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dbSslOptions } from '@/shared/db/ssl'

/**
 * Candado del incidente del 2026-08-25: el worker de Railway corría con
 * `DATABASE_URL=...?sslmode=no-verify` (necesario para que arranque pg-boss,
 * que usa node-postgres) y eso hacía que el pool de la app —porsager, que no
 * entiende `no-verify`— muriera con "self-signed certificate in certificate
 * chain" en CADA `withTenantContext`. El proceso seguía vivo, el latido seguía
 * llegando, y los crons de plata fallaban en silencio.
 *
 * Lo que estos tests protegen no es el valor: es que la decisión viva en el
 * código y no en un query param editable desde un panel.
 */
describe('dbSslOptions', () => {
  it('no negocia TLS contra Supabase local', () => {
    expect(dbSslOptions('postgres://postgres:postgres@127.0.0.1:54322/postgres')).toBe(false)
    expect(dbSslOptions('postgres://postgres:postgres@localhost:54322/postgres')).toBe(false)
  })

  it('cifra contra un host remoto', () => {
    expect(
      dbSslOptions('postgres://u:p@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'),
    ).toEqual({ rejectUnauthorized: false })
  })

  it('ignora el sslmode del DSN, que es justo lo que rompía producción', () => {
    const base = 'postgres://u:p@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
    for (const mode of ['no-verify', 'require', 'verify-full', 'disable', 'prefer']) {
      expect(dbSslOptions(`${base}?sslmode=${mode}`)).toEqual({ rejectUnauthorized: false })
    }
  })

  it('ante un DSN ilegible no inventa TLS', () => {
    expect(dbSslOptions('esto no es una url')).toBe(false)
  })
})

describe('los pools de client.ts fijan ssl explícitamente', () => {
  const source = readFileSync(join(process.cwd(), 'src/shared/db/client.ts'), 'utf8')

  it('cada llamada a postgres() pasa ssl: dbSslOptions(url)', () => {
    const calls = source.match(/postgres\(url, \{/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(source.match(/ssl: dbSslOptions\(url\)/g) ?? []).toHaveLength(calls.length)
  })
})
