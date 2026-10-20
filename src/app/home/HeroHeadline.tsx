/**
 * El titular de la home. Fijo: la distancia a la cancha ya la dice la tarjeta
 * de al lado (`NearbyPanel`), así que acá no se repite ni cambia de forma
 * cuando llega la ubicación. Archivo 800 recta, como todo título del portal.
 */
export function HeroHeadline() {
  return (
    <div>
      <h1 className="text-balance font-display text-[32px] font-extrabold leading-9 tracking-[-0.01em] text-foreground sm:text-[40px] sm:leading-[44px] lg:text-[44px] lg:leading-[48px]">
        Tu partido empieza en TurnoGol
      </h1>
      <p className="mt-2 max-w-[34rem] text-pretty text-base text-muted-foreground">
        Mirá los turnos libres de hoy y reservá sin llamar a nadie.
      </p>
    </div>
  )
}
