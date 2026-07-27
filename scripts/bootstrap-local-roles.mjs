#!/usr/bin/env node
/**
 * Le da LOGIN + contraseña a los roles `turnogol_app` y `turnogol_worker` en la
 * base LOCAL, tomando los valores de `.env.local`.
 *
 * ¿Por qué existe? Las migraciones crean los roles pero NO les ponen contraseña
 * — la 037 lo dice explícito: "ALTER ROLE turnogol_app WITH LOGIN PASSWORD '...'
 * se hace A MANO fuera de". Los tests no lo necesitan porque entran como
 * superusuario y hacen `SET LOCAL ROLE`, así que crean los roles `NOLOGIN`
 * (tests/helpers/tenant.ts, scripts/bootstrap-test-db.mjs).
 *
 * Pero `pnpm dev` SÍ se loguea con esos usuarios. Resultado: después de un
 * `supabase db reset` la app local queda con la base caída y nada en el repo
 * explica cómo revivirla. Este script cierra ese agujero.
 *
 *   pnpm bootstrap:local-roles
 *
 * Correr después de: `pnpm supabase:start` o `pnpm supabase:reset`.
 *
 * SEGURIDAD: aborta si el DSN no apunta a localhost. Nunca puede tocar
 * producción, ni por accidente ni por un .env mal copiado.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])
const ENV_FILE = join(process.cwd(), '.env.local')

/** Lee una clave de .env.local sin depender de dotenv ni contaminar process.env. */
function leerEnv(clave) {
  let contenido
  try {
    contenido = readFileSync(ENV_FILE, 'utf8')
  } catch {
    throw new Error(`No encuentro ${ENV_FILE}. Copiá .env.example y completalo.`)
  }
  for (const linea of contenido.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && m[1] === clave) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

/** Extrae usuario/contraseña/host de un DSN, validando que sea local. */
function parsearDsn(dsn, nombreVar) {
  let url
  try {
    url = new URL(dsn)
  } catch {
    throw new Error(`${nombreVar} no es una URL válida.`)
  }
  if (!HOSTS_LOCALES.has(url.hostname)) {
    throw new Error(
      `ABORTADO: ${nombreVar} apunta a "${url.hostname}", que no es local.\n` +
        'Este script solo puede tocar la base de desarrollo. Si querés cambiar una\n' +
        'contraseña en producción, hacelo desde el dashboard de Supabase.',
    )
  }
  const usuario = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  if (!usuario || !password) {
    throw new Error(`${nombreVar} no trae usuario y contraseña.`)
  }
  return { usuario, password, host: url.hostname, port: url.port || '5432' }
}

let objetivos
try {
  objetivos = [
    ['DATABASE_URL', leerEnv('DATABASE_URL')],
    ['WORKER_DATABASE_URL', leerEnv('WORKER_DATABASE_URL')],
  ]
    .filter(([, dsn]) => dsn)
    .map(([nombre, dsn]) => ({ nombre, ...parsearDsn(dsn, nombre) }))
} catch (err) {
  // Mensaje limpio, sin stack trace: el caso esperado acá es un .env mal
  // apuntado, no un bug del script.
  console.error(`✗ ${err.message}`)
  process.exit(1)
}

if (objetivos.length === 0) {
  console.error('No hay DATABASE_URL ni WORKER_DATABASE_URL en .env.local.')
  process.exit(1)
}

// Conexión de superusuario a la MISMA instancia local que declaran los DSN.
const { host, port } = objetivos[0]
const sql = postgres(`postgres://postgres:postgres@${host}:${port}/postgres`, {
  max: 1,
  onnotice: () => {},
})

try {
  for (const { nombre, usuario, password } of objetivos) {
    const [existe] = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${usuario}`
    if (!existe) {
      console.error(
        `✗ ${usuario} no existe. Corré las migraciones primero (pnpm supabase:reset).`,
      )
      process.exitCode = 1
      continue
    }
    // unsafe() porque ALTER ROLE no admite parámetros ligados: ni el nombre del
    // rol ni la contraseña pueden ir como $1. Se escapan a mano — identificador
    // con comillas dobles, literal con comillas simples — sobre valores que ya
    // salieron de un DSN local validado.
    const rolEscapado = `"${usuario.replace(/"/g, '""')}"`
    const passEscapada = `'${password.replace(/'/g, "''")}'`
    await sql.unsafe(`ALTER ROLE ${rolEscapado} WITH LOGIN PASSWORD ${passEscapada}`)
    console.log(`✓ ${usuario} — LOGIN + contraseña de ${nombre}`)
  }

  // Verificación real: abrir una conexión con cada credencial. Un ALTER ROLE que
  // "no falló" no prueba que se pueda entrar.
  for (const { usuario, password, host: h, port: p } of objetivos) {
    const prueba = postgres(
      `postgres://${encodeURIComponent(usuario)}:${encodeURIComponent(password)}@${h}:${p}/postgres`,
      { max: 1, onnotice: () => {}, connect_timeout: 10 },
    )
    try {
      const [row] = await prueba`SELECT current_user AS quien`
      console.log(`✓ login verificado: ${row.quien}`)
    } catch (err) {
      console.error(`✗ ${usuario} no puede conectar: ${err.message}`)
      process.exitCode = 1
    } finally {
      await prueba.end({ timeout: 5 })
    }
  }
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
