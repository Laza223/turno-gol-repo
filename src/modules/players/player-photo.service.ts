import { sql } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import { keyFromPublicUrl } from '@/shared/storage/r2-config'
import { captureException } from '@/lib/sentry'

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024

/** Único prefijo de R2 que este servicio escribe y borra (nunca claves de canchas ni logos). */
export const RIVAL_AVATAR_PREFIX = 'rival/avatars/'

const DELETE_ATTEMPTS = 3
const DELETE_RETRY_DELAY_MS = 300

class PlayerPhotoNotAllowedError extends Error {
  constructor(playerId: string) {
    super(`Player ${playerId} cannot have a photo (missing, anonymized or banned)`)
    this.name = 'PlayerPhotoNotAllowedError'
  }
}

function asciiAt(bytes: Uint8Array, from: number, text: string): boolean {
  return [...text].every((c, i) => bytes[from + i] === c.charCodeAt(0))
}

/**
 * Validación pura del archivo subido. Mira la firma real (`RIFF`....`WEBP`), no el
 * `type` que declara el cliente: el navegador ya recortó y re-encodeó a WebP, así que
 * cualquier otra cosa es un request armado a mano.
 */
export function validatePhotoUpload(
  bytes: Uint8Array,
): { ok: true } | { ok: false; error: string } {
  if (bytes.byteLength === 0) return { ok: false, error: 'Elegí una imagen' }
  if (bytes.byteLength > PHOTO_MAX_BYTES) {
    return { ok: false, error: 'La imagen no puede superar 2MB' }
  }
  if (!asciiAt(bytes, 0, 'RIFF') || !asciiAt(bytes, 8, 'WEBP')) {
    return { ok: false, error: 'La foto tiene que ser una imagen válida' }
  }
  return { ok: true }
}

/**
 * Único camino de borrado de una foto en R2. Solo toca claves bajo `rival/avatars/`:
 * si `avatar_url` apunta a otro host o a otro prefijo (clave de cancha, logo) no borra
 * nada (anti-IDOR). Reintenta y NUNCA lanza: el borrado es un efecto externo posterior
 * al commit y no puede romper la baja del usuario; si agota, deja rastro y el barrido
 * diario de huérfanos lo termina.
 */
export async function deletePlayerPhotoObject(
  url: string | null,
  retryDelayMs = DELETE_RETRY_DELAY_MS,
): Promise<void> {
  if (!url) return
  const key = keyFromPublicUrl(url)
  if (!key || !key.startsWith(RIVAL_AVATAR_PREFIX) || key.includes('..')) return

  // Dynamic import: r2.ts trae el SDK de AWS (ver canchas/actions.ts).
  const { deleteImage } = await import('@/shared/storage/r2')
  let lastError: unknown
  for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
    try {
      await deleteImage(key)
      return
    } catch (err) {
      lastError = err
      if (attempt < DELETE_ATTEMPTS) await new Promise((r) => setTimeout(r, retryDelayMs))
    }
  }
  console.error('[storage] no se pudo borrar la foto de RIVAL', { key })
  captureException(lastError)
}

/**
 * Reemplaza la foto del jugador. Saga (el efecto externo nunca va dentro de la tx):
 * PUT de la nueva → tx que bloquea la fila y cambia el puntero → recién después del
 * commit se borra la vieja. Si la tx falla se compensa borrando la nueva.
 * Quien llama ya validó los bytes (`validatePhotoUpload`) y la sesión del jugador.
 * Devuelve la URL pública nueva.
 */
export async function setPlayerPhoto(playerId: string, bytes: Uint8Array): Promise<string> {
  const { putImage, deleteImage, publicUrl } = await import('@/shared/storage/r2')
  const key = `${RIVAL_AVATAR_PREFIX}${crypto.randomUUID()}.webp`
  const url = publicUrl(key)
  await putImage(key, bytes, 'image/webp', { cacheControl: 'public, max-age=3600' })

  let previousUrl: string | null = null
  try {
    // Pool worker: `players` es global y la tx no lleva contexto de jugador; la
    // autorización la hizo quien llama.
    await getWorkerDb().transaction(async (tx) => {
      const rows = await tx.execute(
        sql`SELECT avatar_url, status FROM players WHERE id = ${playerId} FOR UPDATE`,
      )
      const row = (rows as unknown as Array<{ avatar_url: string | null; status: string }>)[0]
      if (!row || row.status === 'anonymized' || row.status === 'banned') {
        throw new PlayerPhotoNotAllowedError(playerId)
      }
      previousUrl = row.avatar_url
      await tx.execute(sql`UPDATE players SET avatar_url = ${url} WHERE id = ${playerId}`)
    })
  } catch (err) {
    try {
      await deleteImage(key)
    } catch (cleanupErr) {
      // Queda un objeto sin puntero: lo levanta el barrido diario de huérfanos.
      captureException(cleanupErr)
    }
    throw err
  }

  await deletePlayerPhotoObject(previousUrl)
  return url
}

/**
 * Deja al jugador sin foto y borra el objeto. Idempotente si ya no tenía.
 * NO autoriza: quien llama lo hace (la acción propia con sesión de jugador; el
 * super-admin con su guard).
 */
export async function removePlayerPhoto(playerId: string): Promise<void> {
  let previousUrl: string | null = null
  await getWorkerDb().transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT avatar_url FROM players WHERE id = ${playerId} FOR UPDATE`,
    )
    previousUrl = (rows as unknown as Array<{ avatar_url: string | null }>)[0]?.avatar_url ?? null
    if (previousUrl) {
      await tx.execute(sql`UPDATE players SET avatar_url = NULL WHERE id = ${playerId}`)
    }
  })
  await deletePlayerPhotoObject(previousUrl)
}
