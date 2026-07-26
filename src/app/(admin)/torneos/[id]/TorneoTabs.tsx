import { ScrollTabs } from '@/components/ui/scroll-tabs'

/**
 * Tabs de la ficha del torneo. Los hrefs son dinámicos (dependen del id), a
 * diferencia de CajaTabs/SettingsTabs que los tienen estáticos.
 *
 * `activeHref` compara por igualdad EXACTA en ScrollTabs, así que hay que
 * pasarle el href ya armado con el id.
 */
export function TorneoTabs({ tournamentId, active }: { tournamentId: string; active: string }) {
  const base = `/torneos/${tournamentId}`
  return (
    <ScrollTabs
      ariaLabel="Secciones del torneo"
      activeHref={active}
      tabs={[
        { href: base, label: 'Equipos y horarios' },
        { href: `${base}/fixture`, label: 'Fixture' },
        { href: `${base}/posiciones`, label: 'Posiciones' },
        { href: `${base}/inscripciones`, label: 'Inscripciones' },
      ]}
    />
  )
}
