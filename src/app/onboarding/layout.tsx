import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { WizardMotionProvider } from './motion-provider'
import { WizardChrome } from './components/WizardChrome'

export const metadata: Metadata = {
  title: 'Configurá tu complejo',
  robots: { index: false, follow: false },
}

/**
 * Gate de sesión para TODO el árbol `/onboarding/*` — mismo patrón y mismo
 * motivo que `(public)/[slug]/layout.tsx` (🔴 QA 2026-08-13, encontrado de
 * nuevo acá en la verificación adversarial de Fase 9): `loading.tsx` mete un
 * `<Suspense>` alrededor de cada page, Next arranca a streamear la respuesta
 * —con el 200 ya emitido— y para cuando `page.tsx`/`[paso]/page.tsx`/
 * `listo/page.tsx` llaman `redirect('/login')` el status HTTP ya no se puede
 * cambiar: un visitante sin sesión (o un monitor/crawler) recibe 200 con el
 * chrome del wizard vacío en vez de un 307 real a `/login`. El layout
 * renderiza FUERA de ese boundary, así que acá el `redirect()` llega a
 * tiempo.
 *
 * Solo chequea SESIÓN (staff autenticado). Cada page sigue llamando
 * `extractAuthUser()` por su cuenta para el `staffUserId` que necesita —
 * está memoizada con `cache()`, así que no es un segundo viaje real (mismo
 * criterio que `getPublicTenant` en el layout de `[slug]`). El resto de las
 * validaciones (tenant existente, paso válido, onboarding ya completo) sigue
 * en cada page: no son uniformes entre `page.tsx`, `[paso]/page.tsx` y
 * `listo/page.tsx` — `listo` justamente exige `onboarding_completed=true`,
 * lo inverso de los otros dos.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  return (
    <WizardMotionProvider>
      <WizardChrome>{children}</WizardChrome>
    </WizardMotionProvider>
  )
}
