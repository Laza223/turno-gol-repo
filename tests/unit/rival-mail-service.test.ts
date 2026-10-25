import { beforeEach, describe, expect, it, vi } from 'vitest'

// Ventana silenciosa 00-08 ART y blindaje del scheduler de los mails de RIVAL. Sin DB: la
// revalidación contra la base está en tests/integration/rival-mail.test.ts.

const send = vi.fn()
const getBoss = vi.fn()
const captureException = vi.fn()
const getWorkerSql = vi.fn(() => {
  throw new Error('no debería tocar la base dentro de la ventana')
})
const getWorkerDb = vi.fn(() => {
  throw new Error('no debería tocar la base dentro de la ventana')
})

vi.mock('@/shared/jobs/boss', () => ({ getBoss: (...a: unknown[]) => getBoss(...a) }))
vi.mock('@/lib/sentry', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))
vi.mock('@/shared/db/client', () => ({
  getWorkerSql: () => getWorkerSql(),
  getWorkerDb: () => getWorkerDb(),
}))

import { processRivalMailJob, scheduleRivalMail } from '@/modules/rival/rival-mail.service'
import { QUEUE_RIVAL_MAIL, RIVAL_MAIL_SEND_OPTIONS } from '@/shared/jobs/definitions'

const JOB = { type: 'canceled', matchId: '11111111-1111-4111-8111-111111111111' } as const
// ART = UTC-3 sin DST.
const at = (iso: string) => new Date(iso)

beforeEach(() => {
  vi.clearAllMocks()
  send.mockResolvedValue('job-id')
  getBoss.mockResolvedValue({ send })
})

describe('scheduleRivalMail: ventana silenciosa', () => {
  it.each([
    ['23:59 ART', '2026-10-25T02:59:00Z', null],
    ['00:00 ART', '2026-10-24T03:00:00Z', '2026-10-24T11:00:00.000Z'],
    ['07:59 ART', '2026-10-24T10:59:00Z', '2026-10-24T11:00:00.000Z'],
    ['08:00 ART', '2026-10-24T11:00:00Z', null],
    ['12:00 ART', '2026-10-24T15:00:00Z', null],
  ])('%s', async (_label, now, expectedStartAfter) => {
    await scheduleRivalMail(JOB, at(now))
    expect(send).toHaveBeenCalledTimes(1)
    const [queue, data, opts] = send.mock.calls[0]!
    expect(queue).toBe(QUEUE_RIVAL_MAIL)
    expect(data).toEqual(JOB)
    expect(opts).toMatchObject(RIVAL_MAIL_SEND_OPTIONS)
    if (expectedStartAfter === null) {
      expect(opts).not.toHaveProperty('startAfter')
    } else {
      expect((opts as { startAfter: Date }).startAfter.toISOString()).toBe(expectedStartAfter)
    }
  })

  it('no lanza si boss.send falla: lo manda a Sentry y sigue', async () => {
    send.mockRejectedValue(new Error('pg-boss caído'))
    await expect(scheduleRivalMail(JOB, at('2026-10-24T15:00:00Z'))).resolves.toBeUndefined()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('no lanza si ni siquiera arranca pg-boss', async () => {
    getBoss.mockRejectedValue(new Error('sin conexión'))
    await expect(scheduleRivalMail(JOB, at('2026-10-24T15:00:00Z'))).resolves.toBeUndefined()
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})

describe('processRivalMailJob: defensa de ventana', () => {
  it('despertado dentro de la ventana re-difiere el mismo job y no toca la base', async () => {
    await processRivalMailJob(JOB, at('2026-10-24T06:00:00Z')) // 03:00 ART
    expect(send).toHaveBeenCalledTimes(1)
    const [queue, data, opts] = send.mock.calls[0]!
    expect(queue).toBe(QUEUE_RIVAL_MAIL)
    expect(data).toEqual(JOB)
    expect((opts as { startAfter: Date }).startAfter.toISOString()).toBe('2026-10-24T11:00:00.000Z')
    expect(getWorkerSql).not.toHaveBeenCalled()
    expect(getWorkerDb).not.toHaveBeenCalled()
  })
})
