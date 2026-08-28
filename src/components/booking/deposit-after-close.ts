/**
 * Nota que se le agrega al toast de "Reserva creada" cuando la seña se cobró
 * con la caja del día ya cerrada.
 *
 * La plata NO se pierde: entra como ajuste del mismo día operativo
 * (`allowClosedDay`, ver docs/decisions/2026-08-28-sena-cobrada-con-la-caja-cerrada.md).
 * Pero el encargado no tiene forma de saberlo mirando la grilla, y si va a
 * buscarla al resumen del día no la encuentra entre los ingresos — por eso se
 * lo decimos acá, en el momento del cobro (🔴 QA 2026-08-28 F-02).
 *
 * Vive suelto porque lo usan las DOS puertas de alta manual, el popover rápido
 * de la grilla y el modal completo.
 */
export function depositAfterCloseNote(base: string, depositAfterClose: boolean): string {
  if (!depositAfterClose) return base
  return `${base} · La caja de hoy ya estaba cerrada: la seña quedó cargada como ajuste.`
}
