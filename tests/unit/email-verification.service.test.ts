import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Simula la tabla staff_users con una sola fila. El SQL real (ventana de 48 h,
// borrado del hash) se mide contra Postgres local; acá se prueba la lógica de
// TypeScript alrededor: qué hash se guarda, qué se manda y cómo se mapea cada caso.
type Row = {
  id: string
  email: string
  verifiedAt: Date | null
  hash: string | null
  sentAt: Date | null
}
const { store, send, enforce, now } = vi.hoisted(() => ({
  store: { row: null as null | Row },
  send: vi.fn(async () => undefined),
  enforce: vi.fn(async () => ({ ok: true })),
  now: { value: new Date('2026-11-08T12:00:00Z') },
}))

const TTL_MS = 48 * 3600_000

vi.mock('@/shared/db/client', () => ({
  getWorkerSql:
    () =>
    async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = strings.join('?')
      const r = store.row
      if (text.includes('SET email_verify_token_hash =')) {
        if (!r || r.verifiedAt) return []
        r.hash = params[0] as string
        r.sentAt = now.value
        return [{ email: r.email }]
      }
      if (text.includes('SET email_verified_at = now()')) {
        const fresh = r?.sentAt && now.value.getTime() - r.sentAt.getTime() < TTL_MS
        if (r && r.hash === params[0] && fresh) {
          r.verifiedAt = now.value
          r.hash = null
          return [{ id: r.id }]
        }
        return []
      }
      if (text.includes('WHERE email_verify_token_hash =')) {
        return r && r.hash === params[0] ? [{ id: r.id }] : []
      }
      if (text.includes('email_verified_at IS NOT NULL) AS verified')) {
        return r ? [{ email: r.email, verified: r.verifiedAt !== null }] : []
      }
      throw new Error(`SQL no simulado: ${text}`)
    },
}))
vi.mock('@/shared/rate-limit/apply', () => ({ enforce }))
vi.mock('@/modules/notifications/email.provider', () => ({
  getEmailProvider: () => ({ send }),
}))

import {
  consumeVerificationToken,
  requireVerifiedOwnerEmail,
  sendVerificationEmail,
} from '@/modules/auth/email-verification.service'

function tokenFromLastMail(): string {
  const calls = send.mock.calls as unknown as Array<[{ text: string }]>
  const text = calls[calls.length - 1][0].text
  const match = /token=([A-Za-z0-9_-]+)/.exec(text)
  if (!match) throw new Error('el mail no trae token')
  return match[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  now.value = new Date('2026-11-08T12:00:00Z')
  store.row = { id: 's1', email: 'dueno@complejo.com', verifiedAt: null, hash: null, sentAt: null }
  enforce.mockResolvedValue({ ok: true })
})

describe('sendVerificationEmail', () => {
  it('guarda solo el sha256 y manda el token crudo por mail', async () => {
    const res = await sendVerificationEmail('s1')

    expect(res).toEqual({ ok: true })
    const token = tokenFromLastMail()
    expect(token).toHaveLength(43)
    expect(store.row?.hash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(store.row?.hash).not.toContain(token)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'dueno@complejo.com' }))
  })

  it('un reenvío invalida el link anterior', async () => {
    await sendVerificationEmail('s1')
    const first = tokenFromLastMail()
    await sendVerificationEmail('s1')

    expect(await consumeVerificationToken(first)).toEqual({ ok: false, reason: 'invalid' })
    expect(await consumeVerificationToken(tokenFromLastMail())).toEqual({ ok: true })
  })

  it('si el rate limit corta, no genera token ni manda mail', async () => {
    enforce.mockResolvedValueOnce({ ok: false })

    expect(await sendVerificationEmail('s1')).toEqual({ ok: false, reason: 'rate_limited' })
    expect(store.row?.hash).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it('una cuenta ya verificada no recibe mail', async () => {
    if (store.row) store.row.verifiedAt = new Date()

    expect(await sendVerificationEmail('s1')).toEqual({ ok: false, reason: 'already_verified' })
    expect(send).not.toHaveBeenCalled()
  })

  it('si Resend falla devuelve send_failed sin lanzar', async () => {
    send.mockRejectedValueOnce(new Error('resend down'))

    expect(await sendVerificationEmail('s1')).toEqual({ ok: false, reason: 'send_failed' })
  })
})

describe('consumeVerificationToken', () => {
  it('token válido: verifica la cuenta y borra el hash', async () => {
    await sendVerificationEmail('s1')

    expect(await consumeVerificationToken(tokenFromLastMail())).toEqual({ ok: true })
    expect(store.row?.verifiedAt).not.toBeNull()
    expect(store.row?.hash).toBeNull()
  })

  it('token vencido (más de 48 h): expired y la cuenta sigue sin verificar', async () => {
    await sendVerificationEmail('s1')
    now.value = new Date(now.value.getTime() + TTL_MS + 1000)

    expect(await consumeVerificationToken(tokenFromLastMail())).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(store.row?.verifiedAt).toBeNull()
  })

  it('token reusado: invalid', async () => {
    await sendVerificationEmail('s1')
    const token = tokenFromLastMail()
    await consumeVerificationToken(token)

    expect(await consumeVerificationToken(token)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('hash inexistente: invalid', async () => {
    expect(await consumeVerificationToken('x'.repeat(43))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('requireVerifiedOwnerEmail', () => {
  it('rechaza con el mensaje cuando el mail no está verificado', async () => {
    expect(await requireVerifiedOwnerEmail('s1')).toEqual({
      ok: false,
      error: 'Confirmá tu mail para activar el plan.',
    })
  })

  it('deja pasar cuando está verificado', async () => {
    if (store.row) store.row.verifiedAt = new Date()

    expect(await requireVerifiedOwnerEmail('s1')).toEqual({ ok: true })
  })

  it('rechaza si la cuenta no existe (fail closed)', async () => {
    store.row = null

    expect((await requireVerifiedOwnerEmail('s1')).ok).toBe(false)
  })
})
