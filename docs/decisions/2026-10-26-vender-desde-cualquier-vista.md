# Vender desde cualquier vista del panel, y elegir los horarios de la placa

**Fecha**: 2026-10-26 · **Estado**: implementada, pendiente de OK del dueño para prod · **Decide**: el dueño
(qué) + esta sesión (cómo) · **Supera**: el punto 5 de [`2026-09-24-navegacion-panel.md`](2026-09-24-navegacion-panel.md)
("Vender vive solo en Hoy") y la línea "riel y barra del celu: mismos ítems".

## Origen

Pedido de El Vagón (vía el dueño, 2026-10-26):

1. Están en la Grilla agendando a mano, o en Canchas, y para vender algo de la cantina tienen que
   volver a Hoy. Piden un botón "Vender" en el riel.
2. La placa para historias solo vive en la Grilla y siempre muestra las **primeras 4 horas libres**
   del día. Para mañana eso son las 9, 10, 11 y 12 de la mañana: no sirve. Quieren compartir las
   de la noche (20, 21, 22).

## Qué se decide

1. **Vender es una acción del panel, no una pantalla.** El modal (`VenderProvider` + `VenderDialog`)
   se monta en `(admin)/layout.tsx`, en las dos ramas (normal e impersonación). Lo abre el botón
   "Vender" del riel (desde `lg`), el de la barra superior de Hoy o la tecla **V**, que pasa a ser
   global del panel (sigue sin disparar escribiendo, con modificadores o con otro diálogo abierto).
   El riel lo dibuja solo si hay proveedor (`useOptionalVender`), así que stories y tests sin
   proveedor no cambian.
2. **El catálogo se pide al abrir, no con el layout.** `loadVenderCatalogAction` (catálogo +
   más vendidos de 30 días, la cuenta salió de `dashboard/page.tsx` a `getTopSellerIds`). Los
   botones lo anticipan al apuntarlos o tocarlos (`prefetch`), se reusa 60 s y una venta lo
   descarta. A cambio Hoy deja de pagar esas dos queries en cada refresco (60 s). Si en el mostrador
   se notara la demora, la alternativa es cargarlo en el layout (instantáneo, pero suma las dos
   queries a todas las pantallas).
3. **El mobile no cambia**: ni cajón "Más" ni barra inferior tienen el botón (el pedido fue la barra
   lateral de escritorio). En el teléfono sigue el botón de Hoy y, ahora, la V si hay teclado.
4. **La placa deja elegir hasta 4 horarios.** `GET /api/public/story?...&hours=20:00,21:00` (HH:MM,
   1 a 4, sin repetir). Sin `hours` es idéntico a antes (primeras 4). Con `hours` se muestran
   solo esas, en orden operativo (respeta `closes_next_day`), sin el "y N más"; si ninguna sigue
   libre responde 409 `STORY_TAKEN`. El diálogo ofrece las horas libres del día en chips y pide la
   imagen con un debounce de 400 ms (la política `publicStory` es de 20 renders por minuto por IP).
5. **Acceso a la placa desde Hoy**: botón flotante "Compartir horarios" con una X. Cerrarlo lo
   oculta hasta el día operativo siguiente (localStorage); la Grilla conserva el suyo. Solo
   aparece si hay al menos una cancha online.

## Qué NO cambia

Cantidad máxima de filas de la placa (4: la tipografía no se achica), el diseño de la imagen,
`sellTicket`, plata, schema (cero migraciones), la barra inferior y el cajón mobile.

## Pendiente conocido (fuera de alcance)

La Grilla pasa `booking_advance_days` crudo al diálogo, pero la ruta valida contra
`publicBookingAdvanceDays` (recortado en bajas voluntarias): los chips de días lejanos pueden dar
400. El botón flotante copia la misma expresión; se arregla aparte en los dos lugares.

Código: `src/app/(admin)/dashboard/_components/{VenderProvider,ShareScheduleFab}.tsx`,
`src/components/layout/{vender-context,admin-sidebar}.tsx`, `src/app/(admin)/caja/cantina/actions.ts`,
`src/modules/tenants/story-summary.ts`, `src/app/api/public/story/route.ts`.
