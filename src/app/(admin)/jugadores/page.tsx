import { redirect } from 'next/navigation'
import { buildPublicLinkUrl } from '@/lib/utils'
import { DORMANT_FILTER_PARAM } from '@/modules/relationships/dormant'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listTenantClients } from './queries'
import { JugadoresView } from './JugadoresView'
import { linkContactAction, searchLinkCandidatesAction } from './actions'

/** `?pagina=` es 1-based en la URL y 0-based adentro. Basura → página 1. */
function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n - 1 : 0
}

// Función aparte y no `Date.now()` en el cuerpo: react-compiler marca impura la
// llamada directa a un builtin dentro de un componente (mismo patrón que
// `reservas/(list)/page.tsx`). Server Component: el reloj del server alcanza.
function nowMs(): number {
  return Date.now()
}

export default async function JugadoresPage(props: {
  searchParams: Promise<{ q?: string; pagina?: string; filtro?: string }>
}) {
  const searchParams = await props.searchParams
  // Constraint: el módulo se protege con requireOperatorStaff (admin + manager).
  // El encargado ve también "Dejaron de venir": atiende a los clientes en el día.
  const auth = await requireOperatorStaff({ allowReadOnly: true })
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  const q = searchParams.q?.trim() || undefined
  const page = parsePage(searchParams.pagina)
  const dormant = searchParams.filtro === DORMANT_FILTER_PARAM
  const { rows, total, dormantTotal } = await withTenantContext(tenant.id, (tx) =>
    listTenantClients(tenant.id, { q, dormant }, tx, page),
  )

  return (
    <JugadoresView
      clients={rows}
      q={q}
      page={page}
      total={total}
      dormant={dormant}
      dormantTotal={dormantTotal}
      tenantName={tenant.name}
      // Sin NEXT_PUBLIC_APP_URL absoluta no hay link: el mensaje sale sin la
      // invitación a reservar (en el server no hay `window.location.origin`).
      publicUrl={buildPublicLinkUrl(process.env.NEXT_PUBLIC_APP_URL, null, tenant.slug)}
      nowMs={nowMs()}
      searchAction={searchLinkCandidatesAction}
      linkAction={linkContactAction}
    />
  )
}
