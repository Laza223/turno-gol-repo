export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'expired'
  | 'canceled_refunded'
  | 'canceled_no_refund'
  | 'completed'
  | 'no_show'

export type BookingType = 'spontaneous' | 'fixed' | 'block'

export type DepositStatus =
  | 'not_required'
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'captured'

export type PaymentMethodValue = 'cash' | 'transfer' | 'mercadopago' | 'other'

export type CancellationActor = 'player' | 'admin' | 'system'

export type BookingRow = {
  id: string
  tenantId: string
  courtId: string
  playerId: string | null
  abonadoId: string | null
  createdByStaff: string | null
  date: Date
  timeStart: string
  timeEnd: string
  type: BookingType
  status: BookingStatus
  priceSnapshot: number
  depositAmount: number
  depositStatus: DepositStatus
  paymentMethod: PaymentMethodValue | null
  paymentId: string | null
  notesInternal: string | null
  notesPlayer: string | null
  guestName: string | null
  guestPhone: string | null
  canceledReason: string | null
  canceledBy: CancellationActor | null
  canceledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type CreateOnlineBookingInput = {
  playerId: string
  courtId: string
  date: string // YYYY-MM-DD
  timeStart: string // HH:MM
  timeEnd: string // HH:MM
  durationMins: 60 | 120
  requiresDeposit: boolean
  depositPercentage: number
  notesPlayer?: string
  /** When set, rejects dates beyond today+maxAdvanceDays (ART). Omit in e2e/seed routes. */
  maxAdvanceDays?: number
}

export type CreateManualBookingInput = {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  durationMins: 60 | 120
  type: 'spontaneous' | 'block'
  staffUserId: string
  playerId?: string
  guestName?: string
  guestPhone?: string
  priceOverride?: number
  depositAmount?: number
  depositMethod?: PaymentMethodValue
  depositStatus?: DepositStatus
  notesInternal?: string
  notesPlayer?: string
}

export type AvailableSlot = {
  timeStart: string
  timeEnd: string
  price: number | null
  available: boolean
}

export type TransitionResult =
  | { won: true; row: BookingRow }
  | { won: false }
