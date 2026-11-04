// Excepción legítima a `turnogol/jobs-worker-pool`: el schema `pgboss` de la 9 es de
// `turnogol_app` (migración 039) y `pgboss_v12` también (104); no son tablas de tenant, así
// que no hay RLS que pueda esconder filas en silencio. Tiene que ser UN rol y UNA transacción
// para que el insert en la 12 y el borrado en la 9 sean todo o nada.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getSql } from '@/shared/db/client'
import type { PgBoss } from 'pg-boss'
import { logger } from '@/shared/lib/logger'
import {
  QUEUE_EXPIRE_PENDING_BOOKING,
  QUEUE_PUSH_SEND,
  QUEUE_RIVAL_MAIL,
  QUEUE_SEND_EMAIL,
} from './definitions'
import { QUEUE_PROCESS_MP_WEBHOOK } from './queue-names'

/**
 * Puente de la migración pg-boss 9 → 12: mueve al schema `pgboss_v12` los jobs que hayan
 * quedado pendientes en el schema viejo `pgboss`.
 *
 * ─── Por qué existe ──────────────────────────────────────────────────────────
 *
 * La 12 no migra un schema de la 9 (ver migración 104), así que al desplegar queda un schema
 * viejo con jobs sin correr —webhooks de MP, mails, pushes, vencimientos de reserva— que el
 * worker nuevo ya no mira. Perderlos es plata (un webhook de pago) o una reserva que no vence.
 *
 * ─── Cómo es seguro ──────────────────────────────────────────────────────────
 *
 * Una pasada es UNA transacción: `SELECT … FOR UPDATE SKIP LOCKED` sobre los pendientes de la
 * 9, `insert` en la 12 con el mismo id por la MISMA transacción (`db.executeSql`) y `DELETE`
 * de la 9. Todo o nada. El `FOR UPDATE SKIP LOCKED` es lo que impide que un job corra en los
 * DOS workers durante el solapamiento del deploy: el worker viejo de la 9 lo reclama con el
 * mismo `SKIP LOCKED`, así que o lo agarra uno o lo agarra el otro, nunca los dos. Medido con
 * el worker viejo consumiendo a la vez: 450 jobs, 0 duplicados, 0 perdidos, 0 pendientes.
 *
 * Colas: solo las que llevan datos. NO los crons (la 12 los vuelve a agendar solos) ni
 * `whatsapp-turn` (el rescate `whatsapp-turn-rescue` re-encola todo entrante sin procesar, y
 * su `singletonKey` chocaría con la política `stately`). Los ticks de cron de `send-email`
 * (`data = '{}'`) tampoco se mueven.
 *
 * Esto se borra junto con el schema `pgboss` en el PR de limpieza.
 */

export const LEGACY_DRAIN_QUEUES = [
  QUEUE_PROCESS_MP_WEBHOOK,
  QUEUE_SEND_EMAIL,
  QUEUE_PUSH_SEND,
  QUEUE_EXPIRE_PENDING_BOOKING,
  QUEUE_RIVAL_MAIL,
] as const

const BATCH_LIMIT = 500
const PASS_INTERVAL_MS = 60_000
const PASS_COUNT = 60
const MAX_EXPIRE_SECONDS = 24 * 3600

/** Columnas de la 9 en minúscula (las creaba sin comillas); castear acá evita los parsers de drizzle. */
type LegacyRow = {
  id: string
  name: string
  data_json: string | null
  priority: number
  retrylimit: number
  retrycount: number
  retrydelay: number
  retrybackoff: boolean
  start_after_ms: string | number
  singletonkey: string | null
  expire_seconds: number | null
}

/** `42P01` = tabla inexistente, `3F000` = schema inexistente: local/CI nuevos, sin nada que mover. */
function isMissingLegacySchema(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return code === '42P01' || code === '3F000'
}

/** Una pasada. Devuelve cuántos jobs movió. */
export async function drainLegacyV9Once(boss: PgBoss): Promise<number> {
  try {
    return await getSql().begin(async (tx) => {
      const rows = await tx<LegacyRow[]>`
        SELECT id, name, data::text AS data_json, priority, retrylimit, retrycount, retrydelay,
               retrybackoff, (EXTRACT(EPOCH FROM startafter) * 1000)::bigint AS start_after_ms,
               singletonkey, EXTRACT(EPOCH FROM expirein)::int AS expire_seconds
        FROM pgboss.job
        WHERE name = ANY(${[...LEGACY_DRAIN_QUEUES]})
          AND state IN ('created', 'retry')
          AND NOT (name = ${QUEUE_SEND_EMAIL} AND data = '{}'::jsonb)
        ORDER BY createdon
        LIMIT ${BATCH_LIMIT}
        FOR UPDATE SKIP LOCKED
      `
      if (rows.length === 0) return 0

      const db = {
        executeSql: async (text: string, values?: unknown[]) => ({
          rows: await tx.unsafe(text, (values ?? []) as never[]),
        }),
      }

      const byQueue = new Map<string, LegacyRow[]>()
      for (const row of rows) byQueue.set(row.name, [...(byQueue.get(row.name) ?? []), row])

      for (const [name, group] of byQueue) {
        await boss.insert(
          name,
          group.map((r) => ({
            id: r.id,
            data: r.data_json === null ? undefined : (JSON.parse(r.data_json) as object),
            priority: r.priority,
            // Los reintentos que le quedaban, no los originales.
            retryLimit: Math.max(r.retrylimit - r.retrycount, 0),
            retryDelay: r.retrydelay,
            retryBackoff: r.retrybackoff,
            startAfter: new Date(Number(r.start_after_ms)),
            singletonKey: r.singletonkey ?? undefined,
            expireInSeconds: Math.min(Math.max(r.expire_seconds ?? 900, 1), MAX_EXPIRE_SECONDS),
          })),
          { db },
        )
      }

      // Después de TODOS los inserts y en la misma transacción: si uno falla, no se borra nada.
      await tx`DELETE FROM pgboss.job WHERE id = ANY(${rows.map((r) => r.id)}::uuid[])`
      return rows.length
    })
  } catch (err) {
    if (isMissingLegacySchema(err)) return 0
    throw err
  }
}

/**
 * Una pasada al arrancar y otra cada 60 s durante 60 min (cubre el solapamiento del deploy y
 * los jobs diferidos que se despiertan después). Nunca tira: una pasada que falla se loguea y
 * la siguiente reintenta. Devuelve el `stop()` para el shutdown.
 */
export function startLegacyV9Drain(boss: PgBoss): () => void {
  let passes = 0
  let running = false
  let timer: NodeJS.Timeout | null = null

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const tick = async () => {
    if (running) return
    running = true
    try {
      let moved: number
      do {
        moved = await drainLegacyV9Once(boss)
        if (moved > 0) {
          logger.info('legacy-v9-drain: jobs movidos al schema nuevo', {
            module: 'workers',
            moved,
          })
        }
      } while (moved >= BATCH_LIMIT)
    } catch (err) {
      logger.warn('legacy-v9-drain: la pasada falló, se reintenta en la próxima', {
        module: 'workers',
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      running = false
    }
    passes += 1
    if (passes >= PASS_COUNT) stop()
  }

  void tick()
  timer = setInterval(() => void tick(), PASS_INTERVAL_MS)
  timer.unref()
  return stop
}
