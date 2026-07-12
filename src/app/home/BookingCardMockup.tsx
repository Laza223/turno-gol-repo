import { ArrowRight, Check, MapPin, Star } from 'lucide-react'

const BOOKING_SLOTS = [
  { time: '18:00', state: 'occupied' },
  { time: '19:00', state: 'free' },
  { time: '20:00', state: 'free' },
  { time: '21:00', state: 'selected' },
  { time: '22:00', state: 'free' },
  { time: '23:00', state: 'occupied' },
] as const

const SLOT_CLASSES: Record<(typeof BOOKING_SLOTS)[number]['state'], { box: string; time: string; label: string }> = {
  selected: {
    box: 'border border-emerald-500 bg-gradient-to-br from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-600/40 dark:from-emerald-500 dark:to-emerald-600 dark:shadow-emerald-500/40',
    time: 'text-white dark:text-slate-950',
    label: 'text-emerald-100 dark:text-emerald-950',
  },
  free: {
    box: 'border border-emerald-600/30 bg-primary/[.07] dark:border-emerald-500/30 dark:bg-emerald-500/[.08]',
    time: 'text-emerald-800 dark:text-emerald-300',
    label: 'text-emerald-700 dark:text-emerald-400',
  },
  occupied: {
    box: 'border border-border bg-muted/50 opacity-60 dark:border-white/[.06] dark:bg-white/[.03]',
    time: 'text-muted-foreground line-through',
    label: 'text-muted-foreground/70',
  },
}

/**
 * Mockup decorativo del buscador de reservas en el hero de la landing. 100%
 * estático — `aria-hidden`, sin props, sin datos reales — así que tiene un
 * único estado real posible.
 */
export function BookingCardMockup() {
  return (
    <div className="relative hidden min-w-0 lg:block" aria-hidden>
      {/* Glow detrás de la card */}
      <div className="hero-glow-blob pointer-events-none absolute inset-[6%_8%] rounded-[28px] blur-[30px]" />

      {/* Card principal */}
      <div
        className="mockup-card relative overflow-hidden rounded-3xl"
        style={{ animation: 'tg-float 9s ease-in-out infinite' }}
      >
        {/* Cover */}
        <div className="mockup-cover relative h-[132px] overflow-hidden">
          <div
            className="player-hero-grid absolute inset-0 bg-[length:30px_30px]"
            style={{
              WebkitMaskImage: 'linear-gradient(180deg, #000, transparent)',
              maskImage: 'linear-gradient(180deg, #000, transparent)',
            }}
          />
          <span
            className="absolute left-[22px] top-1/2 -translate-y-1/2 font-display font-black italic text-emerald-950/[.14] dark:text-white/[.16]"
            style={{ fontSize: '46px', letterSpacing: '-0.04em' }}
          >
            LC
          </span>
          {/* Badge "En vivo" */}
          <div className="live-pill absolute right-4 top-4 inline-flex items-center gap-[7px] rounded-full px-3 py-[6px] text-[11px] font-bold uppercase tracking-[.08em]">
            <span className="relative flex h-[7px] w-[7px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-emerald-500 dark:bg-emerald-400" />
            </span>
            En vivo
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-[22px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-[19px] font-bold text-foreground">La Catedral F5</div>
              <div className="mt-[5px] flex items-center gap-[6px] text-[13px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" strokeWidth={2} aria-hidden />
                Palermo · a 1,2 km
              </div>
            </div>
            <div className="inline-flex shrink-0 items-center gap-[5px] rounded-full border border-emerald-600/25 bg-primary/10 px-[10px] py-[5px] text-[13px] font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/[.12] dark:text-emerald-300">
              <Star className="h-[13px] w-[13px] fill-current" strokeWidth={0} aria-hidden />
              4,9
            </div>
          </div>

          {/* Header de slots */}
          <div className="mb-[10px] mt-[18px] flex items-center justify-between">
            <span className="font-logo text-[12px] font-bold uppercase tracking-[.06em] text-muted-foreground">
              Turnos · Hoy
            </span>
            <span className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">4 libres</span>
          </div>

          {/* Grilla de slots */}
          <div className="grid grid-cols-3 gap-[9px]">
            {BOOKING_SLOTS.map(({ time, state }) => {
              const c = SLOT_CLASSES[state]
              return (
                <div key={time} className={`flex flex-col items-center gap-[2px] rounded-xl px-1 py-[11px] ${c.box}`}>
                  <span className={`font-logo text-[15px] font-bold tabular-nums ${c.time}`}>{time}</span>
                  <span className={`text-[10px] uppercase tracking-[.04em] ${c.label}`}>
                    {state === 'selected' ? 'Elegido' : state === 'free' ? 'Libre' : 'Ocupado'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Pie de card */}
          <div className="mt-[18px] flex items-center justify-between gap-3 border-t border-border pt-4 dark:border-white/[.08]">
            <div>
              <div className="font-logo text-[11px] uppercase tracking-[.05em] text-muted-foreground">Seña</div>
              <div className="font-display text-[20px] font-bold tabular-nums text-foreground">$ 8.000</div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-[10px] text-[13.5px] font-semibold text-primary-foreground shadow-lg shadow-emerald-600/30 dark:shadow-emerald-500/30">
              Reservar 21:00
              <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.4} aria-hidden />
            </div>
          </div>
        </div>
      </div>

      {/* Toast flotante "Turno confirmado" — cuelga del borde inferior para no
          tapar el precio/CTA del mockup */}
      <div
        className="overlay-nav absolute -bottom-4 -left-[26px] inline-flex items-center gap-[9px] rounded-[14px] px-3.5 py-2.5"
        style={{ animation: 'tg-float 7s ease-in-out infinite 1.4s' }}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary/15 text-emerald-700 dark:bg-emerald-500/[.18] dark:text-emerald-400">
          <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden />
        </span>
        <div>
          <div className="text-[13px] font-bold text-foreground">Turno confirmado</div>
          <div className="text-[11px] text-muted-foreground">hace 2 minutos</div>
        </div>
      </div>
    </div>
  )
}
