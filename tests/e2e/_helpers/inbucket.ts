/**
 * Mails de Supabase local vía la REST API de Inbucket (:54324, bundlada con `supabase start`).
 * Lo comparten los specs que entran por magic link de verdad.
 */

const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324'

type InboxListEntry = { id: string; date: string }
type InboxMessage = { body?: { text?: string; html?: string } }

function mailboxOf(email: string): string {
  return email.split('@')[0]!.toLowerCase()
}

/**
 * Lee el mail más reciente llegado a `email` después de `sinceMs` y devuelve la URL del magic link
 * (`.../api/auth/callback?...&token_hash=...`). Espera hasta 20 s a que llegue.
 */
export async function fetchMagicLinkFromInbucket(email: string, sinceMs: number): Promise<string> {
  const mailbox = mailboxOf(email)
  const deadline = Date.now() + 20_000
  let lastErr: unknown

  while (Date.now() < deadline) {
    try {
      const listRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`)
      if (listRes.ok) {
        const messages = (await listRes.json()) as InboxListEntry[]
        const fresh = messages.filter((m) => new Date(m.date).getTime() >= sinceMs - 2000)
        const latest = fresh[fresh.length - 1]
        if (latest) {
          const msgRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${latest.id}`)
          if (msgRes.ok) {
            const msg = (await msgRes.json()) as InboxMessage
            const raw = msg.body?.text || msg.body?.html || ''
            const match = /https?:\/\/[^\s"<]+\/api\/auth\/callback\?[^\s"<]+/.exec(raw)
            if (match) return match[0].replace(/&amp;/g, '&')
          }
        }
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(
    `fetchMagicLinkFromInbucket: no llegó mail a ${email} (mailbox=${mailbox}) en 20s. Último error: ${String(lastErr)}`,
  )
}
