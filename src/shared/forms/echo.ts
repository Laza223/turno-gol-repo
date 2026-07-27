/**
 * Devolver al formulario lo que el usuario ya había escrito cuando la
 * validación falla.
 *
 * ¿Por qué hace falta? Los formularios de auth usan `<form noValidate>` (para
 * mostrar los mensajes del servidor en vez de los tooltips del navegador), así
 * que TODA validación viaja al servidor. Y sus inputs son NO CONTROLADOS: al
 * re-renderizar con el estado de error vuelven vacíos.
 *
 * Resultado sin esto: el dueño que se equivoca al repetir la contraseña pierde
 * nombre, apellido, email y las dos contraseñas; el jugador que se olvida de
 * tildar el +18 pierde nombre, apellido y email. Verificado en navegador real
 * antes de escribir este archivo.
 *
 * El patrón correcto ya existía en `ProfileForm.tsx` (7 `defaultValue`); esto
 * lo hace reutilizable para los que faltaban.
 *
 * ⚠️ NUNCA pasar campos de contraseña por acá. El eco viaja al cliente dentro
 * del estado de la Server Action y termina serializado en el payload RSC.
 */

/** Campos que jamás se devuelven al cliente, aunque los pidan por nombre. */
const CAMPOS_PROHIBIDOS = new Set([
  'password',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'token',
  'token_hash',
  'code',
])

/**
 * Extrae los campos de texto pedidos, tal cual los escribió el usuario (sin
 * normalizar: si tipeó "  Juan " se le devuelve "  Juan " para que el cursor y
 * el contenido queden donde los dejó).
 *
 * Los valores no-string (un File de un input de archivo) se omiten.
 */
export function echoFields<K extends string>(
  formData: FormData,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  for (const key of keys) {
    if (CAMPOS_PROHIBIDOS.has(key)) continue
    const raw = formData.get(key)
    if (typeof raw === 'string') out[key] = raw
  }
  return out
}

/** Igual que `echoFields` pero para una casilla: devuelve si estaba tildada. */
export function echoChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on'
}
