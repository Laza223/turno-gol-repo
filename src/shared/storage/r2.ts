import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { captureException } from '@/lib/sentry'

function getConfig() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  }
}

/** true si las 5 credenciales R2 están presentes en el entorno actual. */
export function isR2Configured(): boolean {
  const c = getConfig()
  return Boolean(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicBaseUrl)
}

let cachedClient: S3Client | null = null

function getClient(): S3Client {
  const c = getConfig()
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: c.accessKeyId!,
        secretAccessKey: c.secretAccessKey!,
      },
      // R2 es S3-compatible, pero no implementa todo el protocolo de checksums
      // que el SDK de AWS manda por default desde la v3.729 (acá corre
      // 3.1086): con 'WHEN_SUPPORTED', PutObject viaja con un CRC32 adicional
      // que los almacenamientos S3-compatible —R2, MinIO, Backblaze— suelen
      // rechazar con un 400. 'WHEN_REQUIRED' manda checksum solo cuando la
      // operación lo exige, que es la configuración recomendada para estos
      // destinos. No debilita nada: TLS sigue protegiendo la integridad.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }
  return cachedClient
}

/**
 * Sube bytes a R2 bajo `key`. Llamar solo tras `isR2Configured()`.
 *
 * Loguea y REPROPAGA: los tres call sites (canchas, perfil, onboarding) tenían
 * un `catch {}` vacío que devolvía "No se pudo subir la imagen" y perdía la
 * causa. Resultado real en producción: un complejo no podía subir la foto de su
 * cancha y en los logs no quedaba absolutamente nada — ni el bucket, ni el
 * código de error de R2. El mensaje amable para el usuario lo siguen dando
 * ellos; el diagnóstico vive acá, una sola vez.
 */
export async function putImage(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const c = getConfig()
  try {
    await getClient().send(
      new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: bytes, ContentType: contentType }),
    )
  } catch (err) {
    // Bucket y key sí: son nombres internos, no secretos, y sin ellos el error
    // de R2 no se puede ubicar. Las credenciales NUNCA se loguean.
    console.error('[storage] putImage falló', {
      bucket: c.bucket,
      key,
      contentType,
      bytes: bytes.byteLength,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    })
    captureException(err)
    throw err
  }
}

/** Borra el objeto en `key`. No falla si no existe (semántica S3 idempotente). */
export async function deleteImage(key: string): Promise<void> {
  const c = getConfig()
  await getClient().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }))
}

/** URL pública servida por el custom domain para una key dada. */
export function publicUrl(key: string): string {
  const c = getConfig()
  return `${c.publicBaseUrl}/${key}`
}

/**
 * Inverso de `publicUrl`: extrae la key de una URL pública. Devuelve `null` si
 * la URL no pertenece al host configurado (anti-IDOR: el caller debe validar
 * la key resultante contra el prefijo del tenant antes de borrar).
 */
export function keyFromPublicUrl(url: string): string | null {
  const c = getConfig()
  if (!c.publicBaseUrl) return null
  try {
    const base = new URL(c.publicBaseUrl)
    const target = new URL(url)
    if (target.host !== base.host) return null
    return target.pathname.replace(/^\/+/, '')
  } catch {
    return null
  }
}
