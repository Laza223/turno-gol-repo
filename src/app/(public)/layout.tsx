import type { ReactNode } from 'react'
import PortalShell from '@/components/site/PortalShell'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark">
      <PortalShell>{children}</PortalShell>
    </div>
  )
}
