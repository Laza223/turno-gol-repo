import { redirect } from 'next/navigation'

/**
 * Compat: Cantina pasó a vivir en la raíz de /caja (eliminación de "Caja del
 * día"). Redirect permanente para bookmarks/atajos del personal acostumbrado
 * a esta URL.
 */
export default function CajaCantinaRedirectPage() {
  redirect('/caja')
}
