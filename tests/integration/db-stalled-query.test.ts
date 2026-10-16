import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import postgres, { type Sql } from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { stalledQuerySocket } from '@/shared/db/stalled-query-guard'

// Reproduce contra Postgres real, con TLS de verdad, los dos casos del
// 2026-10-15: la query que el pooler deja sin respuesta (hay que cortarla) y la
// instancia de Vercel que se descongela con conexiones ociosas y timers
// vencidos (no hay que tocar nada y nada puede voltear el proceso — el #426
// tiró exit 129 justo ahí).
//
// Entre el cliente y la base hay un proxy que hace de pooler: negocia el
// SSLRequest, termina TLS con un certificado propio y reenvía en texto plano a
// la base local. Corre en un worker_thread para que siga atendiendo mientras el
// hilo del test está "congelado" (Atomics.wait): la respuesta queda esperando
// en el kernel, que es lo que encuentra una instancia al despertar.

const CUTOFF_MS = 1_000
const GRACE_MS = 300

const PROXY_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const net = require('node:net')
const tls = require('node:tls')
let muted = false
let mode = 'tls'
let handshakes = 0
const secureContext = tls.createSecureContext({ key: workerData.key, cert: workerData.cert })
const server = net.createServer((client) => {
  client.on('error', () => {})
  client.once('data', () => {
    if (mode === 'hang') return
    if (mode === 'refuse-tls') return void client.write('N')
    client.write('S')
    const secure = new tls.TLSSocket(client, { isServer: true, secureContext })
    secure.on('error', () => {})
    secure.once('secure', () => handshakes++)
    const upstream = net.connect(workerData.upstreamPort, workerData.upstreamHost)
    upstream.on('error', () => secure.destroy())
    secure.on('data', (d) => upstream.write(d))
    upstream.on('data', (d) => { if (!muted) secure.write(d) })
    secure.on('close', () => upstream.destroy())
    upstream.on('close', () => secure.destroy())
  })
})
parentPort.on('message', (m) => {
  if (m.cmd === 'mute') muted = m.value
  if (m.cmd === 'mode') mode = m.value
  parentPort.postMessage({ id: m.id, handshakes })
})
server.listen(0, () => parentPort.postMessage({ ready: true, port: server.address().port }))
`

type ProxyReply = { id: number; handshakes: number }

let workDir: string
let cert: string
let otherCert: string
let proxy: Worker
let proxyPort: number
let nextId = 0
let dbUrl: URL

function generateCert(dir: string, name: string): { key: string; cert: string } {
  const keyPath = path.join(dir, `${name}.key`)
  const certPath = path.join(dir, `${name}.crt`)
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
}

function control(cmd: 'mute' | 'mode' | 'stats', value?: unknown): Promise<ProxyReply> {
  const id = ++nextId
  return new Promise((resolve) => {
    const onMessage = (m: ProxyReply) => {
      if (m.id !== id) return
      proxy.off('message', onMessage)
      resolve(m)
    }
    proxy.on('message', onMessage)
    proxy.postMessage({ id, cmd, value })
  })
}

/** Congela el hilo como Vercel congela la instancia: timers y I/O, todo quieto. */
function freeze(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

const uncaught: unknown[] = []
const onUncaught = (err: unknown) => uncaught.push(err)
const pools: Sql[] = []
let stalls = 0

function pool(opts: { ca?: string; idleTimeout?: number; handshakeTimeoutMs?: number } = {}): Sql {
  // `socket` existe en postgres.js pero no en sus tipos: va por spread, igual
  // que en client.ts.
  const guarded = {
    ssl: false as const,
    socket: stalledQuerySocket(
      'app',
      { ca: opts.ca ?? cert, rejectUnauthorized: true },
      {
        cutoffMs: CUTOFF_MS,
        graceMs: GRACE_MS,
        handshakeTimeoutMs: opts.handshakeTimeoutMs ?? 2_000,
        onStall: () => stalls++,
      },
    ),
  }
  const sql = postgres(
    `postgres://${dbUrl.username}:${dbUrl.password}@localhost:${proxyPort}${dbUrl.pathname}`,
    {
      ...guarded,
      max: 3,
      idle_timeout: opts.idleTimeout ?? 20,
      connect_timeout: 5,
      prepare: false,
      onnotice: () => {},
    },
  )
  pools.push(sql)
  return sql
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return (err as { code?: string }).code ?? String(err)
  }
}

beforeAll(async () => {
  dbUrl = new URL(
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
  )
  workDir = mkdtempSync(path.join(tmpdir(), 'tg-stalled-'))
  const main = generateCert(workDir, 'proxy')
  cert = main.cert
  otherCert = generateCert(workDir, 'other').cert
  proxy = new Worker(PROXY_SOURCE, {
    eval: true,
    workerData: {
      key: main.key,
      cert: main.cert,
      upstreamHost: dbUrl.hostname,
      upstreamPort: Number(dbUrl.port || 5432),
    },
  })
  proxyPort = await new Promise<number>((resolve) => {
    proxy.once('message', (m: { port: number }) => resolve(m.port))
  })
  process.on('uncaughtException', onUncaught)
})

