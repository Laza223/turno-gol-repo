/** Saca `param` de la URL sin navegar (idempotente). Solo en el navegador. */
export function dropUrlParam(param: string) {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(param)) return
  url.searchParams.delete(param)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}
