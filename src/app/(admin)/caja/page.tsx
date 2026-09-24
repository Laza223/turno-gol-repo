import { redirect } from 'next/navigation'

/**
 * Caja son dos destinos: Cuentas y Productos. Vender se fue de acá: vive en Hoy
 * (columna desde 1280 px, botón "Vender" debajo), que es de donde el mostrador
 * vende desde el 2026-09-19 (docs/decisions/2026-09-24-navegacion-panel.md).
 * El riel ya apunta a /caja/cuentas; esto queda para links y favoritos viejos.
 */
export default async function CajaPage(props: {
  searchParams: Promise<{ configureCanteen?: string }>
}) {
  const searchParams = await props.searchParams
  // Compat con deep links viejos: la configuración de productos vive en su propia tab.
  if (searchParams.configureCanteen === 'true') {
    redirect('/caja/productos?configureCanteen=true')
  }
  redirect('/caja/cuentas')
}
