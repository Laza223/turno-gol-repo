import { describe, expect, it } from 'vitest'
import { validateCashFlowCombo } from '@/modules/cashflow/cashflow.service'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'

describe('validateCashFlowCombo', () => {
  // 'expense' es válido desde la migración 025 (rediseño de Caja), pero solo
  // con la categoría operating_expense.
  it('rejects expense with non-operating category', () => {
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
})
