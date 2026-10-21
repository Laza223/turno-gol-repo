import * as Sentry from '@sentry/nextjs'
import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import SiteNav from '@/components/site/SiteNav'
import SiteFooter from '@/components/site/SiteFooter'
import { PlayerBottomNav } from '@/components/site/PlayerBottomNav'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { listPublicCities, type CityCount } from '@/modules/tenants/search.service'
import { Hero } from './home/Hero'

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

  // La home no cuelga de `(public)/layout.tsx` (vive en la raíz de `app/`), así que arma su propio
  // cromo: barra overlay sobre el hero, pie y la barra inferior del celular (también sin sesión).
  // El relleno de abajo reserva el alto real de esa barra (56 px + 1 px de borde + área segura);
  // si cambia uno, cambia el otro (`PortalFrame`, `globals.css`, `ConfirmBookingButton`).
  return (
    <div className="landing-hero min-h-dvh text-foreground has-[[data-bottom-nav]]:pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))] md:has-[[data-bottom-nav]]:pb-0">
      <JsonLd data={[buildOrganization(), buildWebSite()]} />
      <PortalSessionProvider>
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
      </PortalSessionProvider>
    </div>
  )
}
