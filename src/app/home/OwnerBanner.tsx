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
              className="hero-glow-blob pointer-events-none absolute right-[-8%] top-[-60%] z-[-1] hidden h-[620px] w-[620px] rounded-full blur-lg dark:block"
            />
            {/* Retícula */}
            <div
              aria-hidden
              className="player-hero-grid pointer-events-none absolute inset-0 z-[-1] bg-size-[40px_40px]"
              style={{
                WebkitMaskImage: 'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
                maskImage: 'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
              }}
            />

            <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-[22px]">
                {/* Ícono */}
                <div className="icon-halo inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl">
                  <Building2 className="h-7 w-7" aria-hidden />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 font-logo text-xs font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-400">
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
                    Automatizá reservas, cobrá señas con MercadoPago y compartí tu link para que
                    reserven solos. Tu complejo, vendiendo canchas 24/7.
                  </p>
                </div>
              </div>

              <Link
                href="/para-complejos"
                className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 text-xs font-bold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_30px_rgba(16,185,129,0.3)] transition-all duration-300 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_36px_rgba(16,185,129,0.4)] active:scale-[0.97] sm:px-8 sm:text-sm whitespace-nowrap sm:self-auto"
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
