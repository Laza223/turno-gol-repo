const playerStats = [
  { value: '+10.000', label: 'Reservas completadas' },
  { value: '50+', label: 'Complejos en la plataforma' },
  { value: '95%', label: 'Tasa de asistencia' },
  { value: '<2 min', label: 'Tiempo promedio de reserva' },
]

/** Banda de estadísticas de la landing. 100% estática, sin props. */
export function StatsBar() {
  return (
    <section className="relative z-10">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="stats-band relative overflow-hidden rounded-3xl p-7 sm:p-11">
          <div
            aria-hidden
            className="hero-glow-blob pointer-events-none absolute left-1/2 top-[-40%] hidden h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-[20px] dark:block"
          />
          <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
            {playerStats.map((s, i) => (
              <div
                key={s.label}
                className={`text-center ${i > 0 ? 'border-l border-emerald-900/10 dark:border-white/10' : ''}`}
              >
                <div
                  className="hero-accent-text font-display font-black italic leading-none"
                  style={{ fontSize: 'clamp(34px, 4.6vw, 56px)' }}
                >
                  {s.value}
                </div>
                <div className="mt-[10px] font-logo text-[12.5px] font-bold uppercase tracking-[.08em] text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
