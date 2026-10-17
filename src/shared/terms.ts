/**
 * Current terms-of-service version accepted by players.
 *
 * Bump this constant when the /terms content changes.  All players whose
 * stored terms_version differs from this value will be prompted to re-accept
 * on next login (once the re-prompt flow is implemented in v1.5).
 *
 * Can also be overridden at runtime via TERMS_VERSION env var without redeploy.
 */
export const CURRENT_TERMS_VERSION: string = process.env.TERMS_VERSION ?? 'v1'

/**
 * El error de la casilla de términos y +18. Lo dice el servidor (`reservar/actions.ts`) y el
 * cliente, que chequea la casilla antes de enviar (`LoginGate`): con un solo texto no pueden
 * contradecirse.
 */
export const TERMS_REQUIRED_MESSAGE = 'Tenés que aceptar los términos.'
