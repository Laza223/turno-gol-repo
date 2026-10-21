import { describe, expect, it } from 'vitest'
import { whatsappTurnSendOptions } from '@/shared/jobs/definitions'

describe('whatsappTurnSendOptions', () => {
  // Revisión adversarial: con la cola singleton, un reintento pasa el job de
  // `active` a `retry` y viola el índice único `job_singleton_queue` si ya hay
  // otro job del mismo chat esperando: el job queda `active` para siempre y el
  // `expire` de pg-boss falla en cada ciclo para todas las colas.
  it('sin reintentos de pg-boss: el reintento es el cron de rescate', () => {
    expect(whatsappTurnSendOptions('chat-1')).toMatchObject({ retryLimit: 0 })
  })

  it('cola singleton por chat, con debounce y visible para la DLQ', () => {
    expect(whatsappTurnSendOptions('chat-1')).toMatchObject({
      singletonKey: 'chat-1',
      useSingletonQueue: true,
      startAfter: 4,
      onComplete: true,
    })
  })
})
