/**
 * El titular de la home. Fijo: la distancia a la cancha ya la dice la tarjeta
 * de al lado (`NearbyPanel`), así que acá no se repite ni cambia de forma
 * cuando llega la ubicación.
 */
export function HeroHeadline() {
  return (
    <div>
      <h1 className="font-display text-[clamp(42px,11.5vw,64px)] font-black italic leading-[0.94] tracking-[-0.04em] text-foreground lg:text-[clamp(52px,5.1vw,78px)] dark:[text-shadow:0_12px_60px_rgba(0,0,0,.5)]">
        <span className="block">Tu partido</span>
        <span className="block">empieza en</span>
        <span className="hero-accent-text block">TurnoGol</span>
      </h1>
      <p className="mt-4 max-w-[34rem] text-pretty text-[17px] leading-[1.5] text-muted-foreground lg:mt-5 lg:text-[18px] xl:max-w-none">
        Mirá los turnos libres de hoy y reservá sin llamar a nadie.
      </p>
    </div>
  )
}
