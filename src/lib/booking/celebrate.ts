/**
 * Marca de "esta reserva ya festejó" (dirección §4.8: las entradas no se repiten al volver a una
 * pantalla ya vista). Es una cookie de sesión con el id de la ÚLTIMA reserva festejada: el cliente
 * la escribe la primera vez y el servidor la lee al recargar para pintar `data-seen` desde el
 * HTML, sin que el festejo arranque y se corte al hidratar. Vive fuera de `CelebrateOnce` porque
 * un valor exportado de un módulo `'use client'` llega al servidor como referencia, no como texto.
 */
export const CELEBRATED_COOKIE = 'tg_celebrated'
