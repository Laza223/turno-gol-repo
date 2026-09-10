import { redirect } from 'next/navigation'

/**
 * H161: "Avisos" era su propia pestaña con una sola preferencia (resumen
 * diario) y la pantalla vacía alrededor — se plegó como una sección más de
 * `/settings/perfil` (ver perfil/page.tsx y perfil/AvisosForm.tsx).
 *
 * Esta ruta queda como redirect de compat: un link guardado a
 * `/settings/avisos` sigue funcionando. El guard de acceso lo sigue dando
 * `settings/layout.tsx` (`requireAdminStaff`) por encima de esta página.
 */
export default function AvisosPage() {
  redirect('/settings/perfil')
}
