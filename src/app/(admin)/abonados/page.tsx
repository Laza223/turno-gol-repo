import Link from 'next/link'
import { redirect } from 'next/navigation'
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Abonados</h1>
        <a
          href="/abonados/nuevo"
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + Nuevo Abonado
        </a>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/abonados"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !statusFilter
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
