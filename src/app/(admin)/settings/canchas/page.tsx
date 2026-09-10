import { redirect } from 'next/navigation'

/**
 * Canchas dejó de vivir dentro de Configuración el 2026-09-10: pasó a ser un
 * espacio propio del menú (`/canchas`), a pedido del dueño. Este stub queda para
 * los links viejos y los favoritos — la pantalla real está en `/canchas`.
 */
export default function SettingsCanchasRedirect() {
  redirect('/canchas')
}
