import { z } from 'zod'

/**
 * Motivo de cancelación: lista CERRADA (decisión de Lazar, 2026-11-08, migr. 109).
 *
 * El motivo es un dato para el dueño ("este mes se cayeron 4 por lluvia"), no una
 * nota sobre una persona: por eso NO hay texto libre (Ley 25.326, veto de
 * CLAUDE.md). Agregar un motivo es aditivo (ALTER TYPE ... ADD VALUE + esta lista
 * + el label); agregar texto libre no se concede.
 */
export const CANCEL_REASONS = [
  'rain',
  'no_players',
  'rival_no_show',
  'reschedule',
  'injury_or_issue',
  'court_unavailable',
  'complex_event',
  'other',
] as const

export type CancelReason = (typeof CANCEL_REASONS)[number]

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  rain: 'Llueve',
  no_players: 'No juntamos gente',
  rival_no_show: 'El otro equipo no viene',
  reschedule: 'Cambiamos de día u horario',
  injury_or_issue: 'Lesión o imprevisto',
  court_unavailable: 'Cancha no disponible',
  complex_event: 'Evento del complejo',
  other: 'Otro motivo',
}

/** Lo que ve el jugador: no puede decir que la cancha no está ni que hay evento. */
export const PLAYER_CANCEL_REASONS: readonly CancelReason[] = [
  'rain',
  'no_players',
  'rival_no_show',
  'reschedule',
  'injury_or_issue',
  'other',
]

export const cancelReasonSchema = z.enum(CANCEL_REASONS)
