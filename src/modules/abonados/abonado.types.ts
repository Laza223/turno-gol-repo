import type {
  AbonadoBillingMode,
  SettlementChargeLine,
  SettlementPaymentOrigin,
} from '@/modules/settlements/settlement.types'

export type AbonadoStatus = 'active' | 'paused' | 'canceled'
export type AbonadoPaymentMethod = 'cash' | 'transfer'
export type { AbonadoBillingMode }

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
  billingMode: AbonadoBillingMode
  agreedAmount: number
  startsOn: Date
  endsOn: Date | null
  status: AbonadoStatus
  paymentMethod: AbonadoPaymentMethod
  createdAt: Date
  updatedAt: Date
}

type InitialAbonadoSettlementInput = {
  kind: 'pack' | 'monthly'
  paymentOrigin: SettlementPaymentOrigin
  amount: number
  creditsTotal?: number
  month?: string
  charges?: SettlementChargeLine[]
  clientIdempotencyKey?: string
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
  billingMode?: AbonadoBillingMode
  agreedAmount?: number
  initialSettlement?: InitialAbonadoSettlementInput
  startsOn: string
  endsOn?: string
  paymentMethod?: AbonadoPaymentMethod
}

/** Cambios de "Editar turno fijo": valen para todas las fechas futuras. */
export type UpdateAbonadoInput = {
  courtId?: string
  contactName?: string
  contactPhone?: string
  dayOfWeek?: number
  timeStart?: string
  timeEnd?: string
  pricePerSession?: number
}

/** Cuántas fechas futuras terminaron en cada caso (preview y resultado real). */
export type UpdateAbonadoCounts = {
  /** Fechas futuras confirmadas que entran en la edición. */
  futureSessions: number
  /** Fechas a las que se les cambió el precio. */
  priceUpdated: number
  /** Fechas con un precio puesto a mano: se respetan. */
  keptOwnPrice: number
  /** Fechas donde lo cobrado supera el precio nuevo: se respetan. */
  keptPaid: number
  /** Fechas que se mueven de día, horario o cancha. */
  moved: number
}

type UpdateAbonadoMoveNotes = {
  /** Fechas que se quedan en el horario anterior (ya pasaron o quedan después del fin del fijo). */
  notMoved: number
}

export type UpdateAbonadoPreview = UpdateAbonadoCounts &
  UpdateAbonadoMoveNotes & {
    /** Fechas (YYYY-MM-DD) que chocan con otra reserva si se mueve. Vacío si no hay choque. */
    conflictDates: string[]
    /** Otro turno fijo activo ocupa el nuevo día, horario y cancha. */
    fixedConflict: boolean
  }

export type UpdateAbonadoOutcome = {
  abonado: AbonadoRow
} & UpdateAbonadoCounts

export type UpdateAbonadoAgreementInput = {
  abonadoId: string
  billingMode: AbonadoBillingMode
  pricePerSession: number
  agreedAmount: number
}
