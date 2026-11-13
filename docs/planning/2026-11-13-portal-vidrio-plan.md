# Portal de vidrio: plan de implementación

**Fecha:** 2026-11-13. Lleva al código la decisión [`2026-11-13-portal-vidrio.md`](../decisions/2026-11-13-portal-vidrio.md).

Tres documentos, en este orden de autoridad:

1. **La decisión.** Qué se decidió y qué reemplaza.
2. **[La dirección](2026-11-13-portal-vidrio-direccion.md).** Cómo se ve y cómo se mueve. Manda en movimiento y en los detalles finos.
3. **[El mockup](mockups/2026-11-13-portal-vidrio/README.md).** Medidas, colores y composición de cada pantalla.

`DESIGN.md` describe todavía el look anterior en la parte del portal. Hasta la fase 9 no es la referencia para estas pantallas. Para el panel sigue mandando.

## Estado

Este cuadro es el registro del esfuerzo. Quien cierra una fase lo actualiza en el mismo PR.

| Fase | Qué | Estado | PR |
| --- | --- | --- | --- |
| F0 | Decisión, mockup, dirección, plan y punteros | Escrito el 2026-11-13, sin commitear | |
| F1 | Cimientos y cromo | Pendiente | |
| F2 | Home | Pendiente | |
| F3 | Buscador `/explorar` | Pendiente | |
| F4 | Ficha del complejo | Pendiente | |
| F5 | Confirmar el turno y vuelta de la reserva | Pendiente | |
| F6 | Mis reservas, Cuenta e Ingresar | Pendiente | |
| F7 | Rival | Pendiente | |
| F8 | Páginas para complejos, blog, legales y errores | Pendiente | |
| F9 | Movimiento entre pantallas, pulido, documentos y limpieza | Pendiente | |

**Gotchas encontrados** (se agregan acá a medida que aparecen):

- Ninguno todavía.

## Reglas de trabajo

- Una fase por sesión y un PR por fase, contra `main`. No se mergea sin el OK de Lazar: la ficha y la reserva las usan jugadores de complejos que ya están en producción.
- El portal queda mezclado mientras dura la migración: lo migrado en vidrio y el resto como está hoy. Es lo mismo que aceptó la decisión del 2026-11-08. Cada PR deja andando todo lo que no tocó.
- **Es un cambio de piel, no de lógica**, salvo en F4. Los servicios, las Server Actions, el estado en la URL, los guards y los textos se conservan. Si una pantalla necesita un dato que hoy no llega, se frena y se anota como pregunta.
- **Textos:** por defecto, el de producción. Cambian solo los que nombra la decisión. Todo texto nuevo o editado pasa por la skill `turnogol-copy`. Los datos del mockup (nombres, precios, partidos) son de ejemplo.
- **Código mínimo:** antes de crear un componente, buscar el que ya existe (`src/components/ui/`, `src/components/site/`, `src/components/world/`). `sheet`, `dialog`, `toast`, `skeleton` y `button` ya están: se extienden.
- **Sin dependencias nuevas.** `motion` ya está instalada.
- Los nombres de archivo de este plan salen de un relevamiento del 2026-11-13. Verificar que existan antes de tocarlos.
- Solo `pnpm`. Nada de `npm` ni `npx`.

## Mapa del mockup al código

