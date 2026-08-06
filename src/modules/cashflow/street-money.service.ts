/**
 * "Plata en la calle" (Fase 1 del contrato — docs/planning/2026-08-01-decisiones-de-fase-v2.md
 * §3): una sola vista que suma los 3 orígenes de deuda hoy desperdigados en
 * módulos distintos — turnos jugados sin cobrar, fiados de cantina abiertos,
 * cuotas de inscripción de torneo impagas.
 *
 * Fuente única de agregados (criterio de salida #5 del contrato): esta es la
 * ÚNICA función que arma el listado y el ÚNICO lugar donde se suma el total.
 * Todo lugar que muestre el número de "plata en la calle" (encabezado de
 * Caja, tab /caja/deudas) llama a getStreetMoney/sumStreetMoney — nunca
 * recalcula por su cuenta.
 */
import type { DbTx } from '@/shared/db/client'
import { getDebts } from '@/modules/bookings/booking.debts'
import { listOpenTabs } from '@/modules/canteen/canteen-tab.service'
import { listTenantInscriptionDebts } from '@/modules/tournaments/tournament-payment.service'

export type StreetMoneyOrigin = 'booking' | 'canteen_tab' | 'tournament'

export type BookingStreetMoneyRow = {
  origin: 'booking'
  /** bookingId — lo que pide chargeDebtAction. */
  refId: string
  debtorName: string
  pendingCents: number
  /** Cuándo se jugó el turno: el momento en que empezó a ser deuda. */
  since: Date
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  /**
   * Jugador registrado detrás de la deuda, si lo hay (`null` en turnos de
   * invitado). Fase 4 lo agregó al absorber `/jugadores/deudas`: sancionar a
   * un moroso vive en su ficha (`/jugadores/[playerId]`), y sin este dato la
   * lista de deuda no tenía cómo llegar hasta ahí.
   */
  playerId: string | null
  /**
   * Teléfono de contacto del turno, para el link de WhatsApp. Lo tenía la
   * lista vieja de `/jugadores/deudas` y se habría perdido al absorberla:
   * mandar un mensaje es LA acción real de cobranza de un turno atrasado.
   */
  contactPhone: string | null
}

export type CanteenStreetMoneyRow = {
  origin: 'canteen_tab'
  /** tabId — lo que pide settleTabAction. */
  refId: string
  debtorName: string
  pendingCents: number
  since: Date
  note: string | null
}

export type TournamentStreetMoneyRow = {
  origin: 'tournament'
  /** teamId — lo que pide registerInscriptionPaymentAction. */
  refId: string
  debtorName: string
  pendingCents: number
  since: Date
  tournamentId: string
  tournamentName: string
}

export type StreetMoneyRow =
  | BookingStreetMoneyRow
  | CanteenStreetMoneyRow
  | TournamentStreetMoneyRow

/**
 * Los 3 orígenes, unidos y ordenados por antigüedad ascendente (más vieja
 * primero — el criterio del contrato: "ordenado por antigüedad").
 *
 * El `Promise.all` corre las 3 queries en la misma tx, pero NO comparten una
 * única snapshot: bajo READ COMMITTED (default, nadie sube el nivel acá) cada
 * SELECT toma la suya al ejecutarse. Si un cobro de otro origen commitea
 * justo entre medio, la respuesta puede mezclar un estado "antes" con uno
 * "después" — una foto momentáneamente inconsistente entre dos refrescos, no
 * un cash_flow mal calculado: los 3 orígenes son conjuntos disjuntos (cada
 * turno/fiado/equipo aparece en uno solo), así que esto nunca duplica ni
 * pierde plata dentro de una misma respuesta.
 */
export async function getStreetMoney(tenantId: string, tx: DbTx): Promise<StreetMoneyRow[]> {
  const [debts, tabs, teams] = await Promise.all([
    getDebts(tenantId, tx),
    listOpenTabs(tenantId, tx),
    listTenantInscriptionDebts(tenantId, tx),
  ])

  const rows: StreetMoneyRow[] = [
    ...debts.map(
      (d): BookingStreetMoneyRow => ({
        origin: 'booking',
        refId: d.id,
        debtorName: d.contactName ?? 'Sin nombre',
        pendingCents: d.pending,
        since: new Date(d.startsAt),
        courtName: d.courtName,
        date: d.date,
        timeStart: d.timeStart,
        timeEnd: d.timeEnd,
        playerId: d.playerId,
        contactPhone: d.contactPhone,
      }),
    ),
    ...tabs.map(
      (t): CanteenStreetMoneyRow => ({
        origin: 'canteen_tab',
        refId: t.id,
        debtorName: t.debtorName,
        pendingCents: t.totalAmount,
        since: t.createdAt,
        note: t.note,
      }),
    ),
    ...teams.map(
      (t): TournamentStreetMoneyRow => ({
        origin: 'tournament',
        refId: t.teamId,
        debtorName: t.teamName,
        pendingCents: t.pending,
        since: t.createdAt,
        tournamentId: t.tournamentId,
        tournamentName: t.tournamentName,
      }),
    ),
  ]

  return rows.sort((a, b) => a.since.getTime() - b.since.getTime())
}

/** El número — pure, unit-testeable. Es EL total de "plata en la calle". */
export function sumStreetMoney(rows: StreetMoneyRow[]): number {
  return rows.reduce((sum, r) => sum + r.pendingCents, 0)
}
