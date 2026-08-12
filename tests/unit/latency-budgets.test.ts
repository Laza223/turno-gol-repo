import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LATENCY_BUDGETS } from '@/shared/observability/latency-budgets'

/**
 * B11 — el candado entre el spec y el código.
 *
 * Los 6 presupuestos de latencia son un contrato del negocio y viven en
 * `docs/spec/doc5_rnf.md` §2. Copiarlos a código los vuelve usables (alertas,
 * referencias), pero también crea la posibilidad de que las dos copias se
 * separen en silencio: alguien afloja un número en el markdown y el código
 * sigue diciendo el viejo, o al revés. Este test parsea la tabla del spec y
 * exige que coincidan.
 *
 * Se parsea el spec y no al revés a propósito: **manda el documento**. Si el
 * número cambia, cambia ahí primero.
 */
const SPEC = path.resolve(__dirname, '..', '..', 'docs', 'spec', 'doc5_rnf.md')

type SpecRow = { operation: string; p95Ms: number; p99Ms: number }

/** "1.500ms" / "500ms" → 1500 / 500. El spec usa punto como separador de miles. */
function parseMs(cell: string): number | null {
  const m = cell.trim().match(/^([\d.]+)\s*ms$/)
  if (!m) return null
  return Number(m[1]!.replace(/\./g, ''))
}

function specBudgets(): SpecRow[] {
  const rows: SpecRow[] = []
  for (const line of readFileSync(SPEC, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    // | Operación | Límite p95 | Límite p99 | Justificación |
    if (cells.length < 5) continue
    const p95 = parseMs(cells[2]!)
    const p99 = parseMs(cells[3]!)
    // Saltea el encabezado, el separador y la fila de email (p95 = "N/A").
    if (p95 === null || p99 === null) continue
    rows.push({ operation: cells[1]!, p95Ms: p95, p99Ms: p99 })
  }
  return rows
}

describe('presupuestos de latencia: código vs doc5 §2', () => {
  it('el spec sigue teniendo una tabla parseable', () => {
    // Sin esto, un cambio de formato del markdown dejaría el test verde
    // comparando dos listas vacías.
    expect(specBudgets().length).toBe(6)
  })

  it('son los mismos 6, con los mismos números', () => {
    const fromSpec = specBudgets()
      .map((r) => `${r.operation} | ${r.p95Ms} | ${r.p99Ms}`)
      .sort()
    const fromCode = LATENCY_BUDGETS.map((b) => `${b.operation} | ${b.p95Ms} | ${b.p99Ms}`).sort()
    expect(fromCode).toEqual(fromSpec)
  })

  it('cada presupuesto declara dónde se mide', () => {
    // Un presupuesto sin transacción atada es el estado del que sale B11: un
    // número en un documento que nadie puede verificar.
    for (const b of LATENCY_BUDGETS) {
      expect(b.servedBy.length, `${b.id} no declara servedBy`).toBeGreaterThan(0)
    }
  })

  it('el p99 nunca es más exigente que el p95', () => {
    for (const b of LATENCY_BUDGETS) {
      expect(b.p99Ms, `${b.id} tiene p99 < p95`).toBeGreaterThanOrEqual(b.p95Ms)
    }
  })

  it('los ids son únicos', () => {
    const ids = LATENCY_BUDGETS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
