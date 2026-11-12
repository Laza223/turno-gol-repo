/**
 * Barra de acciones de cada pantalla del wizard. En el celular queda fija abajo
 * (el pulgar no busca el botón); desde `md` fluye debajo del contenido. Vive en un
 * archivo sin `'use client'` para que la use también el resumen, que es server.
 */
export const ACTION_BAR_CLASS =
  'fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:mt-8 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none'
