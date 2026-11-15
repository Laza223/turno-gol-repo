import { startGoogleLoginFromIngresar } from '@/app/(auth)/ingresar/actions'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { VerifyView, type VerifySearchParams } from '@/app/(auth)/verify/VerifyView'

/**
 * Cascarón: resuelve la Promise de `searchParams` (Next 16) y delega en
 * `VerifyView`, que es lo que monta la story. Las Server Actions (Google y salir) se
 * importan ACÁ y bajan por prop — ver el comentario de `VerifyView`.
 */
export default async function VerifyPage(props: { searchParams: Promise<VerifySearchParams> }) {
  return (
    <VerifyView
      searchParams={await props.searchParams}
      googleAction={startGoogleLoginFromIngresar}
      signOutAction={signOutAction}
    />
  )
}
