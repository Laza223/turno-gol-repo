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
