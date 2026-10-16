import net from 'node:net'
import tls from 'node:tls'
import { performance } from 'node:perf_hooks'
import { logger } from '@/shared/lib/logger'
import type * as SentryHelpers from '@/lib/sentry'
import type { DbSslOptions } from './ssl'

/**
 * Corte de queries que quedan sin respuesta de la base.
 *
 * El 2026-10-15 una query quedó colgada en el pooler (backend `active`/
 * `ClientRead` más de 7 min) y postgres.js la esperó para siempre: no tiene
 * timeout de query. La conexión no volvía al pool y con 3 por instancia unos
 * pocos cuelgues trabaron `/super-admin`, la home y `/[slug]/reservar` hasta los
 * 300 s de Vercel. Un tope por página no alcanza: libera el request, pero la
 * conexión colgada sigue tomada y la próxima request de la instancia hace cola
 * detrás de ella. Hay que cortar la CONEXIÓN.
 *
 * ─── Por qué el primer intento (#426) tumbó el proceso ────────────────────────
 *
 * Le daba a postgres.js un socket crudo con `setTimeout` de inactividad. Dos
 * errores juntos:
 *   1. postgres.js envuelve ese socket en TLS (`secure()` en connection.js) y
 *      sigue trabajando sobre el TLSSocket. El corte destruía el crudo POR
 *      DEBAJO: el TLSSocket seguía `open`, y cuando `idle_timeout` le hizo
 *      `socket.end()` saltó `write EBADF` sin nadie escuchando → exit 129.
 *   2. La inactividad también corre en conexiones OCIOSAS. Al descongelarse la
 *      instancia de Vercel todos los timers vencen juntos, y Node corre los
 *      timers ANTES de leer los datos que esperan en el kernel.
 *
 * ─── Qué hace este ─────────────────────────────────────────────────────────────
 *
 *   - El TLS lo negocia esta fábrica (SSLRequest + `tls.connect`, igual que
 *     `secure()`), y postgres.js recibe el socket FINAL con `ssl: false`. Sus
 *     listeners de `error`/`close` quedan colgados del mismo socket que corta el
 *     corte: es el camino que usa la propia librería en `connectTimedOut()`.
 *   - El corte solo se arma con una respuesta PENDIENTE: se cuentan los mensajes
 *     del protocolo (cada Sync, Query simple o arranque espera un
 *     ReadyForQuery). Una conexión ociosa no tiene timer.
 *   - Dos etapas: vencido el tope, se arma un timer NUEVO de gracia y solo se
 *     corta si tampoco en la gracia llegó un byte. Así, tras descongelar, el
 *     event loop pasa por la fase de I/O antes de decidir.
 *   - `destroy(error)`: postgres.js rechaza la query (también la lectura de
 *     tipos del arranque, que con un `close` a secas reconectaría en loop) y la
 *     conexión vuelve al pool; la próxima query abre otra.
 */
const STALLED_QUERY_CUTOFF_MS = 20_000

/** Segunda etapa del corte: deja que el event loop lea lo que ya llegó. */
const CONFIRM_GRACE_MS = 2_000

/**
 * TCP + SSLRequest + TLS de la fábrica. postgres.js no los cubre: su
 * `connect_timeout` arranca recién cuando la fábrica entrega el socket.
 */
const HANDSHAKE_TIMEOUT_MS = 10_000

/** Arranque (startup + auth) a cargo de postgres.js: debajo del corte. */
const CONNECT_TIMEOUT_SECONDS = 10

type PoolName = 'app' | 'worker' | 'super-admin'

type SocketTarget = { host: string[]; port: number[] }
type GuardedSocket = net.Socket & { host: string; port: number }

const SSL_REQUEST_CODE = 80877103
const CANCEL_REQUEST_CODE = 80877102
const SSL_REQUEST = Buffer.alloc(8)
SSL_REQUEST.writeInt32BE(8, 0)
SSL_REQUEST.writeInt32BE(SSL_REQUEST_CODE, 4)

const MSG_SYNC = 0x53 // 'S'
const MSG_QUERY = 0x51 // 'Q'
const MSG_TERMINATE = 0x58 // 'X'
const MSG_READY_FOR_QUERY = 0x5a // 'Z'
const MSG_STARTUP = -1
const MSG_CANCEL = -2

/**
 * Corta un stream del protocolo de Postgres en mensajes y avisa el tipo de cada
 * uno cuando llegó ENTERO. Los chunks pueden partir un mensaje en cualquier
 * byte. El primer mensaje del cliente no tiene byte de tipo (startup o cancel).
 */
class MessageFramer {
  private header = Buffer.alloc(0)
  private remaining = 0
  private type = 0

  constructor(
    private untypedFirst: boolean,
    private readonly onMessage: (type: number) => void,
  ) {}

