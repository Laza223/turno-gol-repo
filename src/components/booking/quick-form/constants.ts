export type Slot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
}

export type DepositMethod = 'cash' | 'transfer' | 'mercadopago'

export const DEPOSIT_METHODS: Array<{ value: DepositMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'mercadopago', label: 'MP' },
]
