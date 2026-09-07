/**
 * Recorta los parámetros enlazados del mensaje de una consulta fallida.
 *
 * `DrizzleQueryError` arma su mensaje como
 * `` `Failed query: ${query}\nparams: ${params}` `` (verificado en la versión
 * instalada, 0.45.2), así que cualquier valor que viajaba en la consulta viaja
 * también en el texto de la excepción: correos, teléfonos y —el caso que
 * originó esto, H-7 de la auditoría de aislamiento del 2026-09-05— los dos
 * textos cifrados de las credenciales de MercadoPago, que el cron de renovación
 * pasa como parámetros de su modificación.
 *
 * Se conserva la consulta y se tira la lista de parámetros: la consulta está
 * parametrizada, así que no lleva datos, y es lo único de ese mensaje que sirve
 * para depurar.
 *
 * Pura y sin dependencias a propósito: la llama el logger, que entra al grafo
 * del edge middleware.
 */
const MARCA = '\nparams: '

export function redactQueryParams(text: string): string {
  const i = text.indexOf(MARCA)
  if (i === -1) return text
  return `${text.slice(0, i)}${MARCA}[REDACTED]`
}
