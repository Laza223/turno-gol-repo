import type { ReactNode } from 'react'
import PortalShell from '@/components/site/PortalShell'
import { signOutAction } from '@/modules/auth/sign-out.action'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <PortalShell signOutAction={signOutAction}>{children}</PortalShell>
    </div>
  )
}
