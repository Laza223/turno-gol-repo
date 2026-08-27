/**
 * Sonda de TLS contra la base: ¿el canal a Postgres VALIDA la cadena de
 * certificados, o solo cifra sin comprobar contra quién?
 *
 * Por qué existe: `sslmode`/`rejectUnauthorized` se puede leer del código, pero
 * lo que importa es qué pasa en el cable contra el pooler real. Este repo ya se
 * comió dos incidentes de producción (2026-08-25 y 26) por asumir el
 * comportamiento de TLS de una librería en vez de medirlo, y por medirlo con la
 * librería equivocada.
 *
 * El truco para no necesitar ninguna credencial: la autenticación ocurre
 * DESPUÉS del handshake TLS. Con una contraseña deliberadamente inválida, la
 * respuesta del servidor separa las dos cosas sin ambigüedad:
 *
 *   error de certificado -> el TLS NO validó
 *   28P01 password auth  -> el TLS SÍ validó (llegó hasta pedir credenciales)
 *
 * Prueba las DOS librerías que este repo usa contra Postgres, porque tienen
 * semánticas de TLS distintas y por eso mismo ya rompieron producción:
 * `postgres` (porsager, los pools de la app) y `pg` (node-postgres, lo que usa
 * pg-boss por debajo).
 *
 * Las tres filas por librería importan JUNTAS. La tercera —sin CA— es el
 * CONTROL NEGATIVO: si esa también diera verde, significaría que la sonda no
 * sabe detectar un TLS que no valida, y entonces el verde de las otras dos no
 * probaría nada.
 *
 * Uso:
 *   pnpm tsx scripts/probe-db-tls.ts [host] [puerto...]
 *
 * Default: el pooler de producción en sus dos puertos (5432 sesión, 6543
 * transacción). No manda ninguna query ni toca ningún dato: el login falla a
 * propósito.
 */
import { SUPABASE_ROOT_CA } from '../src/shared/db/supabase-ca'

const HOST = process.argv[2] ?? 'aws-1-sa-east-1.pooler.supabase.com'
const PORTS = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [5432, 6543]

// Usuario con el formato de Supavisor. No hace falta que exista: lo único que
// se mide es si el handshake TLS llegó a la etapa de autenticación.
const USER = 'postgres.dpzicetvrgqlwfrqlaek'
const BAD_PASSWORD = 'contrasena-deliberadamente-invalida'

type SslConfig = { ca: string; rejectUnauthorized: true } | { rejectUnauthorized: boolean }

const CASES: ReadonlyArray<{ label: string; ssl: SslConfig }> = [
  {
    label: 'CON la CA (lo que hace el código hoy)',
    ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
  },
  { label: 'sin validar  (el comportamiento viejo)', ssl: { rejectUnauthorized: false } },
  { label: 'SIN la CA    (control negativo)       ', ssl: { rejectUnauthorized: true } },
]

function verdict(err: unknown): string {
  const e = err as { message?: string; code?: string }
  const msg = String(e?.message ?? err)
  const code = e?.code ?? ''
  if (code === '28P01' || /password authentication failed/i.test(msg)) {
    return `TLS VALIDÓ  (llegó a autenticación: ${code || '28P01'})`
  }
  if (/certificate|self-signed|unable to verify|altname/i.test(msg)) {
    return `TLS RECHAZADO -> ${msg}`
  }
  return `otro -> ${code} ${msg}`
}

async function probePorsager(port: number, ssl: SslConfig): Promise<string> {
  const { default: postgres } = await import('postgres')
  const sql = postgres({
    host: HOST,
    port,
    user: USER,
    password: BAD_PASSWORD,
    database: 'postgres',
    ssl: ssl as never,
    max: 1,
    connect_timeout: 15,
  })
  try {
    await sql`SELECT 1`
    return 'CONECTÓ (inesperado con contraseña inválida)'
  } catch (err) {
    return verdict(err)
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {})
  }
}

async function probePg(port: number, ssl: SslConfig): Promise<string> {
  // `pg` no es dependencia directa: entra por pg-boss. Se resuelve igual que en
  // tests/unit/db-ssl-options.test.ts, que tiene el mismo problema.
  const { createRequire } = await import('node:module')
  const require_ = createRequire(import.meta.url)
  let pgPath: string
  try {
    pgPath = require_.resolve('pg')
  } catch {
    pgPath = require_.resolve('pg', { paths: [require_.resolve('pg-boss')] })
  }
  const pg = require_(pgPath) as {
    Client: new (c: unknown) => { connect(): Promise<void>; end(): Promise<void> }
  }
  const client = new pg.Client({
    host: HOST,
    port,
    user: USER,
    password: BAD_PASSWORD,
    database: 'postgres',
    ssl,
  })
  try {
    await client.connect()
    await client.end()
    return 'CONECTÓ (inesperado con contraseña inválida)'
  } catch (err) {
    return verdict(err)
  }
}

async function main(): Promise<void> {
  console.log(`Sonda de TLS contra ${HOST} — sin credenciales, sin tocar datos.\n`)
  let controlWorked = false

  for (const port of PORTS) {
    console.log(`── puerto ${port} ─────────────────────────────────────────`)
    for (const { label, ssl } of CASES) {
      const [porsager, pg] = await Promise.all([probePorsager(port, ssl), probePg(port, ssl)])
      console.log(`  ${label}`)
      console.log(`    porsager -> ${porsager}`)
      console.log(`    pg       -> ${pg}`)
      if (label.includes('control negativo')) {
        controlWorked ||= porsager.startsWith('TLS RECHAZADO') && pg.startsWith('TLS RECHAZADO')
      }
    }
    console.log()
  }

  if (!controlWorked) {
    console.log(
      'ATENCIÓN: el control negativo NO falló. Sin él, un "TLS VALIDÓ" no prueba\n' +
        'nada — puede ser que la sonda no sepa detectar un TLS que no valida.',
    )
    process.exitCode = 1
    return
  }
  console.log('Control negativo OK: la sonda sabe distinguir un TLS que no valida.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(2)
})
