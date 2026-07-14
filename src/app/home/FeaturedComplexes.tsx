import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import FeaturedComplexCard from '@/components/site/FeaturedComplexCard'
import Reveal from '@/components/site/Reveal'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

/**
 * Grilla de complejos destacados (`searchPublicTenants({ sort: 'rating', limit: 6 })`).
 * `page.tsx` solo la renderiza si `complexes.length > 0` — acá se storya también
 * el caso de un único resultado, para chequear que el grid no se rompe.
 */
export function FeaturedComplexes({ complexes }: { complexes: PublicTenantCard[] }) {
  return (
    <section id="cerca" className="relative z-10 scroll-mt-[90px] py-10 sm:py-16">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal>
          <div className="mb-[34px] flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-[9px] whitespace-nowrap font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-800 dark:text-emerald-400">
                <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
                Complejos verificados
              </div>
              <h2
                className="mt-[14px] font-display font-black italic text-foreground"
                style={{
                  fontSize: 'clamp(34px, 4vw, 50px)',
                  lineHeight: '1',
                  letterSpacing: '-0.025em',
                }}
              >
                Los mejor valorados
              </h2>
              <p className="mt-[14px] max-w-[540px] text-base leading-[1.55] text-muted-foreground">
                Complejos con las mejores reseñas y disponibilidad en tiempo real. Elegí, reservá y jugá.
              </p>
            </div>
            <Link
              href="/explorar"
              className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-accent active:scale-[0.98] dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
            >
              Ver todos
              <ArrowRight
                className="h-[17px] w-[17px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                aria-hidden
              />
            </Link>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
          {complexes.map((t, i) => (
            <Reveal key={t.id} delay={i * 60} className="h-full">
              <FeaturedComplexCard tenant={t} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
