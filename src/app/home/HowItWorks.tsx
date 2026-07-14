import { CalendarDays, CheckCircle2, Search } from 'lucide-react'
import Reveal from '@/components/site/Reveal'

const howItWorks = [
  {
    n: '01',
    icon: Search,
    title: 'Explorá complejos',
    description:
      'Elegí tu ciudad, fecha y horario. Filtrá por superficie, precio o cercanía y encontrá el complejo ideal para tu partido.',
  },
  {
    n: '02',
    icon: CalendarDays,
    title: 'Compará disponibilidad',
    description:
      'Visualizá la disponibilidad actualizada en tiempo real y elegí el horario que más te convenga. Sin intermediarios.',
  },
  {
    n: '03',
    icon: CheckCircle2,
    title: 'Confirmá y jugá',
    description:
      'Reservá con pago seguro a través de MercadoPago y tu cancha queda asegurada. Solo queda la pelota.',
  },
]

/** Sección "Así de simple" de la landing. 100% estática, sin props. */
export function HowItWorks() {
  return (
    <section className="relative z-10 overflow-hidden py-20 sm:py-24">
      {/* Foto de ambiente: solo dark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1] hidden opacity-[0.12] mix-blend-luminosity dark:block"
        style={{
          backgroundImage: "url('/bg-how-it-works.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: 'scale(1.05)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-[620px] text-center">
            <div className="inline-flex items-center gap-[9px] whitespace-nowrap font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-800 dark:text-emerald-400">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
              Así de simple
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-foreground"
              style={{
                fontSize: 'clamp(34px, 4vw, 50px)',
                lineHeight: '1',
                letterSpacing: '-0.025em',
              }}
            >
              Del buscador a la cancha
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-muted-foreground">
              Tres pasos y tu cancha está asegurada. Reserva online, confirmación inmediata.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-3">
          {howItWorks.map((step, i) => (
            <Reveal key={step.n} delay={i * 80}>
              <div className="card-premium relative overflow-hidden p-7">
                <span
                  aria-hidden
                  className="card-ghost-number pointer-events-none absolute right-[18px] top-[6px] font-display font-black italic leading-none text-foreground/5"
                  style={{ fontSize: '92px', letterSpacing: '-0.05em' }}
                >
                  {step.n}
                </span>
                <div className="icon-halo relative inline-flex h-[52px] w-[52px] items-center justify-center rounded-[14px]">
                  <step.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="relative mt-5 font-display text-xl font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="relative mt-2.5 text-[14.5px] leading-[1.6] text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
