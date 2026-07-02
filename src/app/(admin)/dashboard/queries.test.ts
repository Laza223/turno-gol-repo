import { describe, it } from 'vitest'

// La lógica derivable (ocupación, próximos, señas pendientes, madrugada
// operativa) es pura y está cubierta en tests/unit/dashboard-lib.test.ts.
// Lo que queda acá exige DB real → integration (pendiente).

describe('getDashboardData', () => {
  it.todo('devuelve caja/ocupación/pendientes/deudas/próximos del día ART')
})

describe('getChecklistState', () => {
  it.todo('returns all 7 boolean checklist fields')
})
