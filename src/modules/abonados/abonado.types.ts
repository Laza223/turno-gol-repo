export type AbonadoStatus = 'active' | 'paused' | 'canceled'
export type AbonadoPaymentMethod = 'cash' | 'transfer'

export type AbonadoRow = {
  id: string
  tenantId: string
  courtId: string
  playerId: string | null
  contactName: string
  // Nullable desde la migr. 088 (D1): el evento semanal puede no tener
  // teléfono. Turno fijo y /abonados/nuevo lo siguen exigiendo en la UI.
  contactPhone: string | null
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  pricePerSession: number
  startsOn: Date
  endsOn: Date | null
  status: AbonadoStatus
  paymentMethod: AbonadoPaymentMethod
  createdAt: Date
  updatedAt: Date
}

export type CreateAbonadoInput = {
  courtId: string
  playerId?: string
  contactName: string
  // Opcional desde la migr. 088: el evento semanal puede no tener teléfono.
  contactPhone?: string
  // Único caller que lo manda: EventoForm (evento semanal). Turno fijo y
  // /abonados/nuevo lo omiten, así que el schema exige `contactPhone`.
  viaWeeklyEvent?: boolean
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  pricePerSession: number
  startsOn: string
  endsOn?: string
  paymentMethod?: AbonadoPaymentMethod
}
