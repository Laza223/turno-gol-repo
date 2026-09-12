import { redirect } from 'next/navigation'

/**
 * Compat: Deudas dejó de ser una pantalla propia y vive dentro de
 * /caja/cuentas, al lado de Devolvés — son las dos direcciones de la misma
 * pregunta. Redirect por los bookmarks del staff y por los links viejos.
 *
 * Los componentes y la Server Action de esta carpeta siguen acá y los consume
 * /caja/cuentas: lo que cambió es dónde se muestran, no qué hacen. Mismo
 * patrón que `caja/cantina/`.
 */
export default function CajaDeudasRedirectPage() {
  redirect('/caja/cuentas')
}
