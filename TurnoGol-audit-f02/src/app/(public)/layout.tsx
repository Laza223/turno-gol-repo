import type { ReactNode } from 'react'
import SiteNav from '@/components/site/SiteNav'
import SiteFooter from '@/components/site/SiteFooter'
import { LegalFooter } from '@/components/site/legal-footer'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <SiteNav variant="solid" />
      <main className="flex-1">{children}</main>
      <LegalFooter />
      <SiteFooter />
    </div>
  )
}
