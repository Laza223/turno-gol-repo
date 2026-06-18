import { Resend } from 'resend'

export interface EmailProvider {
  send(params: { to: string; subject: string; html: string; text?: string }): Promise<void>
}

let _provider: EmailProvider | null = null

export function setEmailProvider(p: EmailProvider): void {
  _provider = p
}

export function resetEmailProvider(): void {
  _provider = null
}

export function getEmailProvider(): EmailProvider {
  if (_provider) return _provider
  const resend = new Resend(process.env.RESEND_API_KEY ?? '')
  const provider: EmailProvider = {
    send: async ({ to, subject, html }) => {
      const { error } = await resend.emails.send({
        from: 'TurnoGol <no-reply@turnogol.app>',
        to,
        subject,
        html,
      })
      if (error) throw new Error(`Resend error: ${error.message}`)
    },
  }
  _provider = provider
  return provider
}
