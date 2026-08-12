import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Compara un secreto recibido contra el esperado en tiempo constante.
 *
 * `timingSafeEqual` TIRA si los buffers miden distinto, así que compararlos
 * crudos obliga a un `a.length !== b.length` previo — y ese pre-chequeo filtra
 * la longitud del secreto por timing, que es justo lo que se quería evitar.
 * Hashear ambos lados con SHA-256 primero los lleva a 32 bytes fijos: la
 * comparación es siempre del mismo largo y no revela nada del valor esperado.
 *
 * No sirve para firmas HMAC (ahí los digests ya son de largo fijo y el repo
 * compara directo en `webhook-auth.ts` / `impersonation-cookie.ts`): esto es
 * para tokens compartidos de largo arbitrario que llegan en un header.
 */
export function secretMatches(provided: string, expected: string): boolean {
  if (expected.length === 0) return false
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}
