import net from 'node:net'
import { logger } from '@/shared/lib/logger'
import type * as SentryHelpers from '@/lib/sentry'

/**
 * Corte de conexiones a la base que quedan mudas en medio de un uso.
 *
 * El 2026-10-15 una query quedó sin respuesta en el pooler (backend
 * `active`/`ClientRead` más de 7 min) y postgres.js la esperó para siempre: no
 * tiene timeout de query. Esa conexión no volvía al pool, y con 3 por instancia
 * unos pocos cuelgues dejaban trabado el servidor entero — `/super-admin`, la
 * home y `/[slug]/reservar` llegaron a los 300 s de Vercel. Acá cada socket
 * tiene un tope de silencio: si en `SILENT_CONNECTION_CUTOFF_MS` no pasa un solo
 * byte, se corta. postgres.js rechaza la query con `CONNECTION_CLOSED`, saca la
 * conexión del pool y la próxima query abre otra.
 *
 * El tope NO corta conexiones ociosas: `idle_timeout` (20 s, `client.ts`) las
 * cierra antes, y `connect_timeout` (10 s) acota el arranque. Así que solo llega
 * a 30 s de silencio una conexión que estaba EN USO — y cada corte es un aviso.
 *
 * Límite conocido: si el silencio cae justo en la lectura de tipos que
 * postgres.js hace al abrir cada conexión (`fetch_types`, después del
 * `connect_timeout`), la librería reconecta en vez de rechazar la query. Un
 * silencio pasajero se cura así solo; uno persistente sigue esperando como
 * antes de este corte. Sacar `fetch_types` rompería el parseo de arrays.
 */
export const SILENT_CONNECTION_CUTOFF_MS = 30_000

/** Arranque de conexión: debajo del corte, para que un pooler mudo al conectar lo resuelva postgres.js. */
const CONNECT_TIMEOUT_SECONDS = 10

export type PoolName = 'app' | 'worker' | 'super-admin'

type SocketTarget = { host: string[]; port: number[] }

class SilentConnectionGuard extends net.Socket {
  constructor(
    private readonly onSilent: () => void,
    cutoffMs: number,
  ) {
    super()
    this.setTimeout(cutoffMs)
  }

  // En `emit` y no en un listener de 'timeout': postgres.js le hace
  // `removeAllListeners()` a este socket cuando lo envuelve en TLS
  // (connection.js, `secure()`), y un listener se perdería. Se destruye sin
  // error a propósito: ese 'error' ya no tendría quién lo escuche y voltearía
  // el proceso; el 'close' alcanza para que postgres.js rechace la query. El
  // aviso va en `setImmediate`, DESPUÉS del 'close' (que sale en nextTick):
  // cargar el SDK de Sentry trababa el event loop y la query tardaba 5 s en
  // rechazarse en vez de 1 (medido en el spike con tope de 1 s).
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'timeout' && !this.destroyed) {
      this.destroy()
      setImmediate(this.onSilent)
    }
    return super.emit(event, ...args)
  }
}

/** Fábrica de sockets para la opción `socket` de postgres.js. */
export function silentConnectionSocket(
  pool: PoolName,
  cutoffMs: number = SILENT_CONNECTION_CUTOFF_MS,
): (target: SocketTarget) => net.Socket {
  return ({ host: [host], port: [port] }) => {
    const socket = new SilentConnectionGuard(() => reportSilentConnection(pool, cutoffMs), cutoffMs)
    socket.connect(port, host)
    // `secure()` de postgres.js lee `socket.host` para el SNI y la verificación
    // del certificado: sin esto, TLS contra el pooler fallaría.
    return Object.assign(socket, { host, port })
  }
}

/**
 * Opciones de postgres.js con el corte, SOLO dentro del servidor de Next (web).
 * El proceso de workers de Railway no lo lleva: sus barridos pueden tardar más
 * que el tope sin mandar un byte, y ahí no hay un request esperando.
 */
export function silentConnectionOptions(pool: PoolName): {
  socket?: (target: SocketTarget) => net.Socket
  connect_timeout?: number
} {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return {}
  void loadSentry().catch(() => {})
  return { socket: silentConnectionSocket(pool), connect_timeout: CONNECT_TIMEOUT_SECONDS }
}

// Import diferido y memoizado: el SDK de Sentry no entra al grafo de todo el que
// importa la base (los tests y el worker no lo cargan), pero en la web se
// precarga al crear el pool. Cargarlo recién en el corte trababa el event loop:
// la query tardaba 3-5 s en rechazarse en vez de 1 (medido con tope de 1 s).
let sentry: Promise<typeof SentryHelpers> | null = null
function loadSentry(): Promise<typeof SentryHelpers> {
  sentry ??= import('@/lib/sentry').catch((err: unknown) => {
    sentry = null
    throw err
  })
  return sentry
}

function reportSilentConnection(pool: PoolName, cutoffMs: number): void {
  logger.warn('db.silent_connection_cut', { module: 'db', pool, cutoffMs })
  // `captureMessage` inicializa el SDK si hace falta y lo vacía después de la
  // respuesta (ver `@/lib/sentry`).
  loadSentry()
    .then(({ captureMessage }) =>
      captureMessage('db.silent_connection_cut', { level: 'error', tags: { pool } }),
    )
    .catch(() => {})
}
