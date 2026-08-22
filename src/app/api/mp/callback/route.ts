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
import { track } from '@/shared/observability/breadcrumbs'
import { logger } from '@/shared/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MpTokenResponse = {
  access_token: string
  refresh_token: string
  user_id: number
  public_key: string
  /**
   * Permisos que MercadoPago EFECTIVAMENTE otorgó a este token (`offline_access`,
   * `read`, `write`). Se descartaba, y esa era la pieza que faltaba para
   * diagnosticar el 403 `At least one policy returned UNAUTHORIZED` que
   * devuelve todo intento de reembolso: el mismo token cobra bien y no puede
   * devolver, y sin este dato no había forma de saber con qué alcance quedó.
   */
  scope?: string
  expires_in?: number
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
    return NextResponse.redirect(new URL('/settings/facturacion?error=mp_missing_params', req.url))
  }
  const { code, state } = parsed.data

  // Verify CSRF state
  const secret = process.env.MP_CLIENT_SECRET ?? ''
  const dot = state.indexOf('.')
  if (dot < 0) {
    return NextResponse.redirect(new URL('/settings/facturacion?error=mp_invalid_state', req.url))
  }
  const payload = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.redirect(new URL('/settings/facturacion?error=mp_invalid_state', req.url))
  }

  // Decode tenantId + issued-at timestamp from the state payload.
  // Formato (ver oauth-start/route.ts): base64url(`${tenantId}:${Date.now()}`)
  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  const [tenantId, tsRaw] = decoded.split(':')
  if (!tenantId || !tsRaw) {
    return NextResponse.redirect(new URL('/settings/facturacion?error=mp_invalid_state', req.url))
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
    return NextResponse.redirect(new URL('/settings/facturacion?error=mp_invalid_state', req.url))
  }

  // Exchange code for token — require APP_URL (no req.url origin fallback to
  // avoid host-header injection into the OAuth redirect_uri).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return NextResponse.redirect(new URL('/settings/facturacion?error=mp_config_missing', req.url))
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
    return NextResponse.redirect(new URL('/settings/facturacion?error=mp_token_failed', req.url))
  }

  const tokenData = (await tokenRes.json()) as MpTokenResponse
  const mpUserId = String(tokenData.user_id)

  // Sólo el alcance y la vigencia — NUNCA el token ni el refresh. `logger.error`
  // no: esto no es un fallo. Va a stderr igual por ser un dato que hay que poder
  // leer en los logs de Vercel cuando un complejo reporta que no puede devolver.
  logger.info('mp oauth: token emitido', {
    module: 'mp-oauth',
    tenantId,
    mpUserId,
    scope: tokenData.scope ?? '(MercadoPago no devolvió scope)',
    expiresInDays:
      typeof tokenData.expires_in === 'number' ? Math.round(tokenData.expires_in / 86_400) : null,
  })

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
        `/settings/facturacion?error=mp_already_connected&complejo=${encodeURIComponent(ocupada.name)}`,
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
  // `fromChecklist: true` siempre desde la Fase 5: el único punto de entrada
  // real a este callback es /settings/facturacion (ver el comentario de abajo).
  track.onboarding('onboarding.mp.connected', { tenantId, fromChecklist: true })

  // Desde la Fase 5 del refactor de onboarding, conectar MP se movió del
  // wizard (viejo paso "¿Cobrás seña?") a /settings/facturacion — el ÚNICO
  // punto de entrada real a `/api/mp/oauth-start` es esa pantalla, y llegar
  // ahí ya exige `onboarding_completed` ((admin)/layout.tsx). La rama
  // `!onboardingDone` de abajo queda por compatibilidad con una sesión que
  // haya iniciado el OAuth desde el wizard viejo justo antes de este deploy
  // (state firmado con TTL de 10 min): activa la seña y cierra el onboarding
  // como hacía el paso que ya no existe. Una reconexión posterior (la rama de
  // arriba) NO toca requires_deposit — respeta lo que el admin haya configurado.
  const tenant = await getTenantById(tenantId)
  const onboardingDone = tenant?.settings.onboarding_completed === true
  if (onboardingDone) {
    return NextResponse.redirect(new URL('/settings/facturacion', req.url))
  }

  await updateTenantSettings(tenantId, { requires_deposit: true })
  await completeOnboarding(tenantId)

  return NextResponse.redirect(new URL('/onboarding/listo', req.url))
}
