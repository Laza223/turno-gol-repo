/**
 * Los presupuestos de latencia de `doc5_rnf.md` §2, en código y atados a la
 * transacción que los sirve.
 *
 * B11 — hasta acá los 6 presupuestos vivían SOLO en una tabla de markdown.
 * Nadie los había conectado a un endpoint concreto, y la única alerta de
 * latencia configurada era un `p95 > 2s` global: con eso, la grilla puede correr
 * a **4× su presupuesto** (500 ms) sin que nada suene. Un presupuesto que no
 * está atado a nada medible no es un presupuesto, es una aspiración.
 *
 * Este archivo NO mide ni alerta por sí solo — las reglas de alerta viven en la
 * UI de Sentry por decisión ya tomada (ver el bloque de comentarios de
 * `sentry.server.config.ts`, que las lista con estos mismos números). Lo que
 * hace es ser la fuente única: el que carga las alertas copia de acá, y
 * `tests/unit/latency-budgets.test.ts` falla si estos valores se separan de los
 * de doc5.
 *
 * Los nombres de transacción son los que emite `@sentry/nextjs`: la ruta para
 * páginas y route handlers, y `POST /<ruta>` con el nombre de la función para
 * Server Actions. Verificados contra el árbol de rutas, no adivinados.
 */

export type LatencyBudget = {
  /** Slug estable para referenciar el presupuesto sin repetir el texto. */
  id: string
  /** La operación tal cual la nombra doc5 §2 — el texto es el contrato. */
  operation: string
  p95Ms: number
  p99Ms: number
  /**
   * Dónde se mide. Más de una entrada cuando la misma operación la sirven dos
   * superficies (la grilla del staff y la del portal público son la misma
   * pregunta del negocio con dos implementaciones).
   */
  servedBy: readonly string[]
  /** Por qué ese número, en las palabras de la spec. */
  why: string
}

export const LATENCY_BUDGETS: readonly LatencyBudget[] = [
  {
    id: 'availability_grid',
    operation: 'Cargar grilla de disponibilidad',
    p95Ms: 500,
    p99Ms: 800,
    servedBy: ['/grilla', 'GET /api/public/availability'],
    why: 'El recepcionista la consulta 20-30 veces por turno',
  },
  {
    id: 'admin_booking_confirm',
    operation: 'Confirmar reserva manual (admin)',
    p95Ms: 1_500,
    p99Ms: 2_500,
    // Server Action `createBookingAction` (src/app/(admin)/reservas/actions.ts).
    servedBy: ['POST /reservas'],
    why: 'Hay alguien esperando en el mostrador',
  },
  {
    id: 'online_booking_confirm',
    operation: 'Confirmar reserva online (jugador)',
    p95Ms: 2_000,
    p99Ms: 3_500,
    // Server Action `createBookingAndCheckout` (src/app/(public)/[slug]/reservar/actions.ts).
    servedBy: ['POST /[slug]/reservar'],
    why: 'Incluye llamada a MercadoPago',
  },
  {
    id: 'admin_dashboard',
    operation: 'Cargar dashboard admin',
    p95Ms: 800,
    p99Ms: 1_500,
    servedBy: ['/dashboard'],
    why: 'Se ve al inicio de cada turno',
  },
  {
    id: 'court_search',
    operation: 'Búsqueda de canchas (app jugador)',
    p95Ms: 600,
    p99Ms: 1_000,
    servedBy: ['/explorar', 'GET /api/public/search'],
    why: 'Expectativa de app nativa',
  },
  {
    id: 'reports',
    operation: 'Carga de reportes',
    p95Ms: 2_000,
    p99Ms: 4_000,
    servedBy: ['/reportes', 'GET /api/reports/revenue'],
    why: 'No es tiempo real, puede ser un poco más lento',
  },
] as const
