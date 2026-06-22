/** Tarea #9: el jugador no tiene deuda pendiente en este complejo. */
export class NoDebtError extends Error {
  name = 'NoDebtError'
  constructor() {
    super('El jugador no tiene deuda pendiente en este complejo.')
  }
}

/** Tarea #9: el pago supera la deuda pendiente (la deuda no es una billetera). */
export class DebtOverpaymentError extends Error {
  name = 'DebtOverpaymentError'
  constructor(public readonly balance: number) {
    super('El monto supera la deuda pendiente.')
  }
}