| Pantalla | Mockup | Ruta | Archivos principales |
| --- | --- | --- | --- |
| Cromo | todas | layouts | `src/components/site/{SiteNav,SiteHeaderShell,PortalHeader,PortalShell,PortalFrame,PlayerBottomNav,SiteFooter}.tsx`, `src/app/(public)/layout.tsx`, `src/app/(player)/layout.tsx` |
| Tokens | `glass.css` | | `src/app/globals.css`, `src/components/world/portal-world.css`, `src/components/world/PortalAuthFrame.tsx` (constantes `PORTAL_*`) |
| Tema | botón de arriba | | `src/components/theme/{ThemeProvider,ThemeToggle}.tsx` |
| Home | `home.html` | `/` | `src/app/page.tsx`, `src/app/home/{Hero,HeroMobile,HeroDesktop}.tsx`, `src/components/site/HeroSearch.tsx` |
| Buscador | `buscador.html` | `/explorar` | `src/app/(public)/explorar/page.tsx` y `components/` (`SearchBand`, `SearchBar`, `ExplorarFilters`, `QuickFilters`, `TenantCard`, `ExplorarSplitView`, `ExplorarMap`, `EmptyResults`) |
| Ficha | `complejo.html` | `/[slug]` | `src/app/(public)/[slug]/(perfil)/page.tsx` y `components/` (`ComplexHero`, `ReserveSection`, `DayList`, `HourGrid`, `CourtRows`, `DayEmptyState`, `ProfileRest`, `ReviewsSection`, `TenantGallery`, `reserve-transition.ts`, `reserve-step.css`) |
| Confirmar | `reservar.html` | `/[slug]/reservar` | `reservar/page.tsx`, `CheckoutStates.tsx`, `components/{CheckoutFlow,LoginGate,BookingSummary,ConfirmBookingButton}.tsx` |
| Reserva | `reserva.html` | `/reserva/[bookingId]/{exito,pendiente,error}` | `BookingSuccessCard.tsx`, `BookingErrorCard.tsx`, `pendiente/page.tsx`, `src/components/booking/{ReservaDarkShell,BookingReceipt}.tsx` |
| Mis reservas | `mis-reservas.html` | `/mis-reservas` | `src/app/(player)/mis-reservas/{page,MisReservasView,CancelBookingButton,RefundContactPanel,LeaveReviewButton}.tsx`, `src/components/booking/CancelReasonPicker.tsx` |
| Cuenta | `cuenta.html` | `/configuracion`, `/perfil`, `/eliminar-cuenta` | `src/app/(player)/configuracion/*`, `src/app/(player)/eliminar-cuenta/*` |
| Ingresar | `ingresar.html` | `/ingresar`, `/verify`, `/aceptar-terminos` | `src/app/(auth)/ingresar/*`, `verify/VerifyView.tsx`, `aceptar-terminos/*`, `src/components/world/{PortalAuthFrame,PortalWorld,MagicLinkSent,PortalResult}.tsx` |
| Rival | `rival*.html` | `/rival/...` | `src/app/(player)/rival/` (`BoardView`, `MatchBits`, `RivalTabs`, `AlertOptIn`, `WelcomeCard`, `nuevo/`, `p/[code]/`, `partido/[id]/`, `mis-partidos/`) |
| Para complejos | `para-complejos.html`, `precios.html` | `/para-complejos`, `/precios` | `src/app/(business)/para-complejos/*`, `precios/*`, `src/components/site/{BusinessHeader,BusinessFooter}.tsx` |
| Notas y legales | `blog.html`, `articulo.html` | `/blog`, `/blog/[slug]`, `/vs/...`, `/alternativas-...`, `/terminos`, `/privacidad` | `src/components/site/{ArticleShell,Mdx}.tsx` |
| Errores | `estados.html` | | `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/(public)/[slug]/not-found.tsx`, `src/app/(public)/suspended/page.tsx` |

## Verificación de cada fase

Una fase está hecha cuando todo esto pasa y el resultado está pegado en el PR:

1. `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm knip`.
2. `pnpm test` y las stories tocadas, en claro y en oscuro (`test:storybook` y `test:storybook:dark`).
3. **La pantalla corriendo de verdad** (skill `verificacion-ux`), a 390 px y a 1440 px, en los dos temas, comparada con el mockup lado a lado. Con capturas.
4. Sin desborde horizontal, objetivos táctiles de 44 px y contraste AA medido sobre el fondo renderizado.
5. Con "reducir movimiento" prendido: todo se ve y se puede usar.
6. Los e2e que tocan la pantalla, corridos a mano. `e2e-tests` y `visual-regression` no corren en los PR: `pnpm test:e2e` sobre los specs de la fase y, cuando cambian las capturas de referencia, se regeneran y se dice en el PR.
7. Revisión del diff con contexto fresco (agente `sonnet-adversarial-reviewer`) antes de abrir el PR.

## F1. Cimientos y cromo

Lo que usan todas las demás fases. Sale junto con el cromo para que nada quede exportado sin uso.

