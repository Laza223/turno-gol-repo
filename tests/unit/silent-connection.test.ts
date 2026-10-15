import net from 'node:net'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-15: una query quedó sin respuesta en el pooler y postgres.js la
// esperó para siempre — /super-admin, la home y /[slug]/reservar llegaron a los
// 300 s de Vercel. Estos tests usan postgres.js REAL contra un servidor falso
// que completa el arranque del protocolo y después no contesta más: es el mismo
// silencio que se vio en producción.

const h = vi.hoisted(() => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureMessage: h.captureMessage }))

import {
  SILENT_CONNECTION_CUTOFF_MS,
  silentConnectionOptions,
  silentConnectionSocket,
} from '@/shared/db/silent-connection'

/** Contesta el arranque (AuthenticationOk + ReadyForQuery) y después queda mudo. */
function startMutePostgres(): Promise<{ port: number; close: () => void }> {
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('data', () => {
      const authOk = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])
      const readyForQuery = Buffer.from([0x5a, 0, 0, 0, 5, 0x49])
      socket.write(Buffer.concat([authOk, readyForQuery]))
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      resolve({
        port,
        close: () => {
          for (const s of sockets) s.destroy()
          server.close()
        },
      })
    })
  })
}

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.NEXT_RUNTIME
  else process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME
})

describe('silentConnectionSocket — corte de una conexión muda en uso', () => {
  it('una query sin respuesta se rechaza pasado el tope, no queda colgada', async () => {
    const server = await startMutePostgres()
    const sql = postgres(`postgres://u@127.0.0.1:${server.port}/db`, {
      max: 1,
      ssl: false,
      fetch_types: false,
      prepare: false,
      onnotice: () => {},
      ...{ socket: silentConnectionSocket('worker', 300) },
    })
    try {
      const started = Date.now()
      const error = await sql`select 1`.then(
        () => null,
        (err: unknown) => err,
      )

      expect(error).toBeInstanceOf(Error)
      expect((error as { code?: string }).code).toBe('CONNECTION_CLOSED')
      // Cortó por el tope (300 ms), no por otro timeout más largo.
      expect(Date.now() - started).toBeLessThan(2_000)
    } finally {
      await sql.end({ timeout: 0 })
      server.close()
    }
  })

  it('cada corte avisa a Sentry con el pool que se cortó', async () => {
    const server = await startMutePostgres()
    const sql = postgres(`postgres://u@127.0.0.1:${server.port}/db`, {
      max: 1,
      ssl: false,
      fetch_types: false,
      prepare: false,
      onnotice: () => {},
      ...{ socket: silentConnectionSocket('app', 300) },
    })
    try {
      await sql`select 1`.catch(() => {})
      await vi.waitFor(() => expect(h.captureMessage).toHaveBeenCalledTimes(1))

      expect(h.captureMessage).toHaveBeenCalledWith('db.silent_connection_cut', {
        level: 'error',
        tags: { pool: 'app' },
      })
    } finally {
      await sql.end({ timeout: 0 })
      server.close()
    }
  })
})

describe('silentConnectionOptions — solo en el servidor de Next', () => {
  it('fuera de Next (worker de Railway, scripts, tests) no cambia nada', () => {
    delete process.env.NEXT_RUNTIME

    expect(silentConnectionOptions('worker')).toEqual({})
  })

  it('dentro de Next agrega el socket con corte y un tope de conexión menor que el corte', () => {
    process.env.NEXT_RUNTIME = 'nodejs'

    const options = silentConnectionOptions('app')

    expect(typeof options.socket).toBe('function')
    // El arranque tiene que vencer antes que el corte: si no, un pooler mudo al
    // conectar haría que postgres.js reconecte en loop en vez de rechazar.
    expect((options.connect_timeout ?? Infinity) * 1000).toBeLessThan(SILENT_CONNECTION_CUTOFF_MS)
  })
})
