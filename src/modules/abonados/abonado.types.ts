export type AbonadoStatus = 'active' | 'paused' | 'canceled'
export type AbonadoPaymentMethod = 'cash' | 'transfer'

export type AbonadoRow = {
  id: string
  tenantId: string
  courtId: string
  playerId: string | null
  contactName: string
  contactPhone: string
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  pricePerSession: number
  monthlyPrice: number
  startsOn: Date
  endsOn: Date | null
  status: AbonadoStatus
  paymentMethod: AbonadoPaymentMethod
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateAbonadoInput = {
  courtId: string
  playerId?: string
  contactName: string
  contactPhone: string
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  pricePerSession: number
  monthlyPrice: number
  startsOn: string
  endsOn?: string
  paymentMethod?: AbonadoPaymentMethod
  notes?: string
}
