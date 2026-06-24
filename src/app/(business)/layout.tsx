import type { ReactNode } from 'react'
import BusinessHeader from '@/components/site/BusinessHeader'
import BusinessFooter from '@/components/site/BusinessFooter'

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <BusinessHeader />
      <main id="main-content">{children}</main>
      <BusinessFooter />
    </div>
  )
}
