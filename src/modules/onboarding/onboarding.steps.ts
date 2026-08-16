import type { WizardStep } from './onboarding.types'

/**
 * Los 4 pasos del wizard. El orden importa y no es arbitrario: los precios que
 * genera el paso Canchas se calculan sobre los horarios ya confirmados en el paso
 * anterior (`validatePricingRulesCoverage`). Al revés, el dueño validaría precios
 * contra horarios que todavía no vio.
 *
 * El `slug` es la URL. Antes el paso no estaba en la URL —se calculaba de DB en
 * cada render— y por eso el botón atrás del navegador no hacía nada: los 4 pasos
 * vivían en `/onboarding`. Nombres y no números porque una URL debería decir dónde
 * estás, igual que el resto del admin (`/grilla`, `/caja`).
 */
export const WIZARD_STEPS = [
  { n: 1, slug: 'complejo', label: 'Tu complejo', hint: 'Nombre y ubicación' },
  { n: 2, slug: 'horarios', label: 'Horarios', hint: 'Cuándo abrís' },
  { n: 3, slug: 'canchas', label: 'Canchas', hint: 'Canchas y precios' },
  // Fase 5 del refactor: reemplaza al paso "Señas" (OAuth de MP, que empujaba
  // al dueño fuera de la app en el peor momento — §A.2 del plan). La seña se
  // mudó a la checklist del dashboard (/settings/facturacion ya tiene su
  // propia card de conexión); este paso cierra con la primera reserva
  // cargada en la grilla real, el gesto que el dueño va a repetir todos los días.
  { n: 4, slug: 'reserva', label: 'Primera reserva', hint: 'Cargá tu primer turno' },
] as const

/** Número de paso a partir del slug de la URL. `null` si el slug no existe. */
export function stepFromSlug(slug: string): WizardStep | null {
  const found = WIZARD_STEPS.find((s) => s.slug === slug)
  return found ? (found.n as WizardStep) : null
}

/** Ruta completa de un paso. Fuente única: nadie arma la URL a mano. */
export function stepPath(n: number): string {
  const step = WIZARD_STEPS.find((s) => s.n === n)
  return step ? `/onboarding/${step.slug}` : '/onboarding'
}

/**
 * Paso visible a partir de la URL completa (Fase 6, `WizardChrome`): a
 * diferencia de `stepFromSlug`, nunca devuelve `null` — el rail necesita
 * SIEMPRE un paso para dibujarse, incluso en `/onboarding` (bare, redirige
 * antes de pintar nada) o `/onboarding/listo` (paso 5, fuera de `WIZARD_STEPS`
 * porque es el cierre, no un paso real del formulario).
 */
export function stepFromPathname(pathname: string): WizardStep {
  if (pathname.startsWith('/onboarding/listo')) return 5
  const slug = pathname.split('/').filter(Boolean).pop() ?? ''
  return stepFromSlug(slug) ?? 1
}
