import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { Pager } from '@/components/ui/pager'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { getAbonados, countAbonados } from '@/modules/abonados/abonado.service'
import type { AbonadoStatus } from '@/modules/abonados/abonado.types'
import { AbonadosList } from './AbonadosList'
import { ClientesTabs } from '@/app/(admin)/jugadores/ClientesTabs'
import { reactivateAbonadoAction, cancelAbonadoAction } from './actions'
import { previewAbonadoSlotsAction } from './nuevo/actions'

const VALID_STATUSES: AbonadoStatus[] = ['active', 'paused', 'canceled']

/** Turnos fijos por página. Los `canceled` no se borran nunca: sin techo, un
 * complejo viejo trae cientos de filas de una. */
const PAGE_SIZE = 25

/** `?pagina=` es 1-based en la URL (la página 1 va sin parámetro). Basura → 0. */
function parseAbonadosPage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 1 ? n - 1 : 0
}

// Pestañas visibles. 'paused' sigue siendo un filtro válido por URL y esas filas
// siguen listándose en "Todos" (quedan de antes: pausar se eliminó del producto,
// porque saltear una fecha se hace cancelando ese turno desde la grilla sin
// perder el fijo), pero una pestaña que ya no puede llenarse es ruido.
const FILTER_TABS: AbonadoStatus[] = ['active', 'canceled']

const STATUS_LABELS: Record<AbonadoStatus, string> = {
  active: 'Fijos activos',
  paused: 'Pausados',
  canceled: 'Cancelados',
}

export default async function AbonadosPage(props: {
  searchParams: Promise<{ status?: string; created?: string; pagina?: string }>
}) {
  const searchParams = await props.searchParams
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant } = auth

  const statusFilter = VALID_STATUSES.includes(searchParams.status as AbonadoStatus)
    ? (searchParams.status as AbonadoStatus)
    : undefined
  // H054: `/abonados/nuevo` redirige acá con `?created=1` tras crear (no hay
  // forma de devolver estado al cliente a través de un redirect() server-side)
  // — AbonadosList levanta el flag al montar, muestra el toast y limpia la URL.
  const justCreated = searchParams.created === '1'
  const page = parseAbonadosPage(searchParams.pagina)

  const { abonados, total } = await withTenantContext(tenant.id, async (tx) => {
    const [rows, count] = await Promise.all([
      getAbonados(tenant.id, { status: statusFilter }, tx, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
      // El total del paginador (y del subtítulo del encabezado): mismo WHERE
      // que getAbonados, aparte, para que "N turnos fijos" nunca hable solo
      // del largo de esta página.
      countAbonados(tenant.id, { status: statusFilter }, tx),
    ])
    return { abonados: rows, total: count }
  })

  const totalWord = total === 1 ? '1 turno fijo' : `${total} turnos fijos`
  const headerSubtitle = statusFilter
    ? `${totalWord} · ${STATUS_LABELS[statusFilter].toLowerCase()}`
    : totalWord

  /** `/abonados` con el status activo y la página del paginador. Cambiar de
   * pestaña de status resetea a la página 1 (esos links no pasan por acá). */
  function abonadosHref(targetPage: number): string {
    const qs = new URLSearchParams()
    if (statusFilter) qs.set('status', statusFilter)
    if (targetPage > 0) qs.set('pagina', String(targetPage + 1))
    const s = qs.toString()
    return s ? `/abonados?${s}` : '/abonados'
  }

  // Página fuera de rango (`?pagina=9` de un link viejo, con menos fijos que
  // eso): no es "sin turnos fijos" — con esa lectura, un complejo con 30
  // fijos activos vería el empty state de "cargá el primero" mintiendo.
  const pageOutOfRange = page > 0 && abonados.length === 0

  return (
    <div className="p-6 space-y-6">
      <ClientesTabs active="/abonados" />

      <PageHeader
        title="Turnos fijos"
        subtitle={headerSubtitle}
        icon={<Users className="h-6 w-6" aria-hidden="true" />}
        actions={
          <Link
            href="/abonados/nuevo"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Nuevo turno fijo
          </Link>
        }
      />

      <div className="card-entrance flex gap-2 flex-wrap" style={{ animationDelay: '80ms' }}>
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
        {FILTER_TABS.map((s) => (
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

      <div className="card-entrance space-y-4" style={{ animationDelay: '160ms' }}>
        {pageOutOfRange ? (
          <EmptyState
            icon={Users}
            title="Esa página no existe"
            description="Este filtro tiene menos turnos fijos que los que pide el link."
            action={
              <Link
                href={abonadosHref(0)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Volver al principio
              </Link>
            }
          />
        ) : (
          <>
            <AbonadosList
              abonados={abonados}
              filterLabel={statusFilter ? STATUS_LABELS[statusFilter].toLowerCase() : undefined}
              justCreated={justCreated}
              reactivateAction={reactivateAbonadoAction}
              cancelAction={cancelAbonadoAction}
              previewSlotsAction={previewAbonadoSlotsAction}
            />
            <Pager
              label="Paginación de turnos fijos"
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              shown={abonados.length}
              hrefFor={abonadosHref}
            />
          </>
        )}
      </div>
    </div>
  )
}
