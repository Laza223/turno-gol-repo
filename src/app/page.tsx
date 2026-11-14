import * as Sentry from '@sentry/nextjs'
import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import SiteNav from '@/components/site/SiteNav'
import SiteFooter from '@/components/site/SiteFooter'
import { PlayerBottomNav } from '@/components/site/PlayerBottomNav'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import { PortalMotionProvider } from '@/components/site/PortalMotionProvider'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { listPublicCities, type CityCount } from '@/modules/tenants/search.service'
import { Hero } from './home/Hero'

export const metadata = buildMetadata({
  title: 'TurnoGol — Reservá cancha de fútbol para hoy, sin llamar',
  description:
    'Elegí complejo, día y horario. Reservás en un minuto, sin app y sin llamar a nadie.',
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

  // La home no cuelga de `(public)/layout.tsx` (vive en la raíz de `app/`), así que arma su propio
  // cromo: barra overlay sobre el hero, pie y la barra inferior del celular (también sin sesión).
  // El relleno de abajo reserva lo que ocupa esa barra (`--portal-tabbar-space`, globals.css).
  // `data-portal-glass` y el `motion` del portal: los mismos que pone `PortalFrame`.
  return (
    <div
      data-portal-glass
      className="landing-hero min-h-dvh text-foreground has-[[data-bottom-nav]]:pb-(--portal-tabbar-space) md:has-[[data-bottom-nav]]:pb-0"
    >
      <JsonLd data={[buildOrganization(), buildWebSite()]} />
      <PortalSessionProvider>
        <PortalMotionProvider>
          <SiteNav variant="overlay" signOutAction={signOutAction} />
          {/* La home no pasa por ninguno de los layouts que definen `id="main-content"`
            (auth, business, admin, portal), así que el skip link del layout raíz
            apuntaba a un ancla inexistente: Tab + Enter no movía el foco ni el
            scroll (WCAG 2.4.1 Bypass Blocks). */}
          <main id="main-content" tabIndex={-1}>
            <Hero cities={cities} />
          </main>
          <SiteFooter />
          <PlayerBottomNav />
        </PortalMotionProvider>
      </PortalSessionProvider>
    </div>
  )
}
