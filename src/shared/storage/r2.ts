import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { captureException } from '@/lib/sentry'

// Re-export: la definición vive en `r2-config.ts` (sin el SDK de AWS) para que
// un Server Component pueda preguntar "¿hay storage?" sin bundlear el cliente
// S3. Los call sites de siempre no cambian.
export { isR2Configured, keyFromPublicUrl } from './r2-config'

function getConfig() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  }
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
export async function putImage(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  // Default: el `immutable` de un año de canchas/logos. Una foto de persona (RIVAL)
  // pide un TTL corto: si se borra por ARCO, el borde no la sirve más de 1 h.
  opts?: { cacheControl?: string },
): Promise<void> {
  const c = getConfig()
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // Seguro porque las keys son inmutables por construcción: cada subida
        // genera una key nueva con `crypto.randomUUID()` y la anterior se borra
        // (`settings/perfil/actions.ts:65`, `settings/canchas/actions.ts:261`).
        // Nunca se sobreescribe una key existente, así que el objeto que hay en
        // una URL no cambia jamás. Sin esta cabecera, el TTL en el borde lo
        // decidía Cloudflare por default en vez del código.
        CacheControl: opts?.cacheControl ?? 'public, max-age=31536000, immutable',
      }),
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

/** Lista los objetos bajo `prefix` (pagina hasta agotar). Solo la usa el barrido de huérfanos. */
export async function listImages(prefix: string): Promise<{ key: string; lastModified: Date }[]> {
  const c = getConfig()
  const out: { key: string; lastModified: Date }[] = []
  let token: string | undefined
  do {
    const res = await getClient().send(
      new ListObjectsV2Command({ Bucket: c.bucket, Prefix: prefix, ContinuationToken: token }),
    )
    for (const o of res.Contents ?? []) {
      if (o.Key && o.LastModified) out.push({ key: o.Key, lastModified: o.LastModified })
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

/** URL pública servida por el custom domain para una key dada. */
export function publicUrl(key: string): string {
  const c = getConfig()
  return `${c.publicBaseUrl}/${key}`
}