afterEach(async () => {
  // Por test y no solo al final: el #426 voltea el proceso con un `write EBADF`
  // sin capturar justo en el caso "instancia reanudada" (medido con su socket:
  // un EBADF por conexión ociosa), y el que falle tiene que ser ESE test.
  expect(uncaught.splice(0)).toEqual([])
  await control('mute', false)
  await control('mode', 'tls')
  await Promise.all(pools.splice(0).map((sql) => sql.end({ timeout: 0 }).catch(() => {})))
  stalls = 0
})

afterAll(async () => {
  process.off('uncaughtException', onUncaught)
  await proxy.terminate()
  rmSync(workDir, { recursive: true, force: true })
})

describe('corte de queries colgadas — TLS real contra Postgres', () => {
  it('negocia TLS y valida el certificado (control negativo: otra CA no conecta)', async () => {
    const sql = pool()
    const [row] = await sql<{ ok: number }[]>`SELECT 1 AS ok`
    expect(row?.ok).toBe(1)
    expect((await control('stats')).handshakes).toBeGreaterThan(0)

    const wrongCa = pool({ ca: otherCert })
    expect(await codeOf(wrongCa`SELECT 1`)).toMatch(/SELF_SIGNED|UNABLE_TO_VERIFY|self-signed/i)
  })

  it('query muda: se rechaza con DB_QUERY_STALLED y el pool sigue andando', async () => {
    const sql = pool()
    await sql`SELECT 1`
    await control('mute', true)

    const started = performance.now()
    const codes = await Promise.all([
      codeOf(sql`SELECT 1`),
      codeOf(sql`SELECT ${'con parámetro'}::text`),
      codeOf(sql`SELECT 3`),
    ])
    const elapsed = performance.now() - started

    expect(codes).toEqual(['DB_QUERY_STALLED', 'DB_QUERY_STALLED', 'DB_QUERY_STALLED'])
    expect(elapsed).toBeLessThan(CUTOFF_MS + GRACE_MS + 1_500)
    expect(stalls).toBeGreaterThanOrEqual(1)

    await control('mute', false)
    const [row] = await sql<{ ok: number }[]>`SELECT 1 AS ok`
    expect(row?.ok).toBe(1)
  })

  it('query muda en medio de una transacción: rechaza y la conexión vuelve al pool', async () => {
    const sql = pool()
    const tx = sql.begin(async (t) => {
      await t`SELECT 1`
      await control('mute', true)
      await t`SELECT 2`
    })
    // `begin` de postgres.js corre la transacción contra el `onclose` de la
    // conexión, así que la transacción rechaza con CONNECTION_CLOSED (su query
    // con DB_QUERY_STALLED). Lo que importa: rechaza, no cuelga.
    expect(await codeOf(tx)).toMatch(/^(DB_QUERY_STALLED|CONNECTION_CLOSED)$/)
    expect(stalls).toBe(1)

    await control('mute', false)
    const rows = await Promise.all([sql`SELECT 1`, sql`SELECT 2`, sql`SELECT 3`, sql`SELECT 4`])
    expect(rows).toHaveLength(4)
  })

  it('instancia reanudada con conexiones ociosas: no corta nada ni voltea el proceso', async () => {
    const sql = pool({ idleTimeout: 1 })
    await Promise.all([sql`SELECT pg_sleep(0.05)`, sql`SELECT pg_sleep(0.05)`, sql`SELECT 1`])

    // Más que el idle_timeout (1 s) y que el corte + gracia: al despertar vencen
    // todos los timers a la vez, como en Vercel.
    freeze(CUTOFF_MS + GRACE_MS + 1_500)
    await pause(GRACE_MS * 3)

    expect(stalls).toBe(0)
    const [row] = await sql<{ ok: number }[]>`SELECT 1 AS ok`
    expect(row?.ok).toBe(1)
  })

  it('instancia reanudada con una query en vuelo cuya respuesta llegó durante el freeze', async () => {
    const sql = pool({ idleTimeout: 1 })
    await sql`SELECT 1`
    const inFlight = sql<{ v: string }[]>`SELECT pg_sleep(0.1), 'llegó' AS v`

    freeze(CUTOFF_MS + GRACE_MS + 1_500)

    const [row] = await inFlight
    expect(row?.v).toBe('llegó')
    await pause(GRACE_MS * 3)
    expect(stalls).toBe(0)
  })

  it('handshake fallido (sin TLS o colgado): rechaza rápido y no pierde slots del pool', async () => {
    const sql = pool({ handshakeTimeoutMs: 500 })

    await control('mode', 'refuse-tls')
    for (let i = 0; i < 4; i++) expect(await codeOf(sql`SELECT 1`)).toBe('CONNECT_TIMEOUT')

    await control('mode', 'hang')
    for (let i = 0; i < 4; i++) expect(await codeOf(sql`SELECT 1`)).toBe('CONNECT_TIMEOUT')

    await control('mode', 'tls')
    const rows = await Promise.all([sql`SELECT 1`, sql`SELECT 2`, sql`SELECT 3`, sql`SELECT 4`])
    expect(rows).toHaveLength(4)
  })
})
