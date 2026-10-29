// Mapa código de dominio → texto para el jugador (es-AR, voz de empresa). Tiene que
// cubrir TODOS los `RivalErrorCode`: el `Record` lo exige en compilación y
// `tests/unit/rival-error-copy.test.ts` lo recorre. Los bans no dicen el motivo (spec §8).
import { RivalError, type RivalErrorCode } from './rival.errors'
import { COURT_REQUIRED_MESSAGE } from './rival.schema'

const FALLBACK = 'Algo falló de nuestro lado. Probá de nuevo en unos segundos.'

const COPY: Record<RivalErrorCode, string> = {
  rival_not_found: 'No encontramos ese partido. Revisá el link con quien te lo pasó.',
  rival_no_session: 'Ingresá a tu cuenta para seguir.',
  rival_expired: 'Este partido ya empezó, así que no admite cambios.',
  rival_canceled: 'Este partido se cayó.',
  rival_full: 'No queda lugar: el partido ya está completo.',
  rival_banned: 'No podés sumarte a partidos en este complejo.',
  rival_limit_active:
    'Ya tenés 3 partidos armados. Cancelá uno o esperá a que se juegue para armar otro.',
  rival_limit_requests:
    'Ya tenés 5 pedidos pendientes. Esperá a que te respondan o bajate de alguno.',
  rival_forbidden_transition:
    'Eso ya no se puede hacer: el partido cambió. Actualizá la página y mirá cómo quedó.',
  rival_immutable: 'Un partido no se edita: cancelalo y armá otro.',
  rival_not_on_board:
    'Este partido ya no está en el tablón. Volvé al tablón para ver los que siguen abiertos.',
  rival_hidden: 'Este partido no está disponible.',
  rival_booking_mismatch:
    'La reserva no coincide con el complejo o el horario. Revisá los datos o confirmá que ya tenés la cancha.',
  rival_court_required: COURT_REQUIRED_MESSAGE,
  rival_contact_required: 'Ingresá tu WhatsApp para publicar en el tablón.',
  rival_invalid_report: 'No pudimos registrar esa denuncia. Probá de nuevo.',
  rival_captain_taken: 'Ya hay un equipo rival confirmado para este partido.',
  rival_forbidden: 'No podés hacer eso en este partido.',
  rival_try_again: 'Había mucho movimiento. Probá de nuevo.',
  rival_already_participant: 'Ya estás en este partido.',
  rival_already_reported: 'Ya enviaste esta denuncia.',
  rival_tenant_unavailable: 'Ese complejo no está disponible para armar partidos. Elegí otro.',
  rival_welcome_required: 'Antes de seguir, aceptá las reglas de RIVAL.',
  rival_profile_required: 'Antes de sumarte, contanos tu posición y tu zona.',
  rival_capacity_mismatch: 'Para buscar rival, tu equipo tiene que ser del tamaño del formato.',
}

/** Textos que las actions y las vistas repiten: un solo lugar. */
export const RIVAL_NO_SESSION_MESSAGE = COPY.rival_no_session
export const RIVAL_DISABLED_MESSAGE = 'RIVAL todavía no está disponible.'
export const RIVAL_RATE_LIMITED_MESSAGE =
  'Hiciste muchos cambios seguidos. Esperá un momento y probá de nuevo.'
/** Cuando la action ni siquiera responde (sin conexión): lo muestran las vistas del cliente. */
export const RIVAL_OFFLINE_MESSAGE = 'No pudimos conectar. Revisá tu conexión y probá de nuevo.'

/** Con el partido lleno entra al banco: la etiqueta no promete un lugar. */
export const voyLabel = (full: boolean) => (full ? 'Voy al banco' : 'Voy')

/** Texto para mostrar. Un error que no es de RIVAL cae en el genérico (el caller lo reporta a Sentry). */
export function rivalErrorMessage(err: unknown): string {
  return err instanceof RivalError ? COPY[err.code] : FALLBACK
}
