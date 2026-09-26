/**
 * Cuántas cosas por completar tiene cada zona del panel. El layout lo calcula una
 * vez y de ahí salen el punto rojo del menú y el de la pestaña Perfil. Vive acá y
 * no en un módulo de dominio porque lo consumen componentes de UI, que no pueden
 * importar dominio como valor (`NO_SETUP_ALERTS`); y no en el archivo del provider
 * porque ese es 'use client' y el layout —servidor— necesita el valor de verdad.
 */
export interface SetupAlerts {
  /** Canchas sin ninguna foto (se avisa en Canchas). */
  courts: number
  /** Faltantes de la página pública (se avisa en Ajustes → Página pública). */
  profile: number
}

export const NO_SETUP_ALERTS: SetupAlerts = { courts: 0, profile: 0 }