1. **Leer** `glass.css`, la sección 3 y 4 de la dirección, `globals.css` y `portal-world.css`. Anotar qué clases de La Previa usa hoy el cromo.
2. **Tokens de vidrio.** Pasar los tokens de `glass.css` a `globals.css`, en claro y en oscuro, con el mecanismo de tema que ya existe (clase `.dark` de `next-themes`). Con alcance del portal: el panel no cambia ni un color.
3. **Utilidades:** vidrio real, vidrio pintado, luz de fondo, botón en píldora (principal, de vidrio y de riesgo), chip, enlace en píldora y etiqueta. Como clases o variantes de los componentes que ya existen (`button.tsx`), no como una biblioteca paralela.
4. **Tokens de movimiento** de la sección 4.3 de la dirección, en `globals.css`.
5. **Proveedor de `motion` del portal**, hermano de `src/app/onboarding/motion-provider.tsx`, montado solo en los layouts del portal.
6. **Piezas compartidas:** control segmentado con píldora que se desliza, hoja de abajo sobre `sheet.tsx` (con arrastre), esqueleto de vidrio sobre `skeleton.tsx`, aviso de vidrio sobre `toast.tsx`.
7. **Cromo:** cabecera (solo el logo en el celu, píldora de vidrio fija en la compu), barra de abajo en píldora con el ítem activo deslizándose y Rival detrás del flag, pie, y botón de tema con apertura en círculo.
8. **Medición del desenfoque.** Una página de prueba con la barra, una hoja y ocho tarjetas, con la CPU frenada 4 veces. Si el scroll baja de 50 cuadros por segundo, se confirma el vidrio pintado en las listas y se anota el resultado en "Gotchas".
9. **Stories** de cada pieza en los dos temas, con su chequeo de accesibilidad.

**Hecho cuando:** el cromo nuevo se ve en todas las pantallas del portal, el panel está igual que antes (comparar dos capturas del panel contra `main`) y la medición está escrita.

## F2. Home

1. Hero: foto de fondo con las cuatro capas, titular "Tu cancha, a un toque.", subtítulo, buscador de vidrio y ventana con complejos reales de la localidad. Si no hay complejos para mostrar, la ventana no aparece.
2. Fotos: las de TurnoGol que ya están en `public/`. Los reemplazos de Wikimedia no se copian.
3. Sección "Reservás en una pantalla", con la ficha nueva dibujada.
4. Sección de Rival, solo con el flag `rival`.
5. Videos de dueños: solo si hay videos reales. Si no hay, la sección no se muestra.
6. Cierre para complejos y pie.
7. Movimiento de la home (dirección, 4.5).
8. Resolver la localidad por IP sin sacar a la home de la ISR (`revalidate = 300`): en el middleware o en el cliente. Decirlo en el PR.

**Tests a revisar:** `tests/e2e/qa-happy-paths/publico/`, `tests/e2e/a11y/public.spec.ts`, `tests/e2e/portal-search.spec.ts`, `src/app/home/Hero.stories.tsx`.

**Hecho cuando:** la home coincide con `home.html` en los dos temas, el LCP no empeoró contra `main` y el titular viejo no aparece en ningún lado (buscar "Tu partido empieza").

## F3. Buscador `/explorar`

1. Barra de Localidad y Cancha en vidrio.
2. Hoja de cancha con Fútbol 4 a 11, de a varias, con cuántos complejos tiene cada tamaño y los que no tienen ninguno apagados. Hoja de localidad con buscador, "Usar mi ubicación exacta" y la lista.
3. Tarjeta de complejo en vidrio pintado: dos por fila en el celu, tres desde 768 px y cuatro desde 1200 px. Precio "desde" o "Precio en su página" según el complejo.
4. Mapa, estado sin resultados y esqueleto de carga.
5. La foto de cada tarjeta lleva su nombre de transición para que F9 la conecte con la portada de la ficha.
6. Movimiento del buscador (dirección, 4.5).

**Tests a revisar:** `tests/e2e/portal-search.spec.ts`, `tests/e2e/availability.spec.ts`, stories de `explorar/components/`.

**Hecho cuando:** coincide con `buscador.html` y sus dos hojas, y los filtros siguen viviendo en la URL como hoy.

## F4. Ficha del complejo

La única fase que cambia el recorrido. Pide más cuidado que las demás.

