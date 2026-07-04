import type { ReactNode } from 'react'

/**
 * Banda hero dark premium para vistas del jugador (perfil / configuración),
 * puente visual con el home: gradiente oscuro, glow blob y grid con máscara.
 * Espeja la banda inline de /mis-reservas. `title`/`accent` arman el titular
 * `font-display` (accent va con degradé esmeralda); `children` permite componer
 * contenido extra (p. ej. avatar + nombre).
 */
export default function PlayerHeroBand({
  eyebrow,
  title,
  accent,
  subtitle,
  children,
}: {
  eyebrow: string
  title?: string
  accent?: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <section className="player-hero-band relative isolate overflow-hidden rounded-3xl border px-6 py-7">
      <div
        aria-hidden
        className="hero-glow-blob pointer-events-none absolute right-[-12%] top-[-60%] -z-10 h-[420px] w-[420px] rounded-full blur-[12px]"
      />
      <div
        aria-hidden
        className="player-hero-grid pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundSize: '38px 38px',
          WebkitMaskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
          maskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
        }}
      />
      <div className="font-logo text-[12px] font-bold uppercase tracking-[.1em] text-emerald-600 dark:text-emerald-400">
        {eyebrow}
      </div>
      {title && (
        <h1
          className="mt-2 font-display font-black italic text-foreground"
          style={{ fontSize: 'clamp(26px, 6vw, 36px)', lineHeight: '1', letterSpacing: '-0.03em' }}
        >
          {title}
          {accent && (
            <>
              {' '}
              <span className="hero-accent-text">{accent}</span>
            </>
          )}
        </h1>
      )}
      {subtitle && (
        <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
      {children}
    </section>
  )
}
