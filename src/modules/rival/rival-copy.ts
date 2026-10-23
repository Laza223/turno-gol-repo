// Mapa código de dominio → texto para el jugador (es-AR, voz de empresa). Tiene que
// cubrir TODOS los `RivalErrorCode`: el `Record` lo exige en compilación y
// `tests/unit/rival-error-copy.test.ts` lo recorre. Los bans no dicen el motivo (spec §8).
import { RivalError, type RivalErrorCode } from './rival.errors'

const FALLBACK = 'No pudimos completar la acción. Probá de nuevo en unos segundos.'

const COPY: Record<RivalErrorCode, string> = {
  rival_not_found: 'No encontramos ese partido.',
  rival_no_session: 'Ingresá a tu cuenta para seguir.',
  rival_expired: 'Este partido ya empezó, así que no admite cambios.',
  rival_canceled: 'Este partido se cayó.',
  rival_full: 'No queda lugar: el partido ya está completo.',
  rival_banned: 'No podés sumarte a partidos en este complejo.',
  rival_limit_active:
    'Ya tenés 3 partidos armados. Cancelá uno o esperá a que se juegue para armar otro.',
  rival_limit_requests:
    'Ya tenés 5 pedidos pendientes. Esperá a que te respondan o bajate de alguno.',
  rival_forbidden_transition: 'Ese cambio ya no se puede hacer en este partido.',
  rival_immutable: 'Un partido no se edita: cancelalo y armá otro.',
  rival_not_on_board: 'Este partido no está en el tablón.',
  rival_hidden: 'Este partido no está disponible.',
  rival_booking_mismatch:
    'La reserva no coincide con el complejo o el horario. Revisá los datos o confirmá que ya tenés la cancha.',
  rival_court_required: 'Confirmá que tenés la cancha: no hay partidos sin cancha.',
  rival_contact_required: 'Falta tu WhatsApp para publicar en el tablón.',
  rival_invalid_report: 'No pudimos registrar esa denuncia.',
  rival_captain_taken: 'Ya hay un equipo rival confirmado para este partido.',
  rival_forbidden: 'No tenés permiso para hacer eso.',
  rival_try_again: 'Había mucho movimiento. Probá de nuevo.',
  rival_already_participant: 'Ya estás en este partido.',
  rival_already_reported: 'Ya lo denunciaste.',
  rival_tenant_unavailable: 'Ese complejo no está disponible para armar partidos.',
  rival_welcome_required: 'Antes de seguir, aceptá las reglas de RIVAL.',
  rival_capacity_mismatch: 'Buscando rival, juegan tantos como el formato.',
}

/** Texto para mostrar. Un error que no es de RIVAL cae en el genérico (el caller lo reporta a Sentry). */
export function rivalErrorMessage(err: unknown): string {
  return err instanceof RivalError ? COPY[err.code] : FALLBACK
}
