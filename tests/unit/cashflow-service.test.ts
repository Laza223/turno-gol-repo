import { describe, expect, it } from 'vitest'
import { validateCashFlowCombo } from '@/modules/cashflow/cashflow.service'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'

describe('validateCashFlowCombo', () => {
  // 'expense' es válido desde la migración 025; la 050 amplió sus categorías
  // a 6 (operating_expense legacy + merchandise/salaries/utilities/
  // maintenance/other_expense — ver el describe de migr. 050 más abajo).
  // Este caso cubre categorías que NUNCA fueron válidas para 'expense'.
  it('rejects expense with income/adjustment-only categories', () => {
    expect(() => validateCashFlowCombo('expense', 'other')).toThrow(InvalidCashFlowCategoryError)
    expect(() => validateCashFlowCombo('expense', 'booking')).toThrow(InvalidCashFlowCategoryError)
  })

  it('accepts expense + operating_expense', () => {
    expect(() => validateCashFlowCombo('expense', 'operating_expense')).not.toThrow()
  })

  it('rejects income with operating_expense', () => {
    expect(() => validateCashFlowCombo('income', 'operating_expense')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('rejects unknown type', () => {
    expect(() => validateCashFlowCombo('revenue', 'booking')).toThrow(InvalidCashFlowTypeError)
  })

  it('rejects income with no_show_correction', () => {
    expect(() => validateCashFlowCombo('income', 'no_show_correction')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('rejects adjustment with booking', () => {
    expect(() => validateCashFlowCombo('adjustment', 'booking')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('rejects adjustment with product_sale', () => {
    expect(() => validateCashFlowCombo('adjustment', 'product_sale')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('accepts income + booking', () => {
    expect(() => validateCashFlowCombo('income', 'booking')).not.toThrow()
  })

  it('accepts income + product_sale', () => {
    expect(() => validateCashFlowCombo('income', 'product_sale')).not.toThrow()
  })

  it('accepts income + other', () => {
    expect(() => validateCashFlowCombo('income', 'other')).not.toThrow()
  })

  it('accepts adjustment + other', () => {
    expect(() => validateCashFlowCombo('adjustment', 'other')).not.toThrow()
  })

  it('accepts adjustment + no_show_correction', () => {
    expect(() => validateCashFlowCombo('adjustment', 'no_show_correction')).not.toThrow()
  })

  // migr. 050 — gastos categorizados: 5 categorías nuevas, todas válidas SOLO
  // con type 'expense'. 'operating_expense' (legacy) sigue vigente (la UI ya
  // no la ofrece, pero el service/DB la siguen aceptando para no romper filas
  // históricas).
  describe('migr. 050 — categorías de gasto nuevas', () => {
    it.each(['merchandise', 'salaries', 'utilities', 'maintenance', 'other_expense'])(
      'accepts expense + %s',
      (category) => {
        expect(() => validateCashFlowCombo('expense', category)).not.toThrow()
      },
    )

    it('operating_expense (legacy) sigue siendo válido con expense', () => {
      expect(() => validateCashFlowCombo('expense', 'operating_expense')).not.toThrow()
    })

    it('rejects income + merchandise (categoría de gasto en un ingreso)', () => {
      expect(() => validateCashFlowCombo('income', 'merchandise')).toThrow(
        InvalidCashFlowCategoryError,
      )
    })

    it.each(['salaries', 'utilities', 'maintenance', 'other_expense'])(
      'rejects adjustment + %s',
      (category) => {
        expect(() => validateCashFlowCombo('adjustment', category)).toThrow(
          InvalidCashFlowCategoryError,
        )
      },
    )
  })
})
