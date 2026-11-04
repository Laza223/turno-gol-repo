import type { PgBoss } from 'pg-boss'
import { logger } from '@/shared/lib/logger'
import { QUEUE_DEAD_LETTER, QUEUE_DEFINITIONS } from './definitions'

export type EnsureQueuesRole = 'producer' | 'worker'

/**
 * Deja creadas todas las colas de `QUEUE_DEFINITIONS`. pg-boss 12 tira
 * `PGBOSS_QUEUE_NOT_FOUND` en `send`/`schedule` si la cola no existe, y `createQueue`
 * es idempotente pero NO cambia las opciones de una cola existente.
 *
 * - `producer` (la web): solo crea las que faltan. No pisa nada: el que manda sobre las
 *   opciones es el worker.
 * - `worker`: además `updateQueue` de las existentes con las opciones del registro, así un
 *   cambio de `retryLimit`/`expireInSeconds`/`deadLetter` llega a las colas ya creadas. La
 *   `policy` no se puede cambiar en una cola existente: si difiere se loguea y se sigue.
 *
 * La DLQ se crea primero: `deadLetter` de `whatsapp-turn` la referencia.
 */
export async function ensureQueues(boss: PgBoss, role: EnsureQueuesRole): Promise<void> {
  const existing = new Map((await boss.getQueues()).map((q) => [q.name, q]))

  const dead = QUEUE_DEFINITIONS.find((q) => q.name === QUEUE_DEAD_LETTER)
  const ordered = [
    ...(dead ? [dead] : []),
    ...QUEUE_DEFINITIONS.filter((q) => q.name !== QUEUE_DEAD_LETTER),
  ]

  for (const { name, options } of ordered) {
    const current = existing.get(name)
    if (!current) {
      await boss.createQueue(name, options)
      continue
    }
    if (role !== 'worker') continue

    const { policy, partition: _partition, ...updatable } = options
    const wanted = policy ?? 'standard'
    if (current.policy !== wanted) {
      logger.error(
        'pg-boss: la política de la cola no coincide con el registro y no se puede cambiar',
        {
          module: 'pg-boss',
          queue: name,
          existing: current.policy,
          wanted,
        },
      )
    }
    await boss.updateQueue(name, updatable)
  }
}
