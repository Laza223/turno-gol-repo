/** Un móvil argentino en formato wa.me es 549 + área + abonado: 12 o 13 dígitos. */
const AR_MIN_DIGITS = 12
const AR_MAX_DIGITS = 13

/** Piso para un número de otro país. Debajo de esto no es un teléfono. */
const FOREIGN_MIN_DIGITS = 8

/**
 * Teléfono libre → los dígitos que espera `wa.me`, o `null` si no hay nada
 * marcable.
 *
 * Por qué esto no puede confiar en lo que está guardado: `parsePhoneNumber`
 * (`components/ui/phone-input.tsx`) BORRA el 9 de los móviles argentinos al
 * parsear, y `formatFullPhone` recompone "+54 <nacional>". O sea que el propio
 * formulario de `/settings/perfil` destruye el marcador de móvil en cada
 * guardado. Un `+54 2323 346976` guardado así es un fijo para WhatsApp y el
 * link no abre ninguna conversación. La normalización tiene que pasar acá, al
 * construir el link, cada vez.
 *
 * Cómo se decide el país: por el `+` explícito, no por los dígitos. Adivinarlo
 * desde los dígitos es imposible — un teléfono porteño escrito como
 * "11 1234-5678" empieza igual que uno de Estados Unidos. Sin `+` se asume
 * Argentina, que es el mismo default que ya toma el selector de país del
 * formulario.
 *
 * Devolver `null` en vez de un link dudoso es deliberado: un `wa.me` roto —que
 * abre WhatsApp y dice "el número no está en WhatsApp"— es peor que no ofrecer
 * el botón, porque el jugador cree que escribió y nadie recibió nada.
 */
export function toWhatsappDigits(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 0) return null

  // Otro país declarado con +: se respeta tal cual. Las reglas de móvil de
  // abajo son argentinas y aplicarlas a un número uruguayo o español lo
  // romperían.
  if (trimmed.startsWith('+') && !digits.startsWith('54')) {
    return digits.length >= FOREIGN_MIN_DIGITS ? digits : null
  }

  // El 54 inicial solo puede ser el código de país: el único código de área
  // argentino de dos dígitos es el 11.
  const national = normalizeArNational(digits.startsWith('54') ? digits.slice(2) : digits)
  const withMobileMarker = national.startsWith('9') ? national : `9${national}`
  const full = `54${withMobileMarker}`

  if (full.length < AR_MIN_DIGITS || full.length > AR_MAX_DIGITS) return null
  return full
}

/**
 * Nacional argentino tal como lo escribe una persona → área + abonado pelado.
 *
 * Saca el 0 de larga distancia y el 15 de móvil, que es como se marca dentro
 * del país pero no es parte del número internacional: "02323 15 346976" y
 * "+54 9 2323 346976" son el mismo teléfono.
 */
function normalizeArNational(national: string): string {
  const rest = national.startsWith('0') ? national.slice(1) : national

  // Un nacional que ya empieza con 9 trae el marcador de móvil internacional y
  // NO puede pasar por la limpieza del 15: en "9 11 5566-7788" el "15" del
  // medio es parte del área y del abonado, no un prefijo de marcación, y
  // sacarlo destruye el número. (Ninguna característica argentina empieza con
  // 9, así que ese 9 inicial solo puede ser el marcador.)
  if (rest.startsWith('9')) return rest

  // El 15 va después del código de área (2 a 4 dígitos), nunca al principio, y
  // solo cuenta si lo que queda son los 10 dígitos de un número argentino: sin
  // esa comprobación el patrón se come cualquier "15" que caiga en esa
  // posición por casualidad.
  const with15 = rest.match(/^(\d{2,4})15(\d{6,8})$/)
  if (with15) {
    const stripped = `${with15[1]}${with15[2]}`
    if (stripped.length === 10) return stripped
  }
  return rest
}

/**
 * Arma un link `wa.me` a partir de un teléfono libre (`tenants.whatsapp`,
 * `tenants.phone`, `players.phone`).
 *
 * Devuelve `null` cuando no hay nada marcable, para que quien llama esconda el
 * botón en vez de ofrecer un link que no lleva a ninguna parte.
 */
export function buildWhatsappUrl(raw: string | null | undefined, message?: string): string | null {
  const digits = toWhatsappDigits(raw)
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  if (message && message.trim().length > 0) {
    return `${base}?text=${encodeURIComponent(message)}`
  }
  return base
}
