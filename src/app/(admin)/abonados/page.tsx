import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getAbonados } from '@/modules/abonados/abonado.service'
import type { AbonadoStatus } from '@/modules/abonados/abonado.types'
import { AbonadosList } from './AbonadosList'
import { pauseAbonadoAction, reactivateAbonadoAction, cancelAbonadoAction } from './actions'
import { previewAbonadoSlotsAction } from './nuevo/actions'

const VALID_STATUSES: AbonadoStatus[] = ['active', 'paused', 'canceled']

const STATUS_LABELS: Record<AbonadoStatus, string> = {
  active: 'Fijos activos',
  paused: 'Pausados',
  canceled: 'Cancelados',
}

export default async function AbonadosPage(
  props: {
    searchParams: Promise<{ status?: string }>
  }
) {
  const searchParams = await props.searchParams;
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

  const total = abonados.length
  const totalWord = total === 1 ? '1 turno fijo' : `${total} turnos fijos`
  const headerSubtitle = statusFilter ? `${totalWord} · ${STATUS_LABELS[statusFilter].toLowerCase()}` : totalWord

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Turnos Fijos"
        subtitle={headerSubtitle}
        icon={<Users className="h-6 w-6" aria-hidden="true" />}
        actions={
          <Link
            href="/abonados/nuevo"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Nuevo turno fijo
          </Link>
        }
      />

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/abonados"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !statusFilter
              ? 'bg-primary text-primary-foreground shadow-xs'
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
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted text-foreground hover:bg-accent'
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <AbonadosList
        abonados={abonados}
        filterLabel={statusFilter ? STATUS_LABELS[statusFilter].toLowerCase() : undefined}
        pauseAction={pauseAbonadoAction}
        reactivateAction={reactivateAbonadoAction}
        cancelAction={cancelAbonadoAction}
        previewSlotsAction={previewAbonadoSlotsAction}
      />
    </div>
  )
}
