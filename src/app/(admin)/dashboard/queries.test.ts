import { describe, it } from 'vitest'

// getDashboardData se retiró en Fase 2 (docs/planning/2026-08-01-decisiones-de-fase-v2.md
// §3): la pantalla "Hoy" usa getHoyData (src/modules/home/home.service.ts),
// cubierta en tests/integration/home-service.test.ts. Acá solo queda lo
// propio de este módulo — la lógica derivable ya está en dashboard-lib.test.ts.

describe('getChecklistState', () => {
  it.todo('returns all 7 boolean checklist fields')
})
