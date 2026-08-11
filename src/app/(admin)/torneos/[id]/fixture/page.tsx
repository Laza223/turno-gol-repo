import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { getTournament } from '@/modules/tournaments/tournament.service'
import {
  listFixture,
  listStages,
} from '@/modules/tournaments/tournament-fixture.service'
import { listTournamentSlots } from '@/modules/tournaments/tournament-slots.service'
import { listCourts } from '@/modules/courts/court.service'
import { TournamentNotFoundError } from '@/modules/tournaments/tournament.errors'
import { clearFixtureAction, generateFixtureAction, rescheduleMatchAction } from '../../actions'
import { FORMAT_SHORT, formatDateRange } from '../../torneos-lib'
import { TorneoTabs } from '../TorneoTabs'
import { FixturePanel } from './FixturePanel'

export default async function TorneoFixturePage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  let data
  try {
    data = await withTenantContext(tenant.id, async (tx) => {
      const tournament = await getTournament(tenant.id, id, tx)
      // `slots` y `courts` son para la Planilla: los destinos legales de un
      // partido son exactamente las horas que el torneo posee.
      const [stages, matches, slots, courts] = await Promise.all([
        listStages(tenant.id, id, tx),
        listFixture(tenant.id, id, tx),
        listTournamentSlots(tenant.id, id, tx),
        listCourts(tenant.id, tx),
      ])
      return { tournament, stages, matches, slots, courts }
    })
  } catch (err) {
    if (err instanceof TournamentNotFoundError) notFound()
    throw err
  }

  const { tournament, stages, matches, slots, courts } = data

  return (
    <div className="p-6 space-y-6">
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

      <TorneoTabs tournamentId={tournament.id} active={`/torneos/${tournament.id}/fixture`} />

      <FixturePanel
        tournamentId={tournament.id}
        format={tournament.format}
        stages={stages}
        matches={matches}
        slots={slots}
        courts={courts.map((c) => ({ id: c.id, name: c.name }))}
        matchDurationMinutes={tournament.matchDurationMinutes}
        restBetweenMatchesMinutes={tournament.restBetweenMatchesMinutes}
        generateAction={generateFixtureAction}
        clearAction={clearFixtureAction}
        rescheduleAction={rescheduleMatchAction}
      />
    </div>
  )
}
