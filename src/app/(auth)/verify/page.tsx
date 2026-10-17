import { startGoogleLoginFromIngresar } from '@/app/(auth)/ingresar/actions'
import { VerifyView, type VerifySearchParams } from '@/app/(auth)/verify/VerifyView'

/**
 * Cascarón: resuelve la Promise de `searchParams` (Next 16) y delega en
 * `VerifyView`, que es lo que monta la story. La Server Action de Google se
 * importa ACÁ y baja por prop — ver el comentario de `VerifyView`.
 */
export default async function VerifyPage(props: { searchParams: Promise<VerifySearchParams> }) {
  return (
    <VerifyView
      searchParams={await props.searchParams}
      googleAction={startGoogleLoginFromIngresar}
    />
  )
}
