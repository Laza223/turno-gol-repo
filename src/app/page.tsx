import * as Sentry from '@sentry/nextjs'
import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import SiteNav from '@/components/site/SiteNav'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import { signOutAction } from '@/modules/auth/sign-out.action'
import SiteFooter from '@/components/site/SiteFooter'
import {
  listPublicCities,
  searchPublicTenants,
  type CityCount,
  type PublicTenantCard,
} from '@/modules/tenants/search.service'
import { Hero } from './home/Hero'
import { FeaturedComplexes } from './home/FeaturedComplexes'
import { HowItWorks } from './home/HowItWorks'
import { StatsBar } from './home/StatsBar'
import { OwnerBanner } from './home/OwnerBanner'

export const metadata = buildMetadata({
  title: 'TurnoGol — Reservá tu cancha de fútbol al instante',
  description:
    'Explorá complejos de fútbol en tu ciudad, compará disponibilidad en tiempo real y reservá tu cancha online. Confirmación inmediata, pago seguro con MercadoPago.',
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

async function loadFeatured(): Promise<PublicTenantCard[]> {
  try {
    const { results } = await searchPublicTenants({ sort: 'rating', limit: 6 })
    return results
  } catch (err) {
    Sentry.captureException(err, { tags: { section: 'landing.featured' } })
    return []
  }
}

export default async function HomePage() {
  const [cities, featured] = await Promise.all([loadCities(), loadFeatured()])

  return (
    <div className="landing-hero min-h-dvh text-foreground">
      <JsonLd data={[buildOrganization(), buildWebSite()]} />
      <PortalSessionProvider>
        <SiteNav variant="overlay" signOutAction={signOutAction} />
      </PortalSessionProvider>
      <Hero cities={cities} />
      {featured.length > 0 && <FeaturedComplexes complexes={featured} />}
      <HowItWorks />
      <StatsBar />
      <OwnerBanner />
      <SiteFooter />
    </div>
  )
}
