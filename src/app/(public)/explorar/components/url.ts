/**
 * Helper para construir URLs de /explorar preservando el resto de los filtros.
 * Todo el estado de búsqueda vive en la query string (URL-based: shareable + SEO).
 * Pasar `''` o `undefined` en un valor lo elimina del query.
 */
export function buildExplorarUrl(
  current: URLSearchParams | ReadonlyURLSearchParams,
  updates: Record<string, string | undefined>,
  opts: { resetOffset?: boolean } = {},
): string {
  const params = new URLSearchParams(current.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  // Al cambiar cualquier filtro, la paginación vuelve al inicio (salvo que se pida lo contrario).
  if (opts.resetOffset !== false) params.delete('offset')
  const qs = params.toString()
  return qs ? `/explorar?${qs}` : '/explorar'
}

// next/navigation expone ReadonlyURLSearchParams; lo declaramos liviano para no importar el tipo.
type ReadonlyURLSearchParams = { toString(): string }
