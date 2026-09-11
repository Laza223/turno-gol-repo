// Fase 4 UX: validación pura del form de RegisterMovementModal, para derivar
// si el botón "Guardar" debe habilitarse SIN esperar a un submit. Mismas
// reglas que el `setError` de handleSubmit — duplicadas a propósito. Con el
// botón deshabilitado ese `setError` es hoy inalcanzable desde la UI (Enter
// tampoco dispara el submit implícito si el único submit está disabled);
// queda solo como red si esta función diverge del submit en el futuro.
export function isValidMovement(amountCents: number | null, description: string): boolean {
  if (amountCents == null || amountCents <= 0) return false
  return description.trim().length >= 1
}
