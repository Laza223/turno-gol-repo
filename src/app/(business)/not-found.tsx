import { NotFoundView } from '@/components/world/NotFoundView'

/**
 * El 404 de un `notFound()` lanzado dentro de este grupo (un layout o una página que no tiene
 * `not-found.tsx` propio). Next lo dibuja dentro del layout del grupo, que ya trae cabecera y pie:
 * si cayera en el `not-found.tsx` raíz, que pone su propio `PortalShell`, el cromo salía dos veces.
 */
export default function NotFound() {
  return <NotFoundView />
}
