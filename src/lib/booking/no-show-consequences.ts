/**
 * Las consecuencias de marcar a alguien ausente, en un solo lugar.
 *
 * Aparece en las tres superficies desde las que se puede marcar (lista
 * desktop/mobile, detalle del turno, y desde Fase 3 el panel de la grilla). La
 * matriz deshacer-vs-confirmar (visión v2 §6.2) es UNA gramática, no una por
 * pantalla: si el texto difiere entre superficies, el staff aprende que la
 * confirmación no significa nada.
 *
 * Vivía duplicado literal en `QuickActions.tsx` y `BookingActions.tsx`, con un
 * comentario en cada copia pidiendo que se mantuvieran iguales.
 */
export const NO_SHOW_CONSEQUENCES = [
  'La seña pagada queda para el complejo.',
  'Si es su segunda ausencia en 90 días, queda bloqueado 14 días para reservar online.',
  'No se puede deshacer pasadas 24hs.',
]
