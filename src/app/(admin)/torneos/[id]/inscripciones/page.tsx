import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { getTournament } from '@/modules/tournaments/tournament.service'
import { listInscriptionStatus } from '@/modules/tournaments/tournament-payment.service'
import { TournamentNotFoundError } from '@/modules/tournaments/tournament.errors'
import { registerInscriptionPaymentAction } from '../../actions'
import { FORMAT_SHORT, formatDateRange } from '../../torneos-lib'
import { TorneoTabs } from '../TorneoTabs'
import { InscripcionesPanel } from './InscripcionesPanel'

export default async function TorneoInscripcionesPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant } = auth

  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  let data
  try {
    data = await withTenantContext(tenant.id, async (tx) => {
      const tournament = await getTournament(tenant.id, id, tx)
      const rows = await listInscriptionStatus(tenant.id, id, tx)
      return { tournament, rows }
    })
  } catch (err) {
    if (err instanceof TournamentNotFoundError) notFound()
    throw err
  }

  const { tournament, rows } = data

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/torneos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a Torneos
      </Link>

      <PageHeader
        title={tournament.name}
        subtitle={`${FORMAT_SHORT[tournament.format]} · ${formatDateRange(tournament.startsOn, tournament.endsOn)}`}
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
      />

      <TorneoTabs tournamentId={tournament.id} active={`/torneos/${tournament.id}/inscripciones`} />

      <InscripcionesPanel rows={rows} registerAction={registerInscriptionPaymentAction} />
    </div>
  )
}
