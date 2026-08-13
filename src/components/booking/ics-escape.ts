// Neutraliza texto tenant-controlado antes de embeberlo en una línea ICS
// (security scan F21): tenantName/courtName/address/city no tienen
// restricción de caracteres, así que un CR/LF crudo podría cerrar la línea
// actual e inyectar propiedades iCalendar adicionales. RFC 5545 §3.3.11:
// backslash, punto y coma y coma van escapados con `\`; CR/LF se eliminan
// (estos campos son de una sola línea, no soportan el continuation \n).
//
// En su propio módulo (no en BookingSuccessExtras.tsx) para que un archivo
// de componente client solo exporte el componente — react-doctor lo marca
// como `only-export-components` si una función utilitaria vive ahí, porque
// rompe la preservación de estado de Fast Refresh.
export function icsEscapeText(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}
