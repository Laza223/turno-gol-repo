import { redirect } from 'next/navigation'

/**
 * H161: "Avisos" era su propia pestaña con una sola preferencia (resumen
 * diario) y la pantalla vacía alrededor — se plegó dentro de Perfil y, desde
 * 2026-09-25, vive en "Vos y tu equipo" (`/settings/equipo`), con el email
 * para entrar: lo que es de tu usuario y no ve el jugador.
 *
 * Esta ruta queda como redirect de compat: un link guardado a
 * `/settings/avisos` sigue funcionando. El guard de acceso lo sigue dando
 * `settings/layout.tsx` (`requireAdminStaff`) por encima de esta página.
 */
export default function AvisosPage() {
  redirect('/settings/equipo')
}