  push(chunk: Buffer): void {
    let i = 0
    while (i < chunk.length) {
      if (this.remaining > 0) {
        const n = Math.min(this.remaining, chunk.length - i)
        this.remaining -= n
        i += n
        if (this.remaining === 0) this.onMessage(this.type)
        continue
      }
      const need = (this.untypedFirst ? 8 : 5) - this.header.length
      const take = Buffer.from(chunk.subarray(i, i + need))
      this.header = Buffer.concat([this.header, take])
      i += take.length
      if (take.length < need) return

      if (this.untypedFirst) {
        const code = this.header.readInt32BE(4)
        this.untypedFirst = false
        this.type = code === CANCEL_REQUEST_CODE ? MSG_CANCEL : MSG_STARTUP
        this.remaining = Math.max(0, this.header.readInt32BE(0) - 8)
      } else {
        this.type = this.header[0]!
        this.remaining = Math.max(0, this.header.readInt32BE(1) - 4)
      }
      this.header = Buffer.alloc(0)
      if (this.remaining === 0) this.onMessage(this.type)
    }
  }
}

/**
 * Cuántas respuestas le debe el servidor a esta conexión. `busy` desde el primer
 * mensaje del cliente hasta el ReadyForQuery que salda todos los Sync/Query
 * enviados: cubre también el Parse/Describe/Flush que postgres.js manda antes de
 * cada query con parámetros, que no lleva Sync.
 *
 * Límite: un cursor (`PortalSuspended`) o un COPY IN dejan la conexión `busy`
 * mientras el que tarda es el CLIENTE, y se cortarían a los 20 s. Hoy no hay
 * `.cursor(`/`.copy`/`.writable(` en `src/`; si aparece uno, revisar esto.
 */
export class PendingReplies {
  private expected = 0
  busy = false

  private readonly outbound = new MessageFramer(true, (type) => {
    if (type === MSG_SYNC || type === MSG_QUERY || type === MSG_STARTUP) this.expected++
    // Terminate y Cancel no esperan respuesta: el servidor cierra.
    if (type !== MSG_CANCEL && type !== MSG_TERMINATE) this.busy = true
  })

  private readonly inbound = new MessageFramer(false, (type) => {
    if (type !== MSG_READY_FOR_QUERY) return
    this.expected = Math.max(0, this.expected - 1)
    if (this.expected === 0) this.busy = false
  })

  sent(chunk: Buffer): void {
    this.outbound.push(chunk)
  }

  received(chunk: Buffer): void {
    this.inbound.push(chunk)
  }
}

class StalledQueryError extends Error {
  readonly code = 'DB_QUERY_STALLED'

  constructor(host: string, port: number, cutoffMs: number) {
    super(`DB_QUERY_STALLED: la base no respondió en ${cutoffMs} ms (${host}:${port})`)
    this.name = 'StalledQueryError'
  }
}

type GuardOptions = {
  cutoffMs: number
  graceMs: number
  onStall: () => void
}

/**
 * Engancha el corte al socket que va a manejar postgres.js. Se intercepta
 * `write` y `emit` de la instancia (no listeners): postgres.js le hace
 * `removeAllListeners()` al socket cuando se cierra, y además un listener de
 * 'data' propio lo pondría a fluir antes de que la librería enganche el suyo.
 */
function guard(socket: GuardedSocket, opts: GuardOptions): void {
  const replies = new PendingReplies()
  let timer: NodeJS.Timeout | null = null
  let lastInbound = performance.now()

  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const schedule = (ms: number, fn: () => void) => {
    clear()
    timer = setTimeout(fn, ms)
    timer.unref()
  }

  const check = () => {
    timer = null
    if (socket.destroyed || !replies.busy) return
    const silentFor = performance.now() - lastInbound
    if (silentFor < opts.cutoffMs) return schedule(opts.cutoffMs - silentFor, check)
    const suspectedAt = performance.now()
    schedule(opts.graceMs, () => {
      timer = null
      if (socket.destroyed || !replies.busy) return
      if (lastInbound >= suspectedAt) return check()
      socket.destroy(new StalledQueryError(socket.host, socket.port, opts.cutoffMs))
      opts.onStall()
    })
  }

  const write = socket.write
  socket.write = function (this: net.Socket, ...args: unknown[]) {
    const [chunk] = args
    if (Buffer.isBuffer(chunk)) {
      const wasBusy = replies.busy
      replies.sent(chunk)
      if (replies.busy && !wasBusy) {
        lastInbound = performance.now()
        schedule(opts.cutoffMs, check)
      }
    }
    return (write as (...a: unknown[]) => boolean).apply(this, args)
  } as typeof socket.write

  const emit = socket.emit
  socket.emit = function (this: net.Socket, event: string | symbol, ...args: unknown[]) {
    if (event === 'data' && Buffer.isBuffer(args[0])) {
      lastInbound = performance.now()
      replies.received(args[0])
      if (!replies.busy) clear()
    } else if (event === 'close') {
      clear()
    }
    return (emit as (...a: unknown[]) => boolean).call(this, event, ...args)
  } as typeof socket.emit
}

function connectError(host: string, port: number, reason: string): Error {
  return Object.assign(new Error(`CONNECT_TIMEOUT: ${reason} (${host}:${port})`), {
    code: 'CONNECT_TIMEOUT',
  })
}

