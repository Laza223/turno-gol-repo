// `SiteNav` fue reemplazado por `PortalHeader` (cabecera session-aware).
// Se conserva este re-export para no romper imports existentes — la landing
// sigue usando `<SiteNav variant="overlay" />` y el resto `variant="solid"`.
export { default } from './PortalHeader'
