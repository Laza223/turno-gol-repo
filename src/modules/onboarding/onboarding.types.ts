/**
 * Tipos del wizard de alta de complejo.
 *
 * El onboarding vivía entero en `src/app/onboarding/` — schemas Zod, reglas de
 * precio y un UPDATE crudo a `tenants` dentro de las Server Actions. Era el único
 * de los 25 slices del repo sin módulo propio.
 */

/**
 * Contrato de retorno de todas las actions del wizard.
 *
 * `next` es la ruta a la que el CLIENTE navega al terminar — nunca un `redirect()`
 * server-side. El motivo no es estético: `createTenantAction` muta la cookie de
 * sesión (`setStaffTenantClaim` + `refreshSession`), y una action que toca la
 * cookie y redirige a una ruta protegida perdió una carrera real contra WebKit
 * móvil en producción (fix #158: el usuario volvía a un login en blanco). El
 * cliente navega sobre una respuesta que YA tiene el `Set-Cookie` aplicado.
 *
 * `hardNavigate` distingue los dos casos: `true` fuerza `window.location.assign`
 * (obligatorio cuando cambió la sesión); ausente permite `router.push`, que
 * conserva el árbol de React y deja animar la transición entre pasos.
 */
export type WizardActionResult =
  { success: true; next?: string; hardNavigate?: boolean } | { success: false; error: string }

/**
 * Paso visible del wizard. 1..4 son pasos reales; 5 es la pantalla de cierre
 * (`/onboarding/listo`), que reusa el mismo shell con todos los pasos tildados.
 * Era un `number` suelto con la convención documentada solo en un comentario.
 */
export type WizardStep = 1 | 2 | 3 | 4 | 5

export const LAST_WIZARD_STEP = 4 satisfies WizardStep

/**
 * Último paso que se puede marcar como completado desde "Volver". No incluye el 4:
 * cerrar el onboarding es `completeOnboarding`, no un retroceso.
 */
export const MAX_COMPLETED_STEP = 3

/**
 * Contrato de `createOnboardingFirstBookingAction` (Fase 5, paso 4 nuevo).
 * Distinto de `WizardActionResult`: esta acción nunca navega —el turno
 * aparece inline en la grilla del propio paso— así que no hay `next`, y en
 * cambio hace falta devolver qué slot quedó ocupado para que el cliente lo
 * pinte como tomado sin releer el server.
 */
export type CreateFirstBookingResult =
  | { success: true; booking: { courtId: string; timeStart: string; timeEnd: string } }
  | { success: false; error: string }
