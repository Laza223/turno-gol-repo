import { describe, expect, it } from 'vitest'
import {
  QUEUE_DEFINITIONS,
  QUEUE_WHATSAPP_TURN,
  whatsappTurnSendOptions,
} from '@/shared/jobs/definitions'

describe('whatsappTurnSendOptions', () => {
  // Un reintento de pg-boss competiría con el cron de rescate por el mismo chat:
  // el reintento real es `whatsapp-turn-rescue`.
  it('sin reintentos de pg-boss: el reintento es el cron de rescate', () => {
    expect(whatsappTurnSendOptions('chat-1')).toMatchObject({ retryLimit: 0 })
  })

  it('un job por chat, con debounce y vencimiento de 15 min; sin las opciones de la 9', () => {
    const options = whatsappTurnSendOptions('chat-1')
    expect(options).toEqual({
      singletonKey: 'chat-1',
      startAfter: 4,
      retryLimit: 0,
      expireInSeconds: 900,
    })
    // La 12 las ignora EN SILENCIO: no pueden volver.
    expect(options).not.toHaveProperty('useSingletonQueue')
    expect(options).not.toHaveProperty('onComplete')
    expect(options).not.toHaveProperty('expireInMinutes')
  })

  it('la cola es stately (1 esperando + 1 corriendo por chat) y manda sus fallos a la DLQ', () => {
    const def = QUEUE_DEFINITIONS.find((q) => q.name === QUEUE_WHATSAPP_TURN)
    expect(def?.options).toMatchObject({
      policy: 'stately',
      retryLimit: 0,
      expireInSeconds: 900,
      deadLetter: 'dead-letter',
    })
  })
})
