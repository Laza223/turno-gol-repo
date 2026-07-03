/**
 * Motivo decorativo "líneas de cal" (marcas de cancha de fútbol). SVG sin
 * imágenes, escala con el contenedor (preserveAspectRatio none). Usa
 * `currentColor` → el color sale de una clase text-* en el contenedor padre.
 * Puramente decorativo: aria-hidden, no transporta información.
 * Firma visual del lado jugador (pages/explorar.md §1): en light es la
 * identidad "mediodía de partido"; en dark baja a white-alpha tenue.
 */
export default function PitchLines({
  className,
  variant = 'band',
}: {
  className?: string
  variant?: 'band' | 'empty'
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 400 200"
      fill="none"
      preserveAspectRatio={variant === 'band' ? 'xMidYMid slice' : 'xMidYMid meet'}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Línea de medio campo */}
      <line x1="200" y1="0" x2="200" y2="200" stroke="currentColor" strokeWidth="1.5" />
      {/* Círculo central */}
      <circle cx="200" cy="100" r="42" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="200" cy="100" r="2.5" fill="currentColor" />
      {/* Áreas (arcos) a izquierda y derecha */}
      <path d="M0 60 H44 V140 H0" stroke="currentColor" strokeWidth="1.5" />
      <path d="M400 60 H356 V140 H400" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
