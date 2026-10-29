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

/**
 * Qué le falta pedir a la bienvenida (decisiones 2, 12 y 15 de 2026-10-28). Para armar alcanzan el
 * nombre y las reglas (`identity`). Para sumarse (a un partido de jugadores) además la posición y la
 * zona. Para desafiar (pedir como capitán de un equipo rival) solo la zona: la posición no le sirve
 * al organizador, que trae a su equipo. `profile` = falta algún dato de perfil de ese propósito;
 * `position` = además hay que pedir la posición. Solo se pide lo que falta. `null` = no falta nada.
 * Las pages pasan `welcomeDone: needs === null` a `shouldAutoJoin`.
 */
export type WelcomePurpose = 'armar' | 'sumarse' | 'desafiar'

export function welcomeNeeds(
  state: { welcomed: boolean; position: string | null; zone: string | null },
  purpose: WelcomePurpose,
): { identity: boolean; profile: boolean; position: boolean } | null {
  const identity = !state.welcomed
  const position = purpose === 'sumarse' && state.position === null
  const profile = position || (purpose !== 'armar' && state.zone === null)
  return identity || profile ? { identity, profile, position } : null
}
