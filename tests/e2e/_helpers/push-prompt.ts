/**
 * El modal propio del permiso de push (decisión 2026-11-16) se abre solo la primera vez que un
 * dispositivo llega al panel o a las pantallas del jugador. Cada contexto de test es un dispositivo
 * nuevo, así que sin esto se abre en todos: tapa los clicks y deja lo de atrás fuera del árbol de
 * accesibilidad (`getByRole` no lo encuentra). Se pasa a `addInitScript` antes del primer goto y
 * marca todas las situaciones como vistas (staff y jugador).
 *
 * Corre en la página (init script): no puede usar nada de este módulo.
 */
export function markPushPromptSeen(): void {
  try {
    for (const audience of ['', ':player'])
      for (const status of ['unsupported', 'install_required', 'denied', 'unsubscribed'])
        localStorage.setItem(`turnogol:notif-modal-seen${audience}:${status}`, String(Date.now()))
  } catch {
    /* about:blank y storage bloqueado: no hay nada que marcar */
  }
}