1. **Leer entero** `ReserveSection.tsx` y `tests/unit/reserve-section.test.tsx` antes de tocar nada. Todo lo que hoy maneja tiene que seguir andando: disponibilidad de la semana y del día, día cerrado, día lleno con salto al próximo con lugar, hora que se ocupa mientras se mira, complejo sin reserva online (WhatsApp o llamar), anticipación máxima y el evento `profile.viewed`.
2. Cabecera con la portada, el nombre, la dirección, el estado abierto o cerrado y las acciones.
3. **Reserva en una pantalla:** fila de días con su estado (hay lugar, lleno, cerrado), chips de tamaño, grilla de horas con cuántas canchas quedan y la barra de "Reservar" que sube con la cancha y el precio.
4. **El estado sigue en la URL** (`date`, `hora`, `formato`). Un link viejo que apunta a un paso abre la misma pantalla con ese día y esa hora elegidos. Atrás del navegador cierra la barra antes de salir de la ficha.
5. Con precios ocultos, la barra no muestra precio. Sin reserva online, el botón es "Consultar por WhatsApp" o "Llamar al complejo".
6. **Partidos abiertos**, con el flag `rival`: los partidos publicados en ese complejo. Si el servicio del tablón no filtra por complejo, se suma esa lectura al módulo de Rival, sin migración. Con cero partidos la sección no se muestra.
7. Canchas, fotos, reseñas y horarios en el lenguaje nuevo.
8. `reserve-transition.ts` y `reserve-step.css` salen si quedan sin uso.
9. Movimiento de la ficha (dirección, 4.5).
10. Reescribir `tests/unit/reserve-section.test.tsx` y `ReserveSection.stories.tsx` contra la pantalla nueva, con los mismos casos.

**Tests a revisar:** `tests/e2e/player-bookings.spec.ts`, `tests/e2e/availability.spec.ts`, `tests/e2e/qa-happy-paths/jugador/`, `tests/e2e/a11y/public.spec.ts`, `tests/e2e/mobile/field-font-size.spec.ts`.

**Hecho cuando:** se reserva de punta a punta en local con y sin seña, cada caso del test viejo tiene su equivalente y pasa, y Lazar dio el OK mirándolo en un celular.

## F5. Confirmar el turno y vuelta de la reserva

1. Confirmar: resumen del turno, ingreso dentro de la pantalla (Google o enlace por mail), "Pagar seña" o "Reservar" y los estados de `CheckoutStates.tsx`.
2. Reserva confirmada con el ticket, falta la seña con su cuenta regresiva, y pago rechazado.
3. La coreografía de la reserva confirmada (dirección, 4.5). Es el momento más cuidado de la app.
4. Nada de la lógica de pago cambia. No se toca `src/modules/payments/` ni los webhooks.

**Tests a revisar:** `tests/e2e/critical-flows/player-magic-link.spec.ts`, `tests/e2e/player-bookings.spec.ts`, stories de `ReservaDarkShell` y `BookingReceipt`. El título "¡Reserva confirmada!" lo buscan varios tests: no cambia.

**Hecho cuando:** los tres estados de la vuelta coinciden con `reserva.html` y el flujo con seña en modo de prueba de MercadoPago termina en la reserva confirmada.

## F6. Mis reservas, Cuenta e Ingresar

1. Mis reservas: control Próximos e Historial, tarjetas, aviso de seña pendiente, estado vacío y la hoja de cancelar con los motivos reales (`CancelReasonPicker`).
2. Cuenta: quién sos, actividad, tus datos, perfil en Rival, favoritos, tema, datos personales y baja. Eliminar la cuenta.
3. Ingresar, enlace enviado, enlace vencido y aceptar términos, con la foto del hero.
4. **El ingreso del complejo no se toca** (ver pregunta 1). Si comparte marco con el del jugador, se separa sin cambiarle el aspecto.
5. Movimiento de estas pantallas (dirección, 4.5).

**Tests a revisar:** `tests/integration/mis-reservas-*.test.ts`, `tests/e2e/critical-flows/player-magic-link.spec.ts`, `tests/e2e/a11y/player.spec.ts`, `tests/e2e/theme-toggle.spec.ts`.

## F7. Rival

