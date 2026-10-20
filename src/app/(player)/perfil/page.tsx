import { redirect } from 'next/navigation'

/** Adónde llevaba cada pestaña de /perfil dentro de la Cuenta. Sin pestaña o con "notificaciones" (ya no existe): arriba de todo. */
const TAB_TARGET = new Map([
  ['datos', '/configuracion#tus-datos'],
  ['favoritos', '/configuracion#favoritos'],
  ['actividad', '/configuracion#actividad'],
])

/**
 * /perfil se mudó a /configuracion: la Cuenta es una sola página. La URL vieja sigue viva por los
 * links guardados y los mails; el redirect lo hace el servidor (sin parpadeo) y no pide sesión:
 * sin sesión, el guard de /configuracion manda a /ingresar?next=/configuracion (el ancla no sobrevive).
 */
export default async function PerfilPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await props.searchParams
  redirect((tab && TAB_TARGET.get(tab)) || '/configuracion')
}