/** TCP, y si corresponde SSLRequest + TLS, con tope propio. Los listeners son todos nuestros. */
function openSocket(
  host: string,
  port: number,
  ssl: DbSslOptions | false,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const raw = net.connect(port, host)
    let current: net.Socket = raw
    let settled = false
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      current.destroy()
      raw.destroy()
      reject(err)
    }
    const done = (socket: net.Socket) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(socket)
    }
    const timer = setTimeout(
      () => fail(connectError(host, port, `sin conexión en ${timeoutMs} ms`)),
      timeoutMs,
    )
    // Permanente: el crudo queda debajo del TLS y nadie más lo escucha.
    raw.on('error', fail)

    raw.once('connect', () => {
      if (!ssl) return done(raw)
      raw.write(SSL_REQUEST)
      raw.once('data', (reply: Buffer) => {
        if (reply[0] !== 0x53) {
          return fail(connectError(host, port, 'el servidor no acepta TLS'))
        }
        const secure = tls.connect({
          socket: raw,
          servername: net.isIP(host) ? undefined : host,
          ...ssl,
        })
        current = secure
        secure.once('error', fail)
        secure.once('secureConnect', () => {
          secure.removeListener('error', fail)
          done(secure)
        })
      })
    })
  })
}

/**
 * Socket que falla solo, para el caso en que la fábrica no pudo conectar.
 *
 * No se puede tirar la excepción: postgres.js la captura pero deja la conexión
 * en la cola `connecting` para siempre (un slot del pool perdido). Tampoco se
 * puede destruir apenas se entrega: postgres.js escribe el StartupMessage con
 * un `setImmediate` pendiente, y si el `close` llega antes, `closed()` hace
 * `clearImmediate` pero no vuelve `nextWriteTimer` a null — la conexión no
 * vuelve a escribir nunca más (medido: cada reconexión moría por
 * CONNECT_TIMEOUT). Por eso se destruye recién cuando postgres.js ya vació ese
 * buffer contra este socket: el `error` rechaza la query y el `close` devuelve
 * la conexión al pool.
 */
function failedSocket(err: Error): net.Socket {
  const socket = new net.Socket()
  const fail = () => {
    if (!socket.destroyed) socket.destroy(err)
  }
  socket.write = (() => {
    setImmediate(fail)
    return true
  }) as typeof socket.write
  setTimeout(fail, 1_000).unref()
  return socket
}

/** Fábrica para la opción `socket` de postgres.js (que debe ir con `ssl: false`). */
export function stalledQuerySocket(
  pool: PoolName,
  ssl: DbSslOptions | false,
  opts: Partial<GuardOptions> & { handshakeTimeoutMs?: number } = {},
): (target: SocketTarget) => Promise<net.Socket> {
  const cutoffMs = opts.cutoffMs ?? STALLED_QUERY_CUTOFF_MS
  const guardOpts: GuardOptions = {
    cutoffMs,
    graceMs: opts.graceMs ?? CONFIRM_GRACE_MS,
    onStall: opts.onStall ?? (() => reportStalledQuery(pool, cutoffMs)),
  }
  return async ({ host: [host = 'localhost'], port: [port = 5432] }) => {
    // `Errors.connection` de postgres.js arma el mensaje con `socket.host`/`port`.
    let socket: net.Socket
    try {
      socket = await openSocket(host, port, ssl, opts.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS)
    } catch (err) {
      const failed = failedSocket(err instanceof Error ? err : new Error(String(err)))
      return Object.assign(failed, { host, port })
    }
    const guarded = Object.assign(socket, { host, port })
    guard(guarded, guardOpts)
    return guarded
  }
}

/**
 * Opciones de TLS y socket para un cliente de postgres.js. Dentro del servidor
 * de Next lleva el corte; afuera (worker de Railway, tests) queda el `ssl` de
 * siempre: sus barridos pueden pasar el tope sin un byte y no hay un request
 * esperando.
 */
export function dbConnectionOptions(
  pool: PoolName,
  ssl: DbSslOptions | false,
): {
  ssl: DbSslOptions | false
  socket?: (target: SocketTarget) => Promise<net.Socket>
  connect_timeout?: number
} {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return { ssl }
  void loadSentry().catch(() => {})
  return {
    ssl: false,
    socket: stalledQuerySocket(pool, ssl),
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
  }
}

// Import diferido y memoizado: el SDK de Sentry no entra al grafo de todo el que
// importa la base, pero en la web se precarga al crear el pool. Cargarlo recién
// en el corte trababa el event loop varios segundos (medido en el #426).
let sentry: Promise<typeof SentryHelpers> | null = null
function loadSentry(): Promise<typeof SentryHelpers> {
  sentry ??= import('@/lib/sentry').catch((err: unknown) => {
    sentry = null
    throw err
  })
  return sentry
}

function reportStalledQuery(pool: PoolName, cutoffMs: number): void {
  logger.warn('db.stalled_query_cut', { module: 'db', pool, cutoffMs })
  loadSentry()
    .then(({ captureMessage }) =>
      captureMessage('db.stalled_query_cut', { level: 'error', tags: { pool } }),
    )
    .catch(() => {})
}
