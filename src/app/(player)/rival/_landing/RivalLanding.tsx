import type { LandingEntry } from './ArmarCta'
import { CategoriaSection } from './CategoriaSection'
import { archivoRival } from './fonts'
import { FundaClubSection } from './FundaClubSection'
import { GrupoClubSection } from './GrupoClubSection'
import { Hero } from './Hero'
import { HoySection } from './HoySection'
import s from './landing.module.css'
import { MitadSection } from './MitadSection'
import { OficialSection } from './OficialSection'
import { ReglasSection } from './ReglasSection'
import { ScrollScenes } from './ScrollScenes'
import { TemporadaCeroSection } from './TemporadaCeroSection'
import { TercerTiempoSection } from './TercerTiempoSection'
import { TuCanchaSection } from './TuCanchaSection'
import { Wordmark } from './Wordmark'

/**
 * El cuerpo de la landing de RIVAL (docs/rival/landing.md). Siempre oscura (`dark dark-surface`).
 * Todo es Server Component salvo `ScrollScenes` (el motor) y las islas: la demo de Voy, el quiz y
 * las pestañas del tablón. El cromo del portal (header, barra inferior, pie) lo pone la página.
 */
export function RivalLanding({ entry }: { entry: LandingEntry }) {
  return (
    <ScrollScenes className={`${s.root} ${archivoRival.variable} dark dark-surface`}>
      <Hero entry={entry} />
      <HoySection />
      <MitadSection />
      <CategoriaSection />
      <GrupoClubSection />
      <FundaClubSection />
      <OficialSection />
      <TercerTiempoSection />
      <TuCanchaSection />
      <ReglasSection />
      <TemporadaCeroSection entry={entry} />
      <Wordmark />
    </ScrollScenes>
  )
}
