import type { ReactNode } from 'react'
import PortalShell from '@/components/site/PortalShell'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <PortalShell>{children}</PortalShell>
    </div>
  )
}
