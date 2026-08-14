import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { sanitizeNext } from '@/lib/safe-redirect'
import { acceptTermsAction } from './actions'
import { AceptarTerminosForm } from './AceptarTerminosForm'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ next?: string }> }

export default async function AceptarTerminosPage({ searchParams }: Props) {
  // Solo llega acá un jugador con sesión activa pero sin consentimiento
  // resuelto (ver provisionPlayerAndRedirect en el callback) — sin sesión de
  // jugador no hay nada que aceptar.
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const { next } = await searchParams
  const safeNext = sanitizeNext(next ?? null)

  return (
    <div
      className="flex min-h-dvh items-center justify-center px-4 py-12"
      style={{ background: '#020617' }}
    >
      <div className="w-full max-w-md">
        <AceptarTerminosForm action={acceptTermsAction} next={safeNext} />
      </div>
    </div>
  )
}
