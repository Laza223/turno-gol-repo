import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** El cierre para complejos de la home (`home.html`, `.cta`): lleva a /para-complejos. */
export function ClosingCta() {
  return (
    <section className="home-closing" aria-labelledby="cierre-title">
      <div className="home-wrap">
        <div className="home-cta glass-painted home-reveal">
          <div>
            <h2 id="cierre-title" className="home-h2">
              Tus jugadores reservan solos. Tu noche se ordena sola.
            </h2>
            <p className="home-lead2">
              Agenda, cobros y caja del complejo en el mismo lugar donde te encuentran. Probalo 30
              días gratis.
            </p>
          </div>
          <Link
            href="/para-complejos"
            className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'group')}
          >
            Ver TurnoGol para complejos
            <ArrowRight
              className="size-4.5 transition-transform duration-(--dur-2) group-hover:translate-x-[3px]"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </section>
  )
}
