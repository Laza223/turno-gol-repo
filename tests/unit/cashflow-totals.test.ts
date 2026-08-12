import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { balanceFrom, collectedFrom } from '@/modules/cashflow/totals'

/**
 * B14 — las dos cuentas del día. Existen como funciones porque el criterio de
 * salida de Fase 1 pide fuente única de agregados: el mismo número en toda
 * superficie que lo muestre. Estos tests fijan QUÉ es cada una; el test de
 * consistencia de que el endpoint y `getDaySummary` devuelven lo mismo vive en
 * `tests/integration/admin-day-total-endpoint.test.ts`.
 */
describe('collectedFrom — lo cobrado', () => {
  it('suma ingresos y ajustes', () => {
    expect(collectedFrom({ totalIncome: 4_500_000, totalAdjustments: 120_000 })).toBe(4_620_000)
  })

  it('NO resta los egresos: no recibe el dato siquiera', () => {
    // La firma es el candado. Si "lo cobrado" pudiera ver los egresos, tarde o
    // temprano alguien los restaría y el sidebar mostraría el saldo con el
    // nombre equivocado.
    const parts = { totalIncome: 1_000_000, totalAdjustments: 0, totalExpense: 900_000 }
    expect(collectedFrom(parts)).toBe(1_000_000)
  })

  it('un ajuste negativo baja lo cobrado', () => {
    // Los ajustes existen para corregir un cobro mal cargado; si no restaran,
    // corregir un error de más lo dejaría contado dos veces.
    expect(collectedFrom({ totalIncome: 500_000, totalAdjustments: -50_000 })).toBe(450_000)
  })

  it('un día sin movimientos da 0, no null', () => {
    // 0 es un dato ("todavía no entró nada"), distinto de "no pude preguntar".
    expect(collectedFrom({ totalIncome: 0, totalAdjustments: 0 })).toBe(0)
  })
})

describe('balanceFrom — el saldo', () => {
  it('es lo cobrado menos los egresos', () => {
    const parts = { totalIncome: 4_500_000, totalAdjustments: 0, totalExpense: 800_000 }
    expect(balanceFrom(parts)).toBe(3_700_000)
  })

  it('difiere de collectedFrom exactamente en los egresos', () => {
    // Esta es la relación que hace que confundirlos sea caro: con egresos en 0
    // los dos números coinciden, así que un cableado equivocado pasa
    // desapercibido hasta el primer día que el complejo paga algo.
    const parts = { totalIncome: 3_000_000, totalAdjustments: 250_000, totalExpense: 640_000 }
    expect(collectedFrom(parts) - balanceFrom(parts)).toBe(parts.totalExpense)
  })

  it('puede dar negativo: un día de solo gastos no se recorta a 0', () => {
    expect(balanceFrom({ totalIncome: 0, totalAdjustments: 0, totalExpense: 300_000 })).toBe(
      -300_000,
    )
  })
})

/**
 * El candado de la fuente única.
 *
 * Los tests de arriba prueban que las funciones calculan bien; ninguno impide
 * que alguien vuelva a escribir la suma a mano en una pantalla nueva, que es
 * exactamente cómo estaba el repo antes de B14 (cuatro copias de "lo cobrado" y
 * dos del "saldo", sobre dos tipos distintos). El tipo no lo puede frenar: es
 * una suma de dos `number`.
 *
 * Por eso el candado es textual. No pretende ser un parser: busca la forma
 * literal `totalIncome + totalAdjustments` fuera de `totals.ts`, que es como se
 * escribe naturalmente.
 */
describe('fuente única: nadie vuelve a sumar los totales a mano', () => {
  const OWNER = 'src/modules/cashflow/totals.ts'
  // El propio test menciona los campos en sus casos, y las stories/fixtures los
  // usan como datos. Lo que no puede haber es la SUMA escrita en otro lado.
  const ALLOWED = new Set([OWNER, 'tests/unit/cashflow-totals.test.ts'])

  const trackedFiles = (): string[] =>
    execFileSync('git', ['ls-files', 'src', 'tests'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

  it('la suma ingresos+ajustes solo se escribe en totals.ts', () => {
    const offenders: string[] = []
    let inspected = 0

    for (const file of trackedFiles()) {
      if (ALLOWED.has(file)) continue
      let source: string
      try {
        source = readFileSync(file, 'utf8')
      } catch {
        continue // archivo borrado en el índice pero todavía trackeado
      }
      inspected += 1
      // Cualquier receptor: `summary.totalIncome + summary.totalAdjustments`,
      // `close.totalIncome + close.totalAdjustments`, o los campos pelados.
      const handWritten = /\btotalIncome\s*\+\s*(?:\w+\.)?totalAdjustments\b/
      source.split('\n').forEach((line, i) => {
        const trimmed = line.trim()
        // Los comentarios se saltean: describir la cuenta en prosa no la
        // duplica. El primer intento de este candado marcó un docblock de
        // `CajaHeaderStats` — misma clase de falso positivo que ya está
        // documentada en `sql-number-type-honesty.test.ts`.
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return
        if (handWritten.test(line)) offenders.push(`${file}:${i + 1}: ${trimmed}`)
      })
    }

    // Sin esta línea, un glob roto deja el test verde sin haber mirado nada.
    expect(inspected).toBeGreaterThan(100)
    expect(offenders).toEqual([])
  })
})
