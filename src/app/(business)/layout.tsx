import type { ReactNode } from 'react'
import BusinessHeader from '@/components/site/BusinessHeader'
import BusinessFooter from '@/components/site/BusinessFooter'

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh text-slate-300" style={{ background: '#020617' }}>
      <BusinessHeader />
      <main id="main-content">{children}</main>
      <BusinessFooter />
    </div>
  )
}
