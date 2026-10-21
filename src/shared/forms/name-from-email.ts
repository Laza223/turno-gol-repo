const MAX_NAME_LENGTH = 80
const FALLBACK_NAME = 'Jugador'

/**
 * El nombre del jugador cuando el ingreso es solo con email: sale de la parte local, sin el
 * `+alias`, partida en `.` `_` `-`, sin dígitos ni símbolos y con cada palabra capitalizada
 * (`lazaro.feijoo2004@gmail.com` → "Lazaro Feijoo"). Si no queda ninguna letra, "Jugador".
 * Se calcula en el servidor: el cliente no decide el nombre.
 */
export function nameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? '').split('+')[0] ?? ''
  const name = local
    .split(/[._-]+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toLocaleUpperCase('es-AR') + word.slice(1).toLocaleLowerCase('es-AR'),
    )
    .join(' ')
    .slice(0, MAX_NAME_LENGTH)
    .trim()
  return name || FALLBACK_NAME
}
