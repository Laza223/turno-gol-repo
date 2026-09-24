import { redirect } from 'next/navigation'

/**
 * Compat: vender vive en Hoy (docs/decisions/2026-09-24-navegacion-panel.md).
 * Redirect para bookmarks/atajos del personal acostumbrado a esta URL.
 */
export default function CajaCantinaRedirectPage() {
  redirect('/dashboard')
}
