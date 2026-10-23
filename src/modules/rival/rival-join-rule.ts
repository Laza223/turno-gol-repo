import type { RivalParticipantStatus } from './rival.types'

/**
 * ¿El "Voy" firmado de la vuelta del login se envía solo? Solo si la bienvenida ya está aceptada y
 * el jugador NO tiene fila en el partido (sea cual sea su estado): el intento existe para sumar a
 * quien todavía no está. Quien se bajó (`left`) o ya está adentro no se vuelve a sumar aunque el
 * token siga vivo (el link del mail dura una hora, la cookie de Google diez minutos): vuelve
 * tocando "Voy".
 */
export function shouldAutoJoin(args: {
  intentOk: boolean
  welcomeDone: boolean
  myStatus: RivalParticipantStatus | null
}): boolean {
  return args.intentOk && args.welcomeDone && args.myStatus === null
}
