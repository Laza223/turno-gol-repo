import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { consumeVerificationToken } from '@/modules/auth/email-verification.service'
import { escapeHtml } from '@/modules/notifications/templates/html-escape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 32 bytes en base64url = 43 caracteres.
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

const ERROR_COPY = {
  expired: 'El link venció. Entrá a tu panel y tocá "Reenviar mail" para recibir uno nuevo.',
  invalid:
    'Este link ya se usó o no es válido. Si todavía ves el aviso en tu panel, tocá "Reenviar mail".',
} as const

function errorPage(message: string): NextResponse {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Confirmá tu mail</title></head><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">No pudimos confirmar tu mail</h1><p>${escapeHtml(message)}</p><p><a href="/login">Ir a mi cuenta</a></p></body></html>`
  return new NextResponse(html, {
    status: 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Link del mail de verificación del dueño. No crea sesión: solo marca el mail como
 * probado. Con sesión abierta vuelve al panel; sin ella, al login. El GET cambia
 * estado (es el link de un mail), pero el token es de un solo uso y de 256 bits.
 * Un escáner de links del correo puede consumirlo antes que la persona: en ese caso
 * el mail queda verificado igual, que es lo que se busca.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = tokenSchema.safeParse(req.nextUrl.searchParams.get('token'))
  if (!parsed.success) return errorPage(ERROR_COPY.invalid)

  const result = await consumeVerificationToken(parsed.data)
  if (!result.ok) return errorPage(ERROR_COPY[result.reason])

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const target = data.user ? '/dashboard?mail=ok' : '/login'
  const res = NextResponse.redirect(new URL(target, req.url))
  res.headers.set('cache-control', 'no-store')
  return res
}
