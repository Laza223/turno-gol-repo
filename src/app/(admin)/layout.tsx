import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { ReactNode } from 'react'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') {
    redirect('/login')
  }
  return <>{children}</>
}
