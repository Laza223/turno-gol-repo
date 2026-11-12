import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { referralCodeSchema } from '@/modules/referrals/referral.schema'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { signUpWithMailAction, startGoogleOwnerSignupAction } from './actions'
import { searchSignupAddressAction } from './geocode-action'
import { SignupFlow } from './SignupFlow'

export const metadata: Metadata = {
  title: 'Creá tu complejo',
  description: 'Cargá tu complejo en pocos toques y probalo 30 días sin costo.',
}

const PLAYER_ACCOUNT_ERROR =
  'Ese mail ya es de una cuenta de jugador. Usá otro mail para tu complejo.'

const GOOGLE_FAILED_ERROR = 'No pudimos entrar con Google. Probá de nuevo o seguí con tu mail.'

function accountErrorFor(code: string | undefined): string | null {
  if (code === 'player_account') return PLAYER_ACCOUNT_ERROR
  if (code === 'oauth_failed' || code === 'provision_failed') return GOOGLE_FAILED_ERROR
  return null
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string; error?: string }>
}) {
  const sp = await searchParams

  // Quien ya tiene complejo no vuelve a darlo de alta: va a su panel.
  const user = await extractAuthUser()
  if (user?.type === 'staff' && user.staffUserId) {
    const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
    if (tenant) redirect('/dashboard')
  }

  // Programa de referidos (B2): `?ref=` de la landing `/r/<CODE>` o de un link
  // compartido directo. Formato inválido se descarta en silencio; el flujo igual
  // cae al código guardado en localStorage, si hay.
  const refParsed = typeof sp?.ref === 'string' ? referralCodeSchema.safeParse(sp.ref) : null
  const refCode = refParsed?.success ? refParsed.data : null

  return (
    <SignupFlow
      signUpAction={signUpWithMailAction}
      googleAction={startGoogleOwnerSignupAction}
      geocodeAction={searchSignupAddressAction}
      refCode={refCode}
      inAppBrowser={isInAppBrowser((await headers()).get('user-agent'))}
      accountError={accountErrorFor(sp?.error)}
    />
  )
}
