import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { encrypt } from '@/lib/crypto/encrypt'
import {
  connectMercadoPago,
  completeOnboarding,
  findTenantUsingMpAccount,
  getTenantById,
  updateTenantSettings,
} from '@/modules/tenants/tenant.service'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffRole } from '@/modules/staff/staff.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MpTokenResponse = {
  access_token: string
  refresh_token: string
  user_id: number
  public_key: string
}

/**
 * Nombre visible de la cuenta de MP recién conectada.
 *
 * Existe para que la pantalla pueda decir CUÁL cuenta quedó conectada. Antes
 * solo se guardaba un booleano, así que el dueño que tenía abierto su
 * MercadoPago personal lo conectaba de un clic —MP no vuelve a pedir permiso
 * si la app ya está autorizada— y las señas empezaban a caer en la cuenta
 * equivocada sin que nada se lo dijera.
 *
 * NO es fatal: si esta llamada falla, la conexión se guarda igual y la UI cae
 * al `mp_user_id`. Perder el apodo no justifica perder la conexión.
 *
 * Se guarda el nickname y NO el email: identifica igual de bien a la cuenta y
 * es un dato público de MercadoPago, no un dato personal (Ley 25.326, doc18).
 */
async function fetchMpNickname(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const me = (await res.json()) as { nickname?: string }
    return me.nickname ?? null
  } catch {
    return null
  }
}

const querySchema = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(1024),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
  })

  if (!parsed.success) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_missing_params', req.url),
    )
  }
  const { code, state } = parsed.data

  // Verify CSRF state
  const secret = process.env.MP_CLIENT_SECRET ?? ''
  const dot = state.indexOf('.')
  if (dot < 0) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }
  const payload = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }

  // Decode tenantId + issued-at timestamp from the state payload.
  // Formato (ver oauth-start/route.ts): base64url(`${tenantId}:${Date.now()}`)
  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  const [tenantId, tsRaw] = decoded.split(':')
  if (!tenantId || !tsRaw) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }

  // El `state` firmado solo prueba que ESTE navegador inició un oauth-start
  // válido (protege contra CSRF), pero no prueba identidad ni rol — si el link
  // de callback llegara a filtrarse (queda en logs/Referer/historial, ver nota
  // de anti-replay abajo), cualquiera con la URL podría completar la conexión
  // de MP del tenant. Revalidamos acá que quien la completa es un admin
  // autenticado de ESE mismo tenant (audit_report.md 3-15).
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId || user.tenantId !== tenantId) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  const role = await getStaffRole(tenantId, user.staffUserId)
  if (role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard?error=mp_forbidden', req.url))
  }

  // Anti-replay (#10): el state va por la URL de redirect de MP (queda en logs,
  // historial, Referer). El ts esta firmado por HMAC, asi que solo lo evaluamos
  // sobre payloads con firma valida. Rechazar states expirados o con ts futuro.
  const issuedAt = Number(tsRaw)
  const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutos
  const age = Date.now() - issuedAt
  if (!Number.isFinite(issuedAt) || age < 0 || age > STATE_TTL_MS) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_invalid_state', req.url),
    )
  }

  // Exchange code for token — require APP_URL (no req.url origin fallback to
  // avoid host-header injection into the OAuth redirect_uri).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_config_missing', req.url),
    )
  }
  const redirectUri = `${appUrl}/api/mp/callback`
  const clientId = process.env.MP_CLIENT_ID ?? ''

  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL('/onboarding?error=mp_token_failed', req.url),
    )
  }

  const tokenData = (await tokenRes.json()) as MpTokenResponse
  const mpUserId = String(tokenData.user_id)

  // Una cuenta de MercadoPago cobra para UN solo complejo (migr. 069). El
  // índice único es la red ante dos requests simultáneos; este chequeo existe
  // para cortar antes y poder decir con cuál complejo choca.
  //
  // Por qué hace falta un chequeo explícito: MercadoPago guarda el
  // consentimiento por (usuario, aplicación), no por complejo. A partir de la
  // segunda vez conecta sin volver a preguntar nada, así que sin esto la misma
  // cuenta se enchufa a N complejos con un clic y sin ninguna pantalla de por
  // medio — pasó en producción el 2026-07-31.
  const ocupada = await findTenantUsingMpAccount(mpUserId, tenantId)
  if (ocupada) {
    return NextResponse.redirect(
      new URL(
        `/onboarding?error=mp_already_connected&complejo=${encodeURIComponent(ocupada.name)}`,
        req.url,
      ),
    )
  }

  await connectMercadoPago(tenantId, {
    mpAccessToken: encrypt(tokenData.access_token),
    mpRefreshToken: encrypt(tokenData.refresh_token),
    mpUserId,
    mpPublicKey: tokenData.public_key,
    mpNickname: await fetchMpNickname(tokenData.access_token),
  })

  // Flujo wizard vs reconexión (pages/onboarding.md §6.3): llegar acá desde el
  // paso "¿Cobrás seña?" es la elección explícita "Sí" → se activa la seña y el
  // wizard cierra en su momento peak-end. Una reconexión posterior NO toca
  // requires_deposit (respeta lo que el admin haya configurado).
  const tenant = await getTenantById(tenantId)
  const onboardingDone = tenant?.settings.onboarding_completed === true
  if (onboardingDone) {
    return NextResponse.redirect(new URL('/settings/facturacion', req.url))
  }

  await updateTenantSettings(tenantId, { requires_deposit: true })
  await completeOnboarding(tenantId)

  return NextResponse.redirect(new URL('/onboarding/listo', req.url))
}
