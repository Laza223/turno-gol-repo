import * as Sentry from '@sentry/nextjs'
import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import PortalShell from '@/components/site/PortalShell'
import { PortalWorld } from '@/components/world/PortalWorld'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { listPublicCities, type CityCount } from '@/modules/tenants/search.service'
import { Hero } from './home/Hero'
import { OwnersStrip } from './home/OwnersStrip'

export const metadata = buildMetadata({
  title: 'TurnoGol — Reservá tu cancha de fútbol al instante',
  description:
    'Mirá los turnos libres de hoy y reservá tu cancha de fútbol online, sin llamar a nadie.',
  path: '/',
  titleAbsolute: true,
})

export const revalidate = 300

async function loadCities(): Promise<CityCount[]> {
  try {
    return await listPublicCities()
  } catch (err) {
    Sentry.captureException(err, { tags: { section: 'landing.cities' } })
    return []
  }
}

export default async function HomePage() {
  const cities = await loadCities()

  // La home no cuelga de `(public)/layout.tsx` (vive en la raíz de `app/`), así que monta el mismo
  // cromo: `PortalShell` pone la barra, el pie, la barra inferior del jugador y el único
  // `<main id="main-content">` que el skip link del layout raíz necesita (WCAG 2.4.1).
  return (
    <PortalWorld>
      <JsonLd data={[buildOrganization(), buildWebSite()]} />
      <PortalShell signOutAction={signOutAction}>
        <Hero cities={cities} />
        <OwnersStrip />
      </PortalShell>
    </PortalWorld>
  )
}
