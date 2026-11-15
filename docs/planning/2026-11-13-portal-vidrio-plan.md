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
| F0 | Decisión, mockup, dirección, plan y punteros | Hecho | #590 |
| F1 | Cimientos y cromo | Hecho el 2026-11-14 | #592 |
| F2 | Home | Hecho el 2026-11-14 | #593, #594, #595, #596 |
| F3 | Buscador `/explorar` | Hecho el 2026-11-14 | #597 |
| F4 | Ficha del complejo | Hecho el 2026-11-15 | #598 |
| F5 | Confirmar el turno y vuelta de la reserva | En revisión desde el 2026-11-15 | #599 |
| F6 | Mis reservas, Cuenta e Ingresar | Pendiente | |
| F7 | Rival | Pendiente | |
| F8 | Páginas para complejos, blog, legales y errores | Pendiente | |
| F9 | Movimiento entre pantallas, pulido, documentos y limpieza | Pendiente | |

**Gotchas encontrados** (se agregan acá a medida que aparecen):

- **Medición del desenfoque (F1, paso 8).** Banco `Player/Banco de vidrio` (`PortalGlassBudget.stories.tsx`): cabecera, barra, ocho tarjetas con fotos detrás y, en otra variante, una hoja abierta. A 393 × 851 con DPR 3 y la CPU frenada 4×, el scroll dio 60 cuadros por segundo (rAF) y 0 cuadros descartados por el compositor (`PipelineReporter` en el trace), con vidrio real y con vidrio pintado, con la GPU de la máquina y con GPU por software (SwiftShader). No baja de 50: no se fuerza el vidrio pintado en las listas y sigue valiendo el presupuesto de la dirección (§4.7). Límites: el freno de CPU no frena la GPU y no se midió en un Android de gama baja real.
- **Vidrio real sobre una foto clara.** En el banco, una cancha iluminada detrás de la tarjeta lleva la etiqueta verde de "Libre" casi al color del fondo. Donde una tarjeta tenga foto detrás (F2 a F4), oscurecer la foto o usar vidrio pintado, y medir el contraste sobre el fondo pintado, no sobre el token.
- **Los tokens del portal solo existen con el marcador.** Van en `html:has([data-portal-glass])` y `html.dark:has([data-portal-glass])` (como el mundo de La Previa), no en `:root`: el panel no los ve. Una pantalla o pieza del portal sin `PortalFrame` ni la home alrededor necesita el marcador. `@theme` suma los colores `portal-*` y por eso cambió el hash de `tests/unit/portal-world-tokens.test.ts`.
- **El panel también usa `ThemeToggle variant="portal"`** (cajón del celu en `admin-sidebar.tsx`). Por eso `portal` quedó como en main y el control de vidrio es `variant="glass"`. `/configuracion` pasa a `glass` en F6.
- **`backdrop-filter` crea un bloque contenedor.** Un `position: fixed` dentro de un `.glass` se ubica contra el vidrio y no contra la ventana. Por eso el menú de la cuenta, la hoja y los avisos van en portal de Radix, fuera del vidrio.
- **Tokens con prefijo.** `--muted` ya existe en shadcn y `--ease-out` es un token de Tailwind. Los del portal van como `--portal-*` y `--glass-*`, y en Tailwind como `portal-*` (`text-portal-ink`, `bg-portal-inner`).
- **Respaldos de accesibilidad sin capa.** Los bloques de "reducir transparencia", "más contraste" y sin `backdrop-filter` van fuera de `@layer` para ganarle a las utilidades. Un vidrio armado con utilidades necesita una clase en esas listas (`.glass-pop`, el menú de la cuenta). Lo mismo los avisos de `[data-toast]`.
- **La transición de vista de la raíz está apagada en el portal** (`animation: none`) hasta F9. El tema anima su círculo con un `clip-path` desde el botón y la píldora de la barra viaja con su propio `view-transition-name`.
- **Archivo con el eje de ancho.** `layout.tsx` carga `axes: ['wdth']`. El cromo (cabecera, barra, pie, hoja, avisos y menú de la cuenta) va en Archivo; cada pantalla pasa a Archivo en su fase.
- **Cabecera entre 768 y 1023 px.** Con sesión, Rival y un nombre largo, los links pisaban el chip de la cuenta. En ese rango el chip muestra solo el avatar.
- **La hoja sobrevive al cierre.** `GlassSheetContent` no se desmonta al cerrar (solo lo de adentro del portal): el desplazamiento del arrastre se vuelve a cero en cada apertura. El runner de stories corre con "reducir movimiento", que apaga el arrastre: esto se prueba a mano.
- **Medir tiempos.** El navegador de Playwright MCP, con la ventana en segundo plano en Windows, corre rAF a 1 cuadro por segundo: cualquier tiempo medido ahí es falso. Medir con un Chromium headless propio.
- **Stories.** El runner arranca a 414 px de ancho: una story de compu necesita `globals: { viewport: { value: 'desktop' } }`. El preview fija el tema también en un `div` contenedor, así que un `dark:` dentro de una story sigue a ese `div` y no a `html`.
- **Scroll de la home (F2).** Hero con foto, buscador y ventana en vidrio real, `animation-timeline` en la foto y el velo: a 393 × 851, DPR 3 y CPU 4× dio 54 cuadros por segundo en tres corridas (rAF, Chromium headless, `next dev`). No baja de 50: el desenfoque de la foto queda como `backdrop-filter`.
- **Texto sobre la foto (F2).** Debajo de la ventana, la línea "¿Tenés un complejo?" cae sobre el pasto iluminado: 1,2:1 sin fondo y casi igual con `.glass`, porque el `saturate(180%)` aviva el verde. Va en una píldora del color del velo al 92 %. El contraste se mide con todo el texto transparente y el píxel más desfavorable de la caja de cada texto (no con el token).
- **`ch` de Archivo (F2).** Con `next/font`, el `ch` de Archivo mide un 6 % más que en el mockup y los renglones cortaban distinto. Los anchos de línea de la home van en `em`.
- **`buttonVariants` sin `cn` (F2).** Las variantes `pill` heredan `rounded-lg` y `text-sm` de la base y, sin `twMerge`, les ganan: un `Link` con `buttonVariants({ variant: 'pill' })` va siempre envuelto en `cn(...)`.
- **Campo con dos renglones (F2).** Un botón con `aria-label` y dos `span` pegados ("Localidad" / "Luján") da `label-content-name-mismatch` en axe: lee "LocalidadLuján". Un `{' '}` entre los dos lo arregla y en la grilla no ocupa lugar.
- **`useIpZona` guarda la respuesta en el módulo (F2).** En un archivo de stories, todas las stories tienen que mockear `/api/public/zona` igual; los tests unitarios mockean el hook. En e2e, los checkbox de las hojas son `sr-only`: se toca la etiqueta (`getByRole('dialog').getByText('Fútbol 5', { exact: true })`).
- **Fotos importadas desde `src/` (F2).** Un `import` desde `public/` funciona en Next, pero sirve la foto dos veces y Vite (Storybook) lo marca. Las del hero viven en `src/app/home/fotos/`.
- **La ventana de la home gasta del balde de la ficha (F2).** Todo `/api/public/*` comparte la política `publicAvailability`: 30 pedidos por minuto por IP, contados antes del CDN. La ventana pide la búsqueda y los horarios solo de las tarjetas que entran a ese ancho: 3 pedidos en el celu y 5 en la compu, más `/api/public/zona` si no hay zona guardada. Antes la home no pedía nada. Una pantalla de F3 o F4 que sume pedidos desde el cliente tiene que contar contra ese mismo balde.
- **Un radio marcado no dispara `change` (F2).** En la hoja de localidad, tocar la opción que ya viene marcada (la de la conexión) no hacía nada: ni guardaba la zona ni cerraba la hoja. Las opciones llevan también un `onClick` que confirma cuando ya están marcadas. Lo mismo vale para cualquier hoja de elección única de F3 a F7.
- **`localStorage` entre archivos de test (F2).** Los archivos de Vitest comparten worker y `localStorage` no se limpia entre archivos: una zona guardada por un test hace que otro archivo arranque con zona y no busque la ubicación. El síntoma parece un timeout (falla a veces, según el orden). Cada archivo que guarde la zona la limpia en `afterEach`, y cada uno que necesite arrancar sin zona la limpia en `beforeEach`.
- **Campos cerrados del buscador (F2).** En el celu, el valor de cada campo tiene unos 80 px: "Todas las ciudades" y "Cualquier tamaño" se cortaban. El campo dice "Todas" y las hojas conservan el nombre largo.
- **e2e locales de F2.** `qa-happy-paths/publico/` 007, 008 y 009 fallan también en main: esperan textos viejos de privacidad y términos, con fecha del 25 de mayo, y otro mail de soporte. No son de esta fase. Para correr e2e en un worktree sin `.env.local` hay que pasar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` de `supabase status -o env`, y `E2E_BASE_URL` si el dev no está en `:3000`.
- **Filtros de /explorar (F3, decisión de Lazar del 2026-11-14).** Quedan Localidad, Cancha (de a varias) y Mapa, como en el mockup, más la búsqueda por nombre (`q`) adentro de la hoja de Localidad. Salen superficie, techado, solo online, precio, servicios, orden, fecha y hora. Un link viejo con esos parámetros abre igual y la página los ignora (`KNOWN_PARAMS` en `explorar/page.tsx`). Buscar por nombre suelta la localidad (un complejo de otra ciudad daba 0) y elegir una localidad suelta el nombre.
- **Datos nuevos de F3, leídos en el servidor.** `listPublicFormatSets` (los tamaños de cada complejo de la localidad, cacheado solo para localidades que existen: una ciudad inventada en la URL no crea una entrada de caché) y `findTodayFreeSlotsByTenant` (hasta 3 horarios libres de hoy y el "+N", que cuenta solo horarios con cancha libre). No suman pedidos al balde de `/api/public/*`. Los conteos por tamaño no se suman: un complejo con Fútbol 5 y 7 cuenta una vez en "Ver N complejos" (`matchingCount`).
- **"Hoy" es el día calendario ART (F3).** Como la ventana de la home. Entre la medianoche y el cierre, un complejo que cierra pasada la medianoche no ofrece en la tarjeta el turno que le queda del día operativo anterior.
- **Horarios que fallan no son "sin horarios" (F3).** Si `findTodayFreeSlotsByTenant` falla, la tarjeta no dice nada de hoy (se avisa a Sentry). Decir "Hoy no le quedan horarios" sería mentir.
- **Sin coordenadas en la URL (F3).** La zona guardada lleva coordenadas de ~1 km, pero /explorar escribe en la URL solo `city` y `province`: la URL se comparte. Ordenar por cercanía queda para un link que ya traiga `lat` y `lng`.
- **Las hojas de la home y de /explorar son las mismas (F3).** Viven en `src/components/site/SearchSheets.tsx`. La de Cancha muestra cuántos complejos tiene cada tamaño solo si recibe `formatSets` (/explorar); en la home queda como en F2.
- **Grilla de 4 desde 1200 px (F3).** `min-[1200px]:grid-cols-4` de Tailwind no ganaba contra `md:grid-cols-3`: la grilla de tarjetas vive en `explorar.css` (`.ex-grid`).
- **Stretched link y horarios (F3).** La lista de horarios va arriba del link de la tarjeta con `pointer-events-none` y cada píldora con `pointer-events-auto`: el hueco al lado de las píldoras sigue abriendo la ficha.
- **e2e locales de F3.** Sin `.env.local`, `next dev` no arranca (`validateServerEnv`) y `/api/status` da 503 sin `SENTRY_DSN`: hay que pasar además `DATABASE_URL` y `WORKER_DATABASE_URL` locales y placeholders de `IMPERSONATION_COOKIE_SECRET`, `ENCRYPTION_KEY` (64 hex), `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `RESEND_API_KEY` y `SENTRY_DSN`, como el `webServer` de `playwright.config.ts`. Firefox y WebKit no están instalados en la máquina: `cross-browser/` no corre local.
- **Medir contraste en píldoras (F3).** Con el píxel más desfavorable de toda la caja, el borde verde de la píldora y las esquinas fuera del radio daban falsos 3,5:1. Se mide adentro del radio (6 px arriba y abajo, medio alto a los costados).
- **La reserva de la ficha es una pantalla (F4).** Elegir hora empuja una entrada con la marca `tgReserve` (el Atrás cierra la barra); día y tamaño reemplazan. Lo que se toca con la barra empujada y la cierra (otro día, un tamaño sin lugar a esa hora) se guarda en `pending` y se aplica en el `popstate`; un tamaño elegido con la barra abierta se conserva al cerrarla, porque la entrada a la que se vuelve tiene el de antes.
- **La barra va en portal a `<body>` (F4).** Dentro de `.reserve.glass` el `fixed` quedaba contra el vidrio. Los tokens siguen porque viven en `html:has([data-portal-glass])`. En stories se busca en `canvasElement.ownerDocument.body` y su visibilidad con `waitFor` (entra con fundido).
- **`sr-only` que estira la página (F4).** El nombre largo de cada día es un `sr-only` (absoluto): sin `position: relative` en `.dayp` se ubicaba contra un ancestro de afuera de la fila deslizable y la página medía 111 px de más a 390.
- **Nombre accesible de los días (F4).** Un `aria-label` largo ("Domingo 15. Hay lugar") sobre el texto visible "Dom 15" da `label-content-name-mismatch` en axe: lo visible va `aria-hidden` y el nombre en un `sr-only`. Los tests miran `textContent`.
- **`react-hooks/refs` (F4).** El compilador marca leer `ref.current` en funciones que se usan durante el render: `pendingBack` y `pending` son estado, no refs.
- **Fila de días en la compu (F4).** `booking_advance_days` llega a 60: desde 1024 px se ven 7 días (`calc((100% - 6 * 8px) / 7)`) y el resto se desliza, en vez de 7 columnas `1fr` que se aplastaban.
- **Pedidos de la ficha (F4).** Al entrar se piden la semana y el día (2 contra el balde de `publicAvailability`); antes, 1 hasta elegir un día. Cada día nuevo suma 1.
- **e2e locales de F4.** `supabase status -o env` devuelve CRLF en Git Bash (`tr -d ''`). Para reusar un dev en otro puerto, Playwright necesita una config sin `webServer` (si no, intenta levantar `pnpm dev` en :3000 y choca). TG-HP-101, 104, 106, 108 y el modal de la grilla de `field-font-size` fallan en el dev local del worktree; F4 no toca esas pantallas (104 espera el monto 1 del mock de MP).
- **Ingreso dentro de la pantalla (F5).** En `/[slug]/reservar`, sin sesión, el ingreso es `LoginPanel`: una región con su h2 "Entrá para reservar", no un modal. El modal `LoginGate` sigue para Rival, y los dos comparten `GateBody` con una piel por `look` (`SKIN`). Los e2e y tests buscan `region`, no `dialog`. El monto de la seña sin sesión queda solo en el resumen: el botón "Pagar seña · $X" aparece con sesión.
- **`DialogHeading` y el `id` (F5).** Si se le pasa `id={undefined}` a `DialogTitle` de Radix, pisa el id que genera y el diálogo queda sin nombre accesible. Hay que sacar `id` de las props, no mandarlo vacío.
- **`PortalResult` es compartido (F5).** También lo usan Rival, `/explorar`, Mis reservas y los `error.tsx` del jugador. La columna pasó de 560 a 480 px y la piel a vidrio en todas esas pantallas. Sus botones van con `variant="pill" size="pill"`. `RESULT_GO` en el `className` de un `Button` NO alcanza: el variant `default` deja `md:h-10` y su sombra debajo.
- **El ticket se imprime con `transform` (F5).** Sale de una ranura (`.rv-slot`, `overflow: hidden`) con `translateY`, sin `clip-path` (§4.7). La ranura se ensancha 16 px por lado y 48 abajo, con márgenes negativos, para no cortar la sombra. A 390 px no desborda.
- **Festejo una vez (F5).** `CelebrateOnce` guarda la última reserva festejada en la cookie `tg_celebrated` (`path=/reserva`), no en `sessionStorage`. Así el servidor pinta `data-seen` al recargar y el festejo no arranca y se corta al hidratar. Un `ref` evita que el doble montaje de StrictMode lo apague en dev.
- **Utilidades contra clases de componente (F5).** Las utilidades de `Input` le ganan a una clase de `@layer components` como `.rv-input`, así que la piel del campo va en utilidades, `md:` incluido. El borde del email en vidrio es `border-portal-soft/70`: medido sobre el píxel da 3,39:1 en claro y 5,47:1 en oscuro. `portal-inner-line` daba 1,2:1.
- **Dev del worktree con `preview_start` (F5).** En `launch.json`, `bash` es el de WSL: hay que usar `C:/Program Files/Git/bin/bash.exe` con un script que respete `PORT`.
- **e2e locales de F5.** Fallan también en main (comparado contra un worktree de `origin/main` en :3107): `player-intent-confirm` (4 de 5) y TG-HP-101, por timeout al volver del magic link en el dev local. `booking-flow` S3 y TG-HP-106 esperan "Confirmando tu pago…", pero desde #575 la pantalla dice "Esperando tu pago…" cuando ofrece pagar. Como los e2e no corren en PRs, nadie lo vio.

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
2. Fotos: las de TurnoGol que ya están en `public/`. Los reemplazos de Wikimedia no se copian. *Cambió el 2026-11-14:* Lazar aprobó las dos fotos CC0 del mockup para el hero hasta tener fotos propias (ver la decisión); las miniaturas del dibujo siguen siendo de TurnoGol.
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
