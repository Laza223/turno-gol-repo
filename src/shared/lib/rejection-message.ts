/**
 * El motivo real del rechazo, cuando el servidor se molestó en darlo.
 *
 * Los Route Handlers responden 4xx/5xx con el envelope estándar de error
 * (`{ error: { code, message } }`, `@/shared/api-error`), pero un componente
 * cliente que solo hace `if (!res.ok) throw new Error('...')` lo descarta y
 * siempre muestra un mensaje genérico — incluso cuando el server ya mandó
 * algo mejor (p. ej. un corte de ciclo de vida del tenant). `fallback` cubre
 * los casos sin cuerpo legible: corte de red, HTML de un proxy, JSON roto.
 */
export async function rejectionMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? fallback
  } catch {
    return fallback
  }
}
