export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'expired'
  | 'canceled_refunded'
  | 'canceled_no_refund'
  | 'completed'
  | 'no_show'

// 'tournament' (migr. 062): hora que posee un torneo. No la crea
// createManualBooking — la materializa reserveTournamentSlots, igual que
// 'fixed' lo hace el flujo de abonados y no el alta manual.
export type BookingType = 'spontaneous' | 'fixed' | 'block' | 'tournament'

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
  tournamentId: string | null
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
  completedByStaff: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateOnlineBookingInput = {
  playerId: string
  courtId: string
  date: string // YYYY-MM-DD
  timeStart: string // HH:MM
  timeEnd: string // HH:MM
  requiresDeposit: boolean
  depositPercentage: number
  notesPlayer?: string
  /** When set, rejects dates beyond today+maxAdvanceDays (ART). Omit in e2e/seed routes. */
  maxAdvanceDays?: number
  /**
   * Método presencial elegido por el jugador (selector de /reservar). Solo se
   * persiste en reservas sin seña: con seña queda null hasta que el webhook
   * P10 setea 'mercadopago' (chk_booking_payment_consistency exige payment_id
   * para mercadopago; cash/transfer exigen payment_id NULL).
   */
  paymentMethod?: 'cash' | 'transfer'
}

export type CreateManualBookingInput = {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
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
