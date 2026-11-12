import type { ReactNode } from 'react'
import { SiteHeaderShell } from '@/components/site/SiteHeaderShell'
import { SignupFrame } from '@/app/onboarding/components/SignupFrame'

/** Marco compartido de /register y /register/finalizar: header del sitio sobre el fondo oscuro del alta. */
export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <SignupFrame>
      <SiteHeaderShell />
      {children}
    </SignupFrame>
  )
}
