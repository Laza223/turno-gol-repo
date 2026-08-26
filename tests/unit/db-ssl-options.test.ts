import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dbSslOptions, pgConnectionConfig } from '@/shared/db/ssl'

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

/**
 * Segunda parte del mismo incidente, encontrada el 2026-08-26 auditando C-2.
 *
 * `dbSslOptions` arregló los DOS pools de porsager, pero pg-boss no usa
 * porsager: usa `pg` (node-postgres), y ahí la precedencia va al revés —
 * `new ConnectionParameters(config)` hace
 * `Object.assign({}, config, parse(config.connectionString))`, o sea que el DSN
 * PISA la opción explícita. Consecuencia medida con `pg@8.22.0`:
 *
 *   DSN sin sslmode + sin ssl explícito -> ssl: false  =  TEXTO PLANO
 *
 * Y el DSN que Supabase entrega para copiar y pegar **no trae `sslmode`**. O
 * sea que la conexión de pg-boss podía estar cruzando internet sin cifrar
 * contra la base de producción, exactamente el canal que C-2 dice que el
 * pooler acepta en claro.
 */
describe('pgConnectionConfig (el lado de pg-boss)', () => {
  const REMOTE = 'postgres://u:p@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'

  it('le saca el sslmode al DSN, que es lo único que vuelve determinista a pg', () => {
    for (const mode of ['no-verify', 'require', 'verify-full', 'disable', 'prefer']) {
      const cfg = pgConnectionConfig(`${REMOTE}?sslmode=${mode}`)
      expect(cfg.connectionString).toBe(REMOTE)
      expect(cfg.ssl).toEqual({ rejectUnauthorized: false })
    }
  })

  it('conserva los demás parámetros del DSN', () => {
    const cfg = pgConnectionConfig(`${REMOTE}?application_name=turnogol&sslmode=require&x=1`)
    expect(cfg.connectionString).toBe(`${REMOTE}?application_name=turnogol&x=1`)
  })

  it('no le agrega un ? a un DSN que no lo tenía', () => {
    expect(pgConnectionConfig(REMOTE).connectionString).toBe(REMOTE)
  })

  it('no toca usuario, contraseña ni host', () => {
    // Un round-trip por `new URL(...).toString()` re-codifica la contraseña y
    // rompe la conexión. Por eso el recorte es sobre el string, no sobre la URL.
    const raro =
      'postgres://us.er:p%40ss%3Aw%2Frd@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
    expect(pgConnectionConfig(`${raro}?sslmode=require`).connectionString).toBe(raro)
  })

  it('no negocia TLS contra Supabase local', () => {
    const local = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
    expect(pgConnectionConfig(local)).toEqual({ connectionString: local, ssl: false })
  })
})

/**
 * El lock de verdad: no comprueba lo que NOSOTROS creemos que hace `pg`, sino
 * lo que `pg` hace. Si una versión futura cambia la precedencia, o si pg-boss
 * deja de usar node-postgres, este test se entera — y las dos cosas invalidan
 * el razonamiento entero de `pgConnectionConfig`.
 */
describe('pg de verdad, no nuestra idea de pg', () => {
  const require_ = createRequire(import.meta.url)
  const resolvePg = (): string => {
    try {
      return require_.resolve('pg/lib/connection-parameters.js')
    } catch {
      return require_.resolve('pg/lib/connection-parameters.js', {
        paths: [require_.resolve('pg-boss')],
      })
    }
  }

  it('con nuestra config negocia TLS; con el DSN pelado, no', () => {
    const ConnectionParameters = require_(resolvePg()) as new (c: unknown) => { ssl: unknown }
    const dsn = 'postgres://u:p@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'

    // Lo que hacía boss.ts antes: DSN sin sslmode y nada más.
    expect(new ConnectionParameters({ connectionString: dsn }).ssl).toBe(false)

    // Lo que hace ahora.
    expect(new ConnectionParameters(pgConnectionConfig(dsn)).ssl).toEqual({
      rejectUnauthorized: false,
    })

    // Y el caso que tiraba abajo al worker: `require` deja de poder pisarnos.
    expect(new ConnectionParameters(pgConnectionConfig(`${dsn}?sslmode=require`)).ssl).toEqual({
      rejectUnauthorized: false,
    })
  })
})

describe('pg-boss no puede volver a armar la conexión a mano', () => {
  const source = readFileSync(join(process.cwd(), 'src/shared/jobs/boss.ts'), 'utf8')

  it('el DSN entra por pgConnectionConfig y no como connectionString pelado', () => {
    expect(source).toContain('...pgConnectionConfig(url)')
    expect(source).not.toMatch(/connectionString:\s*url/)
  })
})
