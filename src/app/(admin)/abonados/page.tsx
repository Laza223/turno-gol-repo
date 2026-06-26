import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getAbonados } from '@/modules/abonados/abonado.service'
import type { AbonadoStatus } from '@/modules/abonados/abonado.types'
import { AbonadosList } from './AbonadosList'

const VALID_STATUSES: AbonadoStatus[] = ['active', 'paused', 'canceled']

const STATUS_LABELS: Record<AbonadoStatus, string> = {
  active: 'Activos',
  paused: 'Pausados',
  canceled: 'Cancelados',
}

export default async function AbonadosPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const statusFilter = VALID_STATUSES.includes(searchParams.status as AbonadoStatus)
    ? (searchParams.status as AbonadoStatus)
    : undefined

  const abonados = await withTenantContext(tenant.id, (tx) =>
    getAbonados(tenant.id, { status: statusFilter }, tx),
  )

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Abonados"
        icon={<Users className="h-6 w-6" aria-hidden="true" />}
        actions={
          <a
            href="/abonados/nuevo"
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            + Nuevo Abonado
          </a>
        }
      />

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/abonados"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !statusFilter
              ? 'bg-foreground text-background shadow-sm'
              : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          Todos
        </Link>
        {VALID_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/abonados?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-foreground text-background shadow-sm'
                : 'bg-muted text-foreground hover:bg-accent'
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <AbonadosList abonados={abonados} />
    </div>
  )
}
