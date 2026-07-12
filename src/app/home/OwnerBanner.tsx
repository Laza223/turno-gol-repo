import Link from 'next/link'
import { ArrowRight, Building2 } from 'lucide-react'
import Reveal from '@/components/site/Reveal'

/** CTA de cierre hacia `/para-complejos` (dueños de complejo). 100% estática. */
export function OwnerBanner() {
  return (
    <section id="partners" className="relative z-10 py-14 sm:py-20">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal>
          <div className="cta-band relative isolate overflow-hidden rounded-3xl p-7 sm:p-11">
            {/* Foto de ambiente: solo dark */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[-2] hidden opacity-25 dark:block"
              style={{
                backgroundImage: "url('/bg-owner.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                transform: 'scale(1.05)',
              }}
            />
            {/* Glow (solo dark; en light la banda ya trae tinte propio) */}
            <div
              aria-hidden
              className="hero-glow-blob pointer-events-none absolute right-[-8%] top-[-60%] z-[-1] hidden h-[620px] w-[620px] rounded-full blur-[16px] dark:block"
            />
            {/* Retícula */}
            <div
              aria-hidden
              className="player-hero-grid pointer-events-none absolute inset-0 z-[-1] bg-[length:40px_40px]"
              style={{
                WebkitMaskImage: 'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
                maskImage: 'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
              }}
            />

            <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-[22px]">
                {/* Ícono */}
                <div className="icon-halo inline-flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center rounded-2xl">
                  <Building2 className="h-7 w-7" aria-hidden />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 font-logo text-xs font-bold uppercase tracking-[.1em] text-emerald-800 dark:text-emerald-400">
                    Para dueños de complejo
                  </div>
                  <h2
                    className="font-display font-black italic text-foreground"
                    style={{
                      fontSize: 'clamp(28px, 3.2vw, 40px)',
                      letterSpacing: '-0.025em',
                      lineHeight: '1.02',
                    }}
                  >
                    Llevá tu complejo al siguiente nivel
                  </h2>
                  <p className="mt-3 max-w-[560px] text-base leading-[1.55] text-muted-foreground">
                    Automatizá reservas, cobrá señas con MercadoPago y compartí tu link para que reserven solos. Tu complejo, vendiendo canchas 24/7.
                  </p>
                </div>
              </div>

              <Link
                href="/para-complejos"
                className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 dark:shadow-emerald-500/25 sm:self-auto"
              >
                Registrá tu complejo
                <ArrowRight
                  className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                  aria-hidden
                />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
