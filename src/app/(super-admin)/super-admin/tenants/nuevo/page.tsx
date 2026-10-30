import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { absoluteUrl } from '@/lib/seo/metadata'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { createAssistedTenantAction } from '../actions'
import { AssistedSignupForm } from './_components/assisted-signup-form'

export const dynamic = 'force-dynamic'

/** Alta asistida de un complejo (decisión 2026-10-22). */
export default async function SuperAdminNewTenantPage() {
  await requireSystemAdmin()

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        variant="plain"
        title="Dar de alta un complejo"
        subtitle="Creás la cuenta del dueño y el complejo, con 30 días de prueba. Horarios y canchas los carga el dueño."
        back={
          <Link
            href="/super-admin/tenants"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Complejos
          </Link>
        }
        icon={
          <Building2
            className="h-6 w-6 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
        }
      />

      <AssistedSignupForm action={createAssistedTenantAction} loginUrl={absoluteUrl('/login')} />
    </div>
  )
}
