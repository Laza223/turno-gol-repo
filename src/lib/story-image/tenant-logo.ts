import { keyFromPublicUrl } from '@/shared/storage/r2-config'
import { toPng } from '@/shared/images/compress-image'

/** Lado, en píxeles, del logo del complejo en la placa (se dibuja a la mitad para que quede nítido). */
const TENANT_LOGO_PX = 320

const FETCH_TIMEOUT_MS = 3000
const MAX_LOGO_BYTES = 2 * 1024 * 1024
const CACHE_LIMIT = 100

// La URL del logo lleva un UUID y cambia con cada subida: el contenido de una URL
// nunca cambia, así que se puede guardar sin vencimiento.
const cache = new Map<string, Promise<string | null>>()

async function fetchAsPngUri(url: string): Promise<string | null> {
  try {
    // Sin seguir redirects: el chequeo de host vale solo para la URL pedida.
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    })
    if (!res.ok) return null
    if (Number(res.headers.get('content-length') ?? 0) > MAX_LOGO_BYTES) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) return null
    const png = await toPng(bytes, TENANT_LOGO_PX)
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Logo del complejo listo para la placa, como data URI PNG. `null` si no se
 * puede: la placa sale igual, con el logo de TurnoGol solo. Nunca lanza.
 *
 * Solo baja URLs de nuestro bucket de R2: `logo_url` lo escribe la subida del
 * panel, pero la ruta es pública y no sale a pedir cualquier host.
 */
export function loadTenantLogo(url: string): Promise<string | null> {
  if (!keyFromPublicUrl(url)) return Promise.resolve(null)
  const hit = cache.get(url)
  if (hit) return hit
  const pending = fetchAsPngUri(url)
  // Un fallo no se guarda: la próxima placa vuelve a probar.
  void pending.then((uri) => {
    if (uri === null && cache.get(url) === pending) cache.delete(url)
  })
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(url, pending)
  return pending
}
