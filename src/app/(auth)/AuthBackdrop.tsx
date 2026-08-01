/**
 * Fondo decorativo de las auth pages "menores" (forgot-password, reset-password):
 * un campo de fútbol cenital en SVG inline a opacidad muy baja + dos radial glows
 * emerald/teal. 0 KB de red (inline, sin imagen), theme-adaptive vía currentColor,
 * y estático a propósito — el fondo no compite con el form.
 *
 * Login/register/ingresar/verify NO lo usan: tienen su propio diseño (foto + glows).
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Glows de marca */}
      <div
        className="absolute -right-[10%] -top-[15%] h-[480px] w-[480px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(16, 185, 129, 0.1), transparent 70%)' }}
      />
      <div
        className="absolute -bottom-[18%] -left-[12%] h-[420px] w-[420px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(13, 148, 136, 0.08), transparent 72%)' }}
      />
      {/* Campo de fútbol cenital: perímetro, línea media, círculo central, áreas
          y puntos de penal. Más grande que el viewport y levemente descentrado
          para que se lea como textura, no como clipart. */}
      <svg
        viewBox="0 0 680 440"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="absolute left-1/2 top-1/2 h-[920px] w-auto -translate-x-[52%] -translate-y-1/2 text-emerald-700/[0.06] dark:text-emerald-400/[0.08]"
      >
        <rect x="20" y="20" width="640" height="400" rx="2" />
        <line x1="340" y1="20" x2="340" y2="420" />
        <circle cx="340" cy="220" r="60" />
        <circle cx="340" cy="220" r="3" fill="currentColor" stroke="none" />
        {/* Área y punto de penal — lado izquierdo */}
        <rect x="20" y="120" width="100" height="200" />
        <rect x="20" y="170" width="40" height="100" />
        <circle cx="90" cy="220" r="3" fill="currentColor" stroke="none" />
        {/* Área y punto de penal — lado derecho */}
        <rect x="560" y="120" width="100" height="200" />
        <rect x="620" y="170" width="40" height="100" />
        <circle cx="590" cy="220" r="3" fill="currentColor" stroke="none" />
      </svg>
    </div>
  )
}