1. Tablón con sus filtros, Mis partidos, el aviso por mail y el estado vacío.
2. Armar un partido.
3. El partido: visto desde el tablón, con pedido enviado, ya adentro y como quien organiza (pedidos, banco, avisar al grupo, cancelar).
4. Bienvenida a Rival y baja de avisos, con las mismas piezas.
5. Movimiento de Rival (dirección, 4.5).
6. Los vetos de Rival siguen: sin texto libre sobre personas, sin chat, WhatsApp solo después de aceptar.

## F8. Páginas para complejos, blog, legales y errores

1. Página para complejos y planes. El titular de planes es el de producción (ver pregunta 3). Los precios salen de `src/modules/billing/pricing.ts`, nunca escritos a mano.
2. Blog, nota, comparativas, términos y privacidad sobre `ArticleShell`.
3. Página no encontrada, complejo no encontrado, error y complejo suspendido.
4. Referidos (`/r/[code]`) y reactivar cuenta: mismo lenguaje con las piezas que ya existen, sin diseño nuevo.
5. Torneos no se toca: está detrás de un flag apagado.

## F9. Movimiento entre pantallas, pulido, documentos y limpieza

1. Navegación con fundido y dirección, y la foto de la tarjeta que se transforma en la portada de la ficha.
2. Los detalles de la sección 5 de la dirección que hayan quedado: grano, brillo que sigue al puntero y barra de abajo que se compacta.
3. Auditoría de rendimiento con los objetivos de la sección 4.7 y de accesibilidad con las tres preferencias del sistema (movimiento, transparencia y contraste).
4. Probar el respaldo sin `backdrop-filter`.
5. Reescribir la parte del portal de `DESIGN.md`, actualizar `PRODUCT.md` y los briefs del portal en `.impeccable/surfaces/`.
6. Borrar de `globals.css` y `portal-world.css` las clases de La Previa que quedaron sin uso. Revisar si Inter y Sora siguen haciendo falta.
7. Regenerar las capturas de referencia de `tests/e2e/visual/`.

## Qué no se toca

- El panel del complejo (`src/app/(admin)/`), el alta (`/onboarding`, `/register`) y el super admin.
- Migraciones, RLS, pagos, webhooks y jobs.
- Precios, seña por defecto y reglas de cancelación.
- Los vetos de producto de `CLAUDE.md`.

## Preguntas para Lazar

Ninguna frena el arranque. Cada una tiene un camino por defecto.

1. **El ingreso del complejo** (`/login`, olvidé mi clave, cambiar clave): ¿pasa a vidrio también? *Por defecto: queda como está.*
2. **Fotos del hero.** Hace falta una de noche y una de día o de atardecer, propias. *Por defecto: las de `public/` que ya usa la home.*
3. **Titular de planes.** El del mockup ("Un precio por cancha. Sin comisión.") es una propuesta. *Por defecto: el de producción.*
4. **Videos de dueños y tira de logos.** *Por defecto: no se muestran hasta tener material real.*

## Prompt de arranque

Una sesión por fase. Cambia solo el número.

```
Vas a implementar la fase F1 del portal de vidrio de TurnoGol.

Antes de tocar nada, leé en este orden:
1. docs/decisions/2026-11-13-portal-vidrio.md
2. docs/planning/2026-11-13-portal-vidrio-direccion.md
3. docs/planning/2026-11-13-portal-vidrio-plan.md (el cuadro de Estado, las Reglas de trabajo y la sección de tu fase)
4. El mockup de tu fase en docs/planning/mockups/2026-11-13-portal-vidrio/ (abrilo en el navegador y leé su fuente .src.html y los CSS)

Seguí el plan al pie de la letra. Es un cambio de piel: la lógica, los textos y el estado en la URL se conservan. Lo que se mueve y cómo está en la dirección: respetá sus piezas, sus tiempos y sus resortes, y cumplí "reducir movimiento".

Mientras trabajás, mirá la pantalla corriendo de verdad a 390 px y a 1440 px, en claro y en oscuro, y comparala con el mockup. No des nada por hecho sin haberlo visto.

Cuando la fase cumpla toda la sección "Verificación de cada fase" del plan, actualizá el cuadro de Estado, commiteá y abrí el PR contra main con la skill pr. No mergees. Si algo del plan choca con el código real, o necesitás un dato o un texto que no existe, frená y preguntame.
```
