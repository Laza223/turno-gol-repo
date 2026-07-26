import type { PublicTournamentView } from '@/modules/tournaments/tournament-public.service'
import { PublicPosiciones } from './PublicPosiciones'
import { PublicFixture } from './PublicFixture'
import { PublicGoleadores } from './PublicGoleadores'

/**
 * Ficha pública del torneo: tabla, fixture y goleadores, uno debajo del otro.
 *
 * Sin tabs ni estado: es una página de lectura que se comparte por WhatsApp y
 * se abre en el teléfono. Todo visible de una, `Ctrl+F` funciona, y no hay
 * JavaScript del que dependa que se vea el contenido.
 */
export function TorneoPublicView({ view }: { view: PublicTournamentView }) {
  const knockoutStageIds = new Set(
    view.stages.filter((s) => s.kind === 'knockout').map((s) => s.id),
  )
  const advancePerGroup =
    view.stages.find((s) => s.kind === 'group_stage')?.teamsAdvancePerGroup ?? null

  return (
    <div className="space-y-8">
      <PublicPosiciones groups={view.standings} advancePerGroup={advancePerGroup} />
      <PublicFixture
        matches={view.matches}
        stages={view.stages}
        knockoutStageIds={knockoutStageIds}
      />
      <PublicGoleadores scorers={view.scorers} />
    </div>
  )
}
