import type { CityCount } from '@/modules/tenants/search.service'
import { HeroMobile } from './HeroMobile'
import { HeroDesktop } from './HeroDesktop'

/**
 * Sección hero de la landing pública. Orquestador delgado: mobile/tablet
 * (<lg) y desktop (lg+) son dos árboles JSX hermanos, cada uno gateado por
 * CSS (`lg:hidden` / `hidden lg:flex`) en su propio <section> raíz — nunca
 * JS por tamaño de pantalla, para no arriesgar hydration mismatch ni layout
 * shift. Ver HeroMobile.tsx y HeroDesktop.tsx.
 */
export function Hero({ cities }: { cities: CityCount[] }) {
  return (
    <>
      <HeroMobile cities={cities} />
      <HeroDesktop cities={cities} />
    </>
  )
}
