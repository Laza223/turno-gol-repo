import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import PortalShell from '@/components/site/PortalShell'

export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') {
    redirect('/ingresar')
  }

  return <PortalShell>{children}</PortalShell>
}
