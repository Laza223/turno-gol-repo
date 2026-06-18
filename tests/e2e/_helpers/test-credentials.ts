/**
 * Contraseña fija de los usuarios STAFF sembrados para E2E. Centralizada acá
 * para que seed-e2e (creación) y los specs de login (uso) no se desincronicen.
 *
 * SOLO test: si esto se ejecutara con NODE_ENV=production sería un backdoor
 * (una contraseña conocida en cuentas reales). Por eso el guard duro.
 */
if (process.env.NODE_ENV === 'production') {
  throw new Error('test-credentials importado en producción: abortando (sería un backdoor).')
}

export const E2E_TEST_PASSWORD = 'e2e-Test-Password-123'
