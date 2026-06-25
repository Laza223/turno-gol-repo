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
    <section
      className="relative isolate overflow-hidden rounded-3xl border border-white/[.08] px-6 py-7"
      style={{
        background: 'linear-gradient(135deg, #07131d 0%, #020617 58%)',
        boxShadow: '0 30px 70px -42px rgba(0,0,0,.9)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-12%] top-[-60%] -z-10 h-[420px] w-[420px] rounded-full blur-[12px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.26), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
          WebkitMaskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
          maskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
        }}
      />
      <div className="font-logo text-[12px] font-bold uppercase tracking-[.1em] text-emerald-400">
        {eyebrow}
      </div>
      {title && (
        <h1
          className="mt-2 font-display font-black italic text-white"
          style={{ fontSize: 'clamp(26px, 6vw, 36px)', lineHeight: '1', letterSpacing: '-0.03em' }}
        >
          {title}
          {accent && (
            <>
              {' '}
              <span
                style={{
                  background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {accent}
              </span>
            </>
          )}
        </h1>
      )}
      {subtitle && (
        <p className="mt-2.5 text-[14px] leading-relaxed text-slate-400">{subtitle}</p>
      )}
      {children}
    </section>
  )
}
