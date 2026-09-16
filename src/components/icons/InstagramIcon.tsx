/**
 * Glifo de Instagram (cámara de contorno), inline — lucide-react no trae marcas
 * de terceros.
 *
 * Es el trazo monocromo, no el degradado de la app: va en una fila de links de
 * pie de página donde todo lo demás es del color del texto, y un logo a todo
 * color ahí gritaría más que el contenido.
 */
export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      {/* El punto del flash va relleno: a 16 px un círculo de contorno de 1 px
          de radio se pierde y el glifo deja de leerse como Instagram. */}
      <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  )
}
