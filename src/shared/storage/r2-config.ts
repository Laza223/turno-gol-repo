/**
 * Chequeo de configuración de R2 SIN tocar el SDK de AWS.
 *
 * `r2.ts` importa `@aws-sdk/client-s3` en el top level: preguntarle a ese módulo
 * "¿hay storage?" desde un Server Component mete el SDK entero en el grafo de la
 * ruta. Este archivo solo lee variables de entorno, así que el wizard puede
 * decidir si muestra el uploader sin arrastrar nada.
 */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_BASE_URL,
  )
}

/**
 * Inverso de `publicUrl`: extrae la key de una URL pública. `null` si la URL no
 * pertenece al host configurado (anti-IDOR: el caller valida además el prefijo
 * del tenant antes de borrar o de persistir).
 *
 * Vive acá y no en `r2.ts` por la misma razón que `isR2Configured`: es pura
 * sobre `process.env`, y así la puede usar la validación del wizard sin meter el
 * SDK de AWS en el grafo del módulo.
 */
export function keyFromPublicUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL
  if (!base) return null
  try {
    const target = new URL(url)
    if (target.host !== new URL(base).host) return null
    return target.pathname.replace(/^\/+/, '')
  } catch {
    return null
  }
}
