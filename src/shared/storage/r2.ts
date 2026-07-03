import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

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
    })
  }
  return cachedClient
}

/** Sube bytes a R2 bajo `key`. Llamar solo tras `isR2Configured()`. */
export async function putImage(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const c = getConfig()
  await getClient().send(
    new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: bytes, ContentType: contentType }),
  )
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
