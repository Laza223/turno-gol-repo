# Auditoría UX/UI de la plataforma completa — 2026-08-01

**Tipo:** auditoría de experiencia (UX, UI, IA, a11y, copy, estados, responsive, velocidad percibida, mantenibilidad UI). **Sin cambios de código** — este documento es el único entregable.

**Cobertura real (no declarativa):**

- **Recorrido en vivo** con la app corriendo (`turnogol-mock`, seed E2E): flujo completo de reserva como jugador (portal → form → magic link vía Inbucket → método de pago → confirmación → mis-reservas → modal de cancelación), flujo de seña hasta el resumen de montos, login staff, grilla con la reserva creada.
- **96 + 58 screenshots** de las 71 páginas en 2 viewports (375px y 1366px), anónimo + logueado como admin + fresh-admin (onboarding), guardados en el scratchpad de la sesión (`shots/`), con log por página de URL final, h1, `html lang` y errores de consola.
- **6 auditorías estáticas paralelas** (una por superficie: admin-operación, admin-gestión, player/auth/conversión, público/business/super-admin, design system, transversal) con lectura completa de páginas y componentes, contrastadas contra `docs/spec/design-system/MASTER.md` v2.1. Este documento las consolida y deduplica; toda afirmación tiene archivo:línea.
- **Verificación cruzada**: cuando dos auditorías se contradijeron (ej. zoom de iOS), se verificó contra el código y ganó la evidencia — ver §6.3.

**Conteo consolidado (deduplicado): ~140 hallazgos — 20 🔴 · 48 🟡 · ~70 🟢.** Los 🔴 están todos en §4; los 🟡/🟢 se agrupan por tema en §5–§12.

---

## 1. TL;DR

La plataforma está **mucho mejor construida que el promedio** de un SaaS a esta edad: el flujo de conversión del jugador es corto y pulido, la grilla implementa su spec casi al 100%, los estados vacíos y de error existentes son de primera, el voseo es impecable (cero tuteo real en ~55 candidatos revisados), no hay una sola tabla sin protección responsive, y hay evidencia de rondas previas de caza de bugs en los comentarios del propio código.

Los problemas graves se concentran en **cuatro ejes**, y tres de ellos son baratos de arreglar porque son *la misma causa raíz repetida*:

1. **Un solo anti-patrón de contraste (CTA `bg-emerald-600` + texto blanco) está en el botón primario de casi todos los flujos de plata** — crear reserva, completar y cobrar, registrar movimiento de caja, cobrar cantina, guardar producto, registrar pago de deuda — ~15 sitios que fallan WCAG AA en uno o ambos temas, cuando el primitive `Button` ya lo resuelve bien. Es la corrección de mayor apalancamiento de todo el informe.
2. **`/caja` perdió sus KPIs**: mientras el día está abierto no hay ningún número de Ingresos/Egresos/Saldo — la pregunta #1 de la vista según su propia spec. Hay evidencia de que es una regresión (el skeleton todavía dibuja 3 KPIs que ya no existen; `buildDelta` quedó huérfano).
3. **La superficie de marketing/SEO de fondo de embudo está rota**: blog y las 2 páginas comparativas ("vs ATC", "alternativas") renderizan texto `gray-900` sobre fondo `#020617` — casi invisibles — y terminan en un CTA de WhatsApp placeholder (`5491100000000`). Son exactamente las páginas donde cae el Marcelo con mayor intención de compra.
4. **Fricciones de plata puntuales pero serias**: el precio de un abonado se puede crear en $25 en vez de $25.000 por el separador de miles; "marcar ausente" (captura seña + softban) se ejecuta sin confirmación desde el menú mobile; "Liberar de hoy en adelante" suelta todas las horas de un torneo con un click.

A eso se suman **4 decisiones que requieren input del dueño** (§13): la discrepancia legal 90 vs 7 días de retención, el default "deuda incobrable + permanente" del ban manual, el costo de conversión del magic link en el checkout, y la identidad visual partida light/dark.

---

## 2. Personas simuladas y su realidad en la plataforma

### Marcelo (~50, dueño, rol `admin`, poco tech-savvy, celular + PC vieja de mostrador)

- **Objetivos:** que el complejo se llene solo, mirar la caja a la noche, configurar una vez y olvidarse, saber si le conviene seguir pagando.
- **Lo que la plataforma le da bien:** onboarding con copy anti-ansiedad ("Menos de 5 minutos. Todo se puede cambiar después"), paso de MercadoPago sin jerga OAuth, dashboard con checklist de activación y KPIs del día, configuración de precios con plantillas ("un precio / semana-finde / día-noche") que evita la matriz completa en el 95% de los casos, `/analiticas` con estado vacío espectral ejemplar.
- **Frustraciones que este informe documenta:** mira la caja de noche desde el celular y no hay saldo del día (🔴 §4.2); puede crear un abonado a $25 sin ninguna advertencia (🔴 §4.4); si googlea "alternativas a Alquila Tu Cancha" para justificar su decisión, encuentra una página ilegible con un WhatsApp muerto (🔴 §4.3); en Settings, 4 de 6 pestañas se titulan igual ("Configuración") y no sabe dónde está parado (§7); dos números de "Ingresos" distintos en la misma pantalla de analíticas sin aclarar el rango de fechas de cada uno (§7).

### Rodrigo (~25, encargado, rol `manager`, opera grilla y caja bajo presión)

- **Objetivos:** anotar la reserva telefónica en segundos, cobrar sin equivocarse de método, cargar los resultados del torneo el domingo a la noche, no romper nada.
- **Lo que la plataforma le da bien:** grilla con colapso de horas muertas, línea de "ahora", Realtime, densidad persistida, roving tabindex; venta de cantina por ticket; empty states que le explican qué se registra solo y qué se carga a mano.
- **Frustraciones documentadas:** "Marcar ausente" desde el menú mobile ejecuta sin confirmación una acción que captura la seña y puede disparar un softban de 14 días (🔴 §4.5); los radios de "¿Cómo se cobró la seña?" tienen un target táctil de ~20px y un mistap registra el método equivocado que después no cuadra en el arqueo (🔴 §4.5); en el modal de reserva telefónica el campo Nombre no recibe foco automático (§8); cargar 8 actas de partido no muestra ni un toast de confirmación por acta (§8); en el strip semanal de la grilla mobile, el día activo queda scrolleado fuera de vista (§8); el ítem "Configuración" desaparece del sidebar en vez de mostrarse bloqueado con candado como manda el design system (§7).

### Tomás (~28, jugador, 100% mobile, cero paciencia)

- **Objetivos:** cancha para hoy a la noche, en el menor número de taps, sin crear cuentas.
- **Lo que la plataforma le da bien:** slot → form de 3 campos → confirmación; pantalla de éxito con QR, comprobante, calendario y compartir por WhatsApp; cancelación con modal claro que dice qué pasa con la seña; empty states del portal correctos.
- **Frustraciones documentadas:** el magic link lo saca de la app en el momento más caliente — y en el flujo CON seña, el email interviene *antes* de pagar (§13.3); la pantalla "Revisá tu email" no ofrece reenviar, no menciona spam, no dice si el turno queda guardado ni cuánto tiempo tiene (§8); el email que recibe dice "Hacé click para entrar y ver tus reservas" cuando está *confirmando una reserva* (§10); si el link venció o su antivirus lo consumió, la pantalla le dice "probá de nuevo" — consejo que garantiza un segundo fracaso idéntico (🔴 §4.6); una reserva "Pago pendiente" en `/mis-reservas` no tiene ninguna acción (§8); en el portal del complejo, lo que vino a buscar (la disponibilidad) está tres pantallas abajo, después de los horarios de apertura (§7).

### Lazar (super-admin, operador del SaaS)

- **Lo que la plataforma le da bien:** panel con triple guard, KPIs vía `StatCard`, confirmación por nombre tipeado en las acciones destructivas de suscripción.
- **Frustraciones documentadas:** la acción MÁS sensible del panel (impersonar un tenant) usa la confirmación más débil (`window.confirm()` nativo) mientras acciones menores exigen tipear el nombre (§4.7 🟡→ver §5); el mismo tenant puede verse con dos semánticas de color distintas según la pantalla, porque `TenantStatusBadge` existe dos veces y ya divergieron (`past_due` ámbar vs naranja, `churned` neutro vs rojo) (🔴 §4.8); las tablas separan filas con `divide-slate-100` sin par dark — casi invisibles en el tema oscuro que él usa (§6).

---

## 3. Diagnóstico estructural

1. **El sistema de diseño existe, es bueno, y el problema es la adopción parcial, no el sistema.** `Button`, `Input`, `badge`, `status-visual.tsx`, `chipClass`, `EmptyState`, `ConfirmDialog`, `SubmitButton`, `parsePesosToCents`, `todayART()` — para casi cada bug encontrado, **el fix ya existe en el repo** y hay archivos hermanos que lo usan bien. La deuda es de barrido, no de diseño. Esto aparece tan seguido que es la tesis del informe: §4.1 (el primitive Button vs 15 botones a mano), §4.4 (`parsePesosToCents` vs `type=number`), §6.3 (el primitive Input vs inputs crudos), §8 (SubmitButton vs `<button>` de "Reintentar pago"), §9 (Zod con mensajes es-AR en register vs defaults en inglés en onboarding).
2. **La calidad es despareja por módulo, con un gradiente temporal claro.** Abonados/Staff/Canchas (pasaron por el rediseño v2) son la vara alta: confirmaciones fuertes, toasts, tokens, `status-visual`. Deudas es el punto más bajo (Title Case sistemático, "(Guest)" en inglés, colores crudos, y el default de ban que contradice una política revertida). Torneos tiene el mejor backend de errores del repo (~35 mensajes de dominio accionables) y la capa cliente menos defendida (acciones destructivas sin confirmar, cero toasts). Super-admin quedó fuera de la migración de badges/tokens.
3. **La identidad visual está partida en dos productos.** Admin y portal público del complejo: light con acentos emerald. Player post-login (`/mis-reservas`, `/perfil`), auth de jugador, checkout, `(business)` completo: dark-premium (#020617). Home: light. `/precios`: dark. Un Tomás que entra por el portal light y termina en el checkout dark cruza dos mundos visuales en el mismo funnel; un Marcelo que compra en dark opera en light. Puede ser una decisión (marketing dark / herramienta light) — pero hoy no está documentada como tal en MASTER (que solo ratifica siempre-dark para `para-complejos`), y hay pantallas que la implementan mal (§4.3, §6). REQUIERE INPUT §13.4.
4. **Los flujos de plata tienen los mejores cimientos y los peores remates.** Server-side: idempotencia, revalidación de estado, guards de dominio — sólido. La última milla de UI es donde aparecen los 🔴: contraste del botón que cobra, targets táctiles de los radios de método, confirmaciones ausentes, el input de precio que acepta "25.000" como 25.

---

## 4. Hallazgos críticos (🔴) — los 20, consolidados

### 4.1 Contraste WCAG AA roto en el botón primario de casi todos los flujos de plata — patrón de ~15 sitios

El primitive `Button` ([button.tsx:11](src/components/ui/button.tsx:11)) resuelve el par correcto vía `bg-primary` (light `emerald-700`+blanco = 5,5:1 ✅; dark `emerald-500`+`slate-950` = 7,9:1 ✅). Cada botón escrito a mano con `bg-emerald-600 … text-white` (3,8:1) o `dark:bg-emerald-600` reproduce el anti-patrón que `MASTER.md §2.4/§11` prohíbe textualmente. Instancias confirmadas con archivo:línea:

| Sitio | Contexto | Falla light | Falla dark |
|---|---|---|---|
| [BookingFormModal.tsx:818](src/components/booking/BookingFormModal.tsx:818) | **"Confirmar" de crear reserva — la acción más repetida del producto** | Sí | Sí |
| [CompleteBookingDialog.tsx:392](src/app/(admin)/reservas/CompleteBookingDialog.tsx:392) | "Completar y cobrar" (además `h-10` <44px) | Sí | Sí |
| [RegisterMovementModal.tsx:229](src/app/(admin)/caja/components/RegisterMovementModal.tsx:229) | "Registrar" movimiento de caja | Sí | Sí |
| [ProductFormDialog.tsx:327](src/app/(admin)/caja/productos/ProductFormDialog.tsx:327) | "Guardar" producto | Sí | Sí |
| [StockEntryDialog.tsx:305](src/app/(admin)/caja/productos/StockEntryDialog.tsx:305) | "Registrar" reposición | Sí | Sí |
| [ChargeDebtDialog.tsx:298](src/app/(admin)/deudas/ChargeDebtDialog.tsx:298) | "Registrar pago de deuda" | Sí | Sí |
| [DebtListClient.tsx:185](src/app/(admin)/deudas/DebtListClient.tsx:185) | Botón WhatsApp de cobro de deuda | Sí | Sí |
| [QuickBookingButton.tsx:57](src/components/booking/QuickBookingButton.tsx:57) | "Reserva rápida" (dashboard) | No (700) | Sí (600/hover 500 = 2,5:1) |
| [DashboardCanteenButton.tsx:32](src/components/dashboard/DashboardCanteenButton.tsx:32) | "Venta rápida" (dashboard) | No | Sí |
| [TicketPanel.tsx:383](src/app/(admin)/caja/cantina/TicketPanel.tsx:383) | "Cobrar $X" cantina | No | Sí |
| [TicketPanel.tsx:217,262](src/app/(admin)/caja/cantina/TicketPanel.tsx:217) | Badges "×N" | No | Sí |
| [WeeklyAvailabilityModal.tsx:185](src/app/(public)/[slug]/components/WeeklyAvailabilityModal.tsx:185) | Día activo del selector de fecha público (12px) | Sí | Sí |
| [AvailabilityGrid.tsx:135,149](src/app/(public)/[slug]/components/AvailabilityGrid.tsx:135) | Slots del portal público | Sí | Sí |
| [ActivatePlanSection.tsx:264](src/app/(admin)/settings/facturacion/ActivatePlanSection.tsx:264) | Activar plan (facturación) | Sí | Sí |

Ironías que agravan: el componente hermano [WeeklyAvailability.tsx:38](src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx:38) resuelve la MISMA UI con `bg-primary` correcto; y [ExplorarMap.tsx:19](src/app/(public)/explorar/components/ExplorarMap.tsx:19) trae un comentario con la tabla de contraste medida eligiendo bien los hex — el equipo sabe hacerlo, es una regresión de barrido.

**Dirección:** una sola pasada `bg-emerald-[67]00.*text-white` → `<Button>`/`bg-primary`, más una regla de lint que prohíba `bg-emerald-600` fuera de `globals.css`.

### 4.2 `/caja` no muestra Ingresos / Egresos / Saldo mientras el día está abierto — regresión con evidencia

- [caja/page.tsx](src/app/(admin)/caja/page.tssx) no importa `StatCard`/`MetricCard` en ninguna parte (grep 0 usos en `caja/`). La spec de la vista (`docs/spec/design-system/pages/caja.md §0`) define como pregunta #1 "¿Cuánto quedó? — el número protagonista".
- Hoy esos números solo existen **dentro del diálogo de "Cerrar caja"** ([CloseDayButton.tsx:102-136](src/app/(admin)/caja/CloseDayButton.tsx:102)) — hay que abrir el flujo de una acción irreversible para espiar el saldo — o **después de cerrar** ([CierreCard.tsx:45-69](src/app/(admin)/caja/CierreCard.tsx:45)).
- Evidencia de regresión: [caja/loading.tsx:8-12](src/app/(admin)/caja/loading.tsx:8) todavía dibuja el skeleton de 3 KPIs que la página real ya no tiene (promesa incumplida del skeleton + layout shift), y [caja-lib.ts:184-201](src/app/(admin)/caja/caja-lib.ts:184) conserva `buildDelta` ("Delta para StatCard…") con **0 imports** en todo `src/`.
- Escenario: Marcelo, de noche, celular: header, tabs, fondo inicial y lista de movimientos — ningún "hoy quedaron $X".

### 4.3 Blog y comparativas: texto casi invisible + CTA muerto, en las 4 páginas SEO de fondo de embudo

- [(business)/layout.tsx:13](src/app/(business)/layout.tsx:13) fuerza dark (`#020617`) para todo el grupo. Pero [blog/page.tsx:14-27](src/app/(business)/blog/page.tsx:14) (`<h1 className="…text-gray-900">Blog</h1>` fuera de las cards blancas) y [ArticleShell.tsx:33-55](src/components/site/ArticleShell.tsx:33) (h1/descripción `text-gray-900/500`, cuerpo `.prose` sin `dark:prose-invert`) quedaron del rediseño anterior: **texto gris-oscuro sobre negro, contraste < 1,5:1**, en `/blog/[slug]`, `/vs/alquila-tu-cancha` y `/alternativas-alquila-tu-cancha` — con contenido real publicado (`content/blog/…2026.mdx`, `content/pages/*.mdx`).
- El CTA final de cada artículo apunta a WhatsApp placeholder `https://wa.me/5491100000000` ([ArticleShell.tsx:49](src/components/site/ArticleShell.tsx:49) y embebido en [vs-alquila-tu-cancha.mdx:40](content/pages/vs-alquila-tu-cancha.mdx)). Además `blue-600`/`prose-blue` fuera de marca.
- [ArticleShell.stories.tsx:5-11](src/components/site/ArticleShell.stories.tsx) documenta una versión VIEJA y más chica del bug (fecha 2,42:1 sobre fondo claro que ya no existe) — el comentario quedó desactualizado y la realidad es peor.

### 4.4 El precio del abonado se puede crear en $25 en vez de $25.000

- [AbonadoForm.tsx:532-542](src/app/(admin)/abonados/nuevo/AbonadoForm.tsx:532): `type="number" step="0.01"`. El input nativo usa `.` como decimal (spec, independiente del locale) — si Marcelo tipea `25.000` (hábito argentino), `Number("25.000")` = **25**. El resumen lateral mostraría "$ 25", pero en mobile queda al final del scroll y el schema server solo exige `.positive()` — $25 pasa.
- El repo ya tiene el fix: [pricing-grid.ts:168-172](src/modules/courts/pricing-grid.ts:168) `parsePesosToCents` descarta todo separador (usado en Canchas). Reusarlo, o advertir montos absurdos.

### 4.5 Cobro y sanción con fricción incorrecta en el mostrador (Rodrigo, mobile)

- **"Marcar ausente" tiene 3 niveles de fricción según dónde se dispare, y el más liviano está en mobile**: desktop lista = 2 taps armados ([QuickActions.tsx:170-180](src/app/(admin)/reservas/QuickActions.tsx:170)); detalle = `ConfirmDialog` completo ([BookingActions.tsx:307-316](src/app/(admin)/reservas/[id]/BookingActions.tsx:307)); **menú contextual mobile = 1 tap sin confirmación** ([QuickActions.tsx:365-369](src/app/(admin)/reservas/QuickActions.tsx:365)). Marcar ausente captura la seña y a la 2ª vez en 90 días softbanea 14 días — un mistap en el dropdown del celular ejecuta eso sin paso atrás.
- **Radios nativos de ~20px en los diálogos de cobro**: "¿Cómo se cobró la seña?" ([QuickActions.tsx:390-400](src/app/(admin)/reservas/QuickActions.tsx:390)) y "¿Quién cancela?" ([QuickActions.tsx:417-442](src/app/(admin)/reservas/QuickActions.tsx:417) + gemelo [BookingActions.tsx:263-287](src/app/(admin)/reservas/[id]/BookingActions.tsx:263)). Un mistap Efectivo/Transferencia con fila de gente registra el método equivocado → arqueo de caja que no cuadra. El patrón correcto (chips `h-11`) ya existe en `caja-lib.ts`.
- **"Liberar de hoy en adelante"** ([SlotsPanel.tsx:281-291](src/app/(admin)/torneos/[id]/SlotsPanel.tsx:281)) libera TODAS las horas futuras del torneo al primer click, sin `ConfirmDialog` — las canchas quedan disponibles para que cualquier reserva online las tome. Abonados exige tipear "CANCELAR" para la acción equivalente.

### 4.6 `/verify` tiene copy muerto: el fallo más común del magic link muestra el mensaje equivocado

- [verify/page.tsx:8-14](src/app/(auth)/verify/page.tsx:8) define mensajes para `expired` y `used`, pero el único emisor ([api/auth/callback/route.ts](src/app/api/auth/callback/route.ts)) nunca los produce — solo `invalid`/`exchange_failed`/`orphaned_session` (grep completo). Un link vencido o pre-consumido por el escáner del email (riesgo que el propio código documenta en las líneas 47-49) cae en "No pudimos completar el inicio de sesión. **Probá de nuevo**" — reintentar el mismo link garantiza el mismo fracaso; el usuario nunca se entera de que necesita un link *nuevo*.
- GoTrue expone `otp_expired` como código real — inspeccionarlo antes de colapsar todo a `exchange_failed` recupera el copy ya escrito.

### 4.7 Countdown del pago dentro de `aria-live="polite"` — bloqueo funcional para lectores de pantalla

- [PaymentStatusWatcher.tsx:200](src/components/booking/PaymentStatusWatcher.tsx:200) envuelve el bloque `pending_payment` completo (incluido [ExpiryCountdown.tsx:13-17](src/components/booking/ExpiryCountdown.tsx:13), tick de 1s) en una región viva. Un usuario de VoiceOver/NVDA esperando confirmar una SEÑA recibe una locución nueva por segundo durante hasta 6 minutos. Anti-patrón explícito de ARIA Authoring Practices (nunca un timer dentro de una live region). Variante menor de 5s en [SuccessRedirect.tsx:32](src/app/(auth)/verify/SuccessRedirect.tsx:32).

### 4.8 `TenantStatusBadge` duplicado en super-admin, ya divergido semánticamente

- [\_components/tenant-status-badge.tsx](src/app/(super-admin)/super-admin/_components/tenant-status-badge.tsx) vs [tenants/\_components/status-badge.tsx](src/app/(super-admin)/super-admin/tenants/_components/status-badge.tsx): mismo nombre exportado, mismo enum de 8 estados, dos semánticas — `past_due` ámbar vs **naranja** (familia no declarada en MASTER), `churned` neutro vs **rojo destructivo**, `deleted` muted vs foreground. Ninguno usa tokens ni el patrón `status-visual.tsx` canónico del admin. El mismo tenant cambia de color de estado según la pantalla.

### 4.9 Skip-link roto en la landing

- [layout.tsx:72-77](src/app/layout.tsx:72) renderiza `<a href="#main-content">Saltar al contenido</a>`, pero [page.tsx](src/app/page.tsx) (home) no tiene ningún `<main id="main-content">` (grep sobre los 6 componentes de `src/app/home/`). El primer Tab del sitio, en la página de mayor tráfico, no lleva a ningún lado. Invisible en CI: `skip-link.spec.ts` solo prueba `/login` y solo asserta el hash; la regla de axe que lo detectaría (`landmark-one-main`) es "best-practice", fuera de las tags WCAG que corre `_helpers.ts`.

### 4.10 Términos y Privacidad prometen 90 días de retención post-baja; el código da 7

- [terminos/page.tsx:135-138](src/app/(public)/terminos/page.tsx:135) y [privacidad/page.tsx:160-163](src/app/(public)/privacidad/page.tsx:160): "los datos se conservan **90 días** tras la baja (churned)". [lifecycle.service.ts:21-25](src/modules/billing/lifecycle.service.ts:21): `CHURNED_DELETION_DAYS = 7`. El "90" real es `BLOCKED_TO_CHURNED_DAYS` — la etapa *anterior*. Un dueño que espere al día 30 para reactivar puede encontrar el borrado ya agendado. Documento legal que invoca Ley 24.240 prometiendo un plazo 13× el real. (El claim vecino de `/precios` — 60 días post-trial — SÍ coincide con el código.) **REQUIERE INPUT — §13.1.**

### 4.11 `ManualBanDialog` precarga el modelo "no-show = deuda" que el producto revirtió

- [ManualBanDialog.tsx:38](src/app/(admin)/deudas/ManualBanDialog.tsx:38) precarga el motivo "Deuda incobrable de reserva" y [:20-24](src/app/(admin)/deudas/ManualBanDialog.tsx:20) ofrece "Permanente (Indefinido)". La política vigente (CLAUDE.md, decisión 2026-07-11) descartó exactamente eso por desproporcionado (softban 14 días a la 2ª ausencia). El default empuja con un click hacia el caso revertido: bloqueo indefinido por plata, sin ventana ni tope. El ban manual en sí es legítimo (violencia, abuso); el problema es el default. **REQUIERE INPUT — §13.2.**

### 4.12 Torneos recién habilitado: "Próximamente" y "Creá el primero" en la misma pantalla

- [torneos/page.tsx:61-83](src/app/(admin)/torneos/page.tsx:61): el banner "Próximamente — Muy pronto vas a poder crear torneos…" se muestra cuando `total === 0`, es decir a TODO complejo con el flag recién prendido — conviviendo con el botón "+ Nuevo torneo" del header y el empty state "Todavía no hay torneos → Crear el primero". Verificado en vivo con el flag activado: las tres piezas aparecen juntas. El comentario del código delata la intención ("solo tiene sentido si todavía no hay torneos, si no se autocontradice") — la condición correcta era *flag apagado* (teaser), no *cero torneos*. Primera impresión del módulo nuevo = mensaje contradictorio.

### 4.13 Lista de jugadores cortada en 200 sin aviso

- [jugadores/queries.ts:48](src/app/(admin)/jugadores/queries.ts:48): `LIMIT 200` sin paginación ni contador; [JugadoresView.tsx](src/app/(admin)/jugadores/JugadoresView.tsx) no indica "mostrando 200 de N". Con 300 jugadores, el #201 (ordenado por `last_booking_at DESC NULLS LAST`) **no existe** para Rodrigo salvo que adivine el nombre en el buscador — puede jurar que el jugador no está y crearlo duplicado. Contraste: los paneles de torneos truncan con "y N más" explícito.

### 4.14 Badge de ausencias ilegible en dark mode

- [JugadoresView.tsx:77-81,111-114](src/app/(admin)/jugadores/JugadoresView.tsx:77): `bg-amber-100 … text-amber-700 dark:text-amber-400` **sin `dark:bg-`** — en dark queda ámbar-400 sobre ámbar-100 (<2:1) flotando como píldora light sobre fondo oscuro. El token `--warning` con receta dual existe (§6.5 de MASTER).

### 4.15 Zod default en inglés en el paso 1 del onboarding (instancia confirmada de una clase sin red)

- [tenant.schema.ts:6](src/modules/tenants/tenant.schema.ts:6): `city: z.string().min(2).max(100)` sin mensaje (los otros 4 campos del mismo objeto SÍ lo tienen); [onboarding/actions.ts:67-70](src/app/onboarding/actions.ts:67) devuelve `issues[0]?.message` crudo; [StepIdentity.tsx:109-115](src/app/onboarding/components/StepIdentity.tsx:109) no valida client-side. Ciudad de 1 carácter → mensaje default de Zod 4 **en inglés**, en el primer paso del wizard del Aha Moment. Clase sistémica: ~50 usos del idiom `issues[0]?.message ?? 'Datos inválidos'` y **cero** `z.config()`/error-map global (grep 0). El patrón correcto ya existe en [register/actions.ts:17-68](src/app/(auth)/register/actions.ts:17) (mensajes es-AR + `fieldErrors` por campo).

---

## 5. Plata y conversión (🟡 relevantes)

- **"Reintentar pago" sin estado pending** — [BookingErrorCard.tsx:50-55](src/app/reserva/[bookingId]/error/BookingErrorCard.tsx:50): único botón de plata del repo sin `useTransition`/`disabled` (verificado contra AbonadoForm, InscripcionesPanel, RegisterMovementModal, StepPayments — todos correctos). No hay doble cobro (el server relee `status !== 'pending_payment'` y cobra MP), pero cero feedback en la pantalla donde Tomás ya está desconfiado; el doble click puede generar una preferencia MP huérfana. `SubmitButton` existe para esto.
- **"Pago pendiente" sin salida en `/mis-reservas`** — [MisReservasView.tsx:263](src/app/(player)/mis-reservas/MisReservasView.tsx:263): solo `confirmed` tiene acciones. Una reserva `pending_payment` no ofrece "Continuar pago" (ni link a `/pendiente`), no es clickeable: Tomás solo puede esperar a que el hold expire.
- **"Reserva rápida" precarga cancha y hora arbitrarias** — [QuickBookingButton.tsx:36-46](src/components/booking/QuickBookingButton.tsx:36): `courts[0]` + `20:00` fijos, sin marca de "valor de ejemplo" — en un flujo pensado para velocidad es fácil confirmar la cancha/hora equivocada.
- **Dos números de "Ingresos" con ventanas distintas en `/analiticas`** — [analiticas/page.tsx:103-137](src/app/(admin)/analiticas/page.tsx:103): arriba ventana rolante con polling 60s, abajo mes calendario navegable; misma métrica, dos alcances, sin rango de fechas explícito en ninguna. Es el tipo de discrepancia que un dueño lee como "bug en la plata". Además: KPIs "Ajustes" y "Saldo" sin subtítulo/tooltip que explique saldo *de qué* (observado en vivo).
- **Gráfico de ingresos vacío escala el eje en centavos** — observado en vivo en `/analiticas` con datos $0: eje Y "$ 0,04 / $ 0,03 / $ 0,02 / $ 0,01 / $ 0" (autoescala de la librería sobre serie 0). Un gráfico de plata con gridlines de centavos parece un bug de montos. Falta empty state del chart (el de KPIs sí existe — `GhostKpis`).
- **Formato de moneda inconsistente entre vistas** — reporte mensual "$ 0,00" (con decimales) vs dashboard/portal "$ 0"/"$ 100" (sin) — dos convenciones para el mismo dominio donde los centavos no existen.
- **Mock MP: la página tiene guard más débil que las actions** — [mock-mp/checkout/page.tsx:48](src/app/mock-mp/checkout/page.tsx:48) solo chequea `MP_MOCK_MODE !== '1'`, mientras [actions.ts:21-25](src/app/mock-mp/checkout/actions.ts:21) suma `NODE_ENV === 'production'` con comentario de defensa-en-profundidad explícito. Si el flag se filtrara a prod, la página renderizaría datos de cualquier reserva (vía pool BYPASSRLS) aunque los botones den 404. Replicar el guard doble.

## 6. Design system y consistencia visual

### 6.1 Tokens vs hardcode (conteos exactos sobre `src/`)

- `#hex` crudo: 225 usos / 64 archivos; bracket-hex `bg-[#…]`: 27 / 4 (concentrado en `(business)`); `text-white`: 113 / 60; `bg-white`: 64 / 35.
- **Foco partido 50/50**: `focus-visible:ring-ring` (66 usos/40 archivos) vs `focus-visible:ring-emerald-500` (67/41) — hoy idénticos visualmente, pero un cambio del token rompería la mitad de la app en silencio. Anti-patrón nombrado en MASTER §6.1.
- **`dark:bg-zinc-900/60` en 12 inputs** ([BookingFormModal.tsx:419+8 más](src/components/booking/BookingFormModal.tsx:419), [BookingCharges.tsx:367,474,538](src/app/(admin)/reservas/[id]/BookingCharges.tsx:367)): light usa token, dark lo pisa con un gris de familia `zinc` que el sistema (pineado en `slate`) no declara.
- **`(business)` reimplementa el sistema en JSX**: `para-complejos` (13 bracket-hex + 19 hex + `rounded-[28px]`…), `precios` (8+17+11 radios arbitrarios), `PlanSelector` con `style={{borderRadius:'20px'}}` fuera de los 5 tokens de radio; el degradé `.hero-accent-text` que 7 archivos usan por clase está copiado carácter-por-carácter como `style` inline en [para-complejos/page.tsx:139](src/app/(business)/para-complejos/page.tsx:139) y [precios/page.tsx:145](src/app/(business)/precios/page.tsx:145).
- **"Display XL" no existe como está declarado**: MASTER §3 pide `text-5xl md:text-6xl` (48-60px) para el hero del player; [PlayerHeroBand.tsx:42-44](src/components/site/PlayerHeroBand.tsx:42) usa `style={{fontSize:'clamp(26px,6vw,36px)'}}` — la mitad del piso, invisible a cualquier grep (`text-6xl`: **0 usos en todo src/**). Decidir cuál de los dos miente y alinear.
- 103 `text-[Npx]` arbitrarios en 39 archivos (cluster: marketing + `PosicionesTable` + `MisReservasView`).
- MASTER §13 está desactualizado en al menos 3 puntos A FAVOR del código: `button.tsx`/`badge.tsx` ya tokenizados (el doc dice "14/16 sin tokens"), `GhostKpis` ya implementa el KPI espectral listado como deuda, y el "toast 1 error" de landing ya no existe.

### 6.2 Duplicaciones de componente

- `TenantStatusBadge` ×2 divergido (🔴 §4.8).
- Dos implementaciones de "banear jugador manualmente": [BanPlayerControls.tsx](src/app/(admin)/jugadores/[playerId]/BanPlayerControls.tsx) (radios, default 7d, motivo vacío, ConfirmDialog) vs [ManualBanDialog.tsx](src/app/(admin)/deudas/ManualBanDialog.tsx) (select, default 30d, motivo precargado, Dialog "Sancionar Jugador") — dos Server Actions con firmas distintas para la misma acción de negocio.
- "Método de pago → etiqueta" reimplementado **7 veces** ([BookingPopover.tsx:7](src/components/booking/BookingPopover.tsx:7), [QuickActions.tsx:60](src/app/(admin)/reservas/QuickActions.tsx:60) — este sin `mercadopago`, [CompleteBookingDialog.tsx:12](src/app/(admin)/reservas/CompleteBookingDialog.tsx:12), [BookingCharges.tsx:29,56](src/app/(admin)/reservas/[id]/BookingCharges.tsx:29) — dos en el mismo archivo, [BookingDetailCard.tsx:13](src/app/(admin)/reservas/[id]/BookingDetailCard.tsx:13), [ChargeDebtDialog.tsx:12](src/app/(admin)/deudas/ChargeDebtDialog.tsx:12), [RegisterMovementModal.tsx:52](src/app/(admin)/caja/components/RegisterMovementModal.tsx:52) — que además importa `chipClass` desde el `caja-lib.ts` que ya exporta la lista canónica).
- "Hoy en ART" reinventado con offset UTC-3 hardcodeado en 15+ archivos cuando `todayART()` existe ([grilla/page.tsx:34](src/app/(admin)/grilla/page.tsx:34), [QuickBookingButton.tsx:36](src/components/booking/QuickBookingButton.tsx:36), `public.service.ts`, `availability-search.service.ts`, …).
- `SectionCard` del super-admin duplicado con distinto nivel de heading (h2 vs h3) → §7.
- 275 `<button>` crudos en 118 archivos; caso con gap real de a11y: [AbonadosList.tsx:337-360](src/app/(admin)/abonados/AbonadosList.tsx:337) — 9 botones sin ningún `focus-visible:ring`, y en `text-blue-600` (hue reservado por MASTER §2.2 a contexto MercadoPago).

### 6.3 La contradicción resuelta: inputs `text-sm` y el zoom de iOS

Dos auditorías reportaron "inputs <16px → zoom de iOS" en ~20 campos ([RegisterCard.tsx:202](src/app/(auth)/register/RegisterCard.tsx:202), [ActaPanel.tsx:129-181](src/app/(admin)/torneos/[id]/partidos/[matchId]/ActaPanel.tsx:129), [confirm-dialog.tsx:99](src/components/ui/confirm-dialog.tsx:99), [ProfileForm.tsx:71-107](src/app/(player)/perfil/ProfileForm.tsx:71), [CourtForm.tsx:183-230](src/app/(admin)/canchas/components/CourtForm.tsx:183), [ManualBanDialog.tsx:117,128](src/app/(admin)/deudas/ManualBanDialog.tsx:117), etc.). **Verificado contra `globals.css` (~línea 345): existe un guard global** — `@media (width < 48rem)` fuerza `font-size: 16px` en todo `input`/`textarea`/`select`/`[contenteditable]`, con test de regresión (`tests/unit/mobile-font-size-guard.test.tsx`). **El zoom NO ocurre en la práctica.** El hallazgo real se degrada a: (a) ~20 campos cuyo `text-sm` "miente" y depende de un guard que el propio CSS llama "bomba de tiempo visual"; (b) la causa raíz es no usar el primitive `Input` (que ya trae `text-base md:text-sm`) — visible dentro de un mismo archivo: [CourtForm.tsx](src/app/(admin)/canchas/components/CourtForm.tsx) usa inputs crudos arriba y el primitive abajo. Severidad consolidada: 🟡 mantenibilidad, no 🔴 mobile.

---

## 7. Arquitectura de información y navegación

- **La pregunta "¿por qué hay 3 páginas de números?" tiene respuesta verificada: ya no las hay.** `/metricas` y `/reportes` son `redirect('/analiticas')` puros; `/deudas` → `/jugadores/deudas`; `/canchas` → `/settings/canchas`; `/staff` → `/settings/equipo`. La consolidación de IA está hecha y bien. Lo que quedó: (a) los dos "Ingresos" con ventanas distintas dentro de `/analiticas` (§5); (b) **el código fuente no se mudó** — 5 casos donde la carpeta vieja conserva toda la implementación y la ruta nueva importa cruzado (`(admin)/deudas/*`, `(admin)/canchas/*`, `(admin)/staff/*`, `(admin)/metricas/*`), sembrando el clásico "edité el archivo y no pasó nada" (🟢 mantenibilidad).
- **Sidebar del manager esconde en vez de bloquear** — [admin-sidebar.tsx:44-54,71-75](src/components/layout/admin-sidebar.tsx:44): "Configuración" desaparece del DOM para `manager`; MASTER §6.8 pide candado + tooltip "Solo el dueño" ("el encargado entiende el sistema completo").
- **4 de 6 pestañas de Settings se titulan igual**: [facturacion/page.tsx:63](src/app/(admin)/settings/facturacion/page.tsx:63), [horarios/page.tsx:24](src/app/(admin)/settings/horarios/page.tsx:24), [perfil/page.tsx:18](src/app/(admin)/settings/perfil/page.tsx:18), [reservas/page.tsx:19](src/app/(admin)/settings/reservas/page.tsx:19) — `<h1>Configuración</h1>` genérico sin `PageHeader`, mientras Canchas/Equipo sí muestran título propio. En mobile, con los tabs scrolleados fuera de vista, no hay con qué identificar la pantalla. Además `/settings` redirige al tab #2 (`reservas`), elección arbitraria.
- **Portal público: jerarquía invertida para Tomás** (observado en vivo + screenshot): orden actual = header → Horarios (tabla de 7 días que ocupa la primera pantalla) → Canchas → **Disponibilidad** (la conversión, 3 scrolls abajo) → Reseñas. La leyenda de la grilla expone 5 estados con jerga interna ("Turno fijo", "Bloqueado") a un jugador que solo necesita libre/ocupado; los slots "Ocupado" muestran precio igual (ruido).
- **`/[slug]/torneos` es huérfana de navegación con 1-4 torneos** — [\[slug\]/page.tsx:146](src/app/(public)/[slug]/page.tsx:146): el link "Ver todos" solo aparece con `length > 4` — el caso más común de un complejo recién estrenando el flag no tiene ningún camino a la página indexable.
- **La página standalone `/[slug]/disponibilidad` es más pobre que el modal equivalente**: sin navegación de semanas ([disponibilidad/page.tsx](src/app/(public)/[slug]/disponibilidad/page.tsx) llama una sola vez sin parámetro), mientras el modal del portal sí navega semanas respetando `bookingAdvanceDays`. La URL compartible por WhatsApp es la versión sin futuro.
- **Dualidad `/login` vs `/ingresar` sin cross-links**: son dos personas (staff password / jugador magic-link) y el backend lo maneja bien, pero ningún punto de entrada linkea al otro salvo el estado de error de `/verify` — un jugador con bookmark viejo en `/login` no tiene pista.
- **Pestaña "Equipos y horarios" del torneo apila 3 paneles pesados** (equipos con roster + horarios con historial de 40 filas + portal público) mientras Fixture/Posiciones/Inscripciones tienen tab propio ([torneos/[id]/page.tsx](src/app/(admin)/torneos/[id]/page.tsx)) — con 20 equipos, scroll eterno en mobile.
- **`notFound()` sin `not-found.tsx` de grupo expulsa del layout**: 8+ páginas admin/super-admin llaman `notFound()` ([jugadores/[playerId]/page.tsx:32](src/app/(admin)/jugadores/[playerId]/page.tsx:32), `reservas/[id]`, `torneos/[id]/*`, `super-admin/tenants/[id]`) y burbujean al 404 raíz SIN sidebar, con CTA "Volver al inicio" → `/` (marketing). Para un staff logueado lee como "me echó del sistema".

## 8. Feedback, microinteracciones y estados

- **Onboarding y flujo de reserva sin `h1`** (verificado en pagelog de 96 páginas: `h1s: []` en `/onboarding` y `/[slug]/reservar` en ambos viewports) — las dos páginas más importantes para SEO/a11y de cada persona arrancan la jerarquía en h2/h3.
- **"Revisá tu email" es un dead-end** (observado en vivo): sin botón reenviar, sin mención de spam, sin decir si el turno queda reservado mientras tanto ni cuánto tiempo hay. En el flujo CON seña este muro aparece ANTES de pagar (ver §13.3).
- **Grilla mobile: el día activo queda fuera de vista** (screenshot + [WeekStrip.tsx](src/components/booking/WeekStrip.tsx) sin `scrollIntoView`/`scrollTo`, grep 0): el strip muestra LUN-VIE y el SÁB seleccionado asoma como una rayita en el borde — Rodrigo no ve qué día mira sin scrollear el carrusel a mano.
- **Modal de reserva telefónica sin autofocus en Nombre** — [BookingFormModal.tsx:99,194-201](src/components/booking/BookingFormModal.tsx:99): el foco solo se setea al *clickear* un chip de motivo; como "Reserva Telefónica" es el default, al abrir no corre nada — un click extra en el escenario más frecuente de Rodrigo.
- **Torneos: ~10 mutaciones sin toast** (agregar/borrar equipo, plantel, reservar/liberar horas, fixture, resultados, walkover, eventos) — el único feedback es que la lista se refresca; Abonados/Staff/Canchas toastean todo. Dos estándares de feedback en el mismo producto.
- **Acta de partido sin steppers** — [ActaPanel.tsx:121-153](src/app/(admin)/torneos/[id]/partidos/[matchId]/ActaPanel.tsx:121): cargar "3" goles exige abrir el teclado del celular; botones +/- serían más rápidos y menos propensos a error al lado de la cancha. "Borrar resultado" y walkover ejecutan sin confirmación; "Borrar fixture" ([FixturePanel.tsx:272-280](src/app/(admin)/torneos/[id]/fixture/FixturePanel.tsx:272)) tampoco confirma ni dice cuántos resultados se pierden.
- **`alert()` nativo en el onboarding** — [CourtDraftCard.tsx:249,257](src/app/onboarding/components/step-courts/CourtDraftCard.tsx:249): los errores de foto de cancha rompen el look premium con el popup gris del navegador, en plena primera impresión (mismo bug ya mordió en el primer wizard real — PR #86).
- **`window.confirm()` para impersonar** — [impersonate-button.tsx:34-40](src/app/(super-admin)/super-admin/tenants/[id]/_components/impersonate-button.tsx:34): la acción más sensible del panel usa la confirmación más débil; las vecinas menores exigen tipear el nombre del tenant.
- **Fallback silencioso a estado de éxito** — [status-visual.tsx:83,88](src/app/(admin)/reservas/status-visual.tsx:83): un `booking.status` desconocido renderiza "Jugada" (verde éxito) — bomba de tiempo si se agrega un estado y nadie actualiza el mapa; fallback neutro "Estado desconocido" corresponde.
- **Caja: dos modelos de guardado en la misma pantalla** (observado): "Guardar horarios" es batch al final, "Agregar día cerrado" es inmediato — ambigüedad clásica de "¿esto ya se guardó?". Y "Cerrar caja" está visible/activo antes de abrir la caja (jerarquía temporal invertida).
- **Estados vacíos de la grilla pública sin acción** — [AvailabilityGrid.tsx:313-317,356-361](src/app/(public)/[slug]/components/AvailabilityGrid.tsx:313): "Sin turnos para esta fecha" no distingue cerrado vs lleno ni ofrece "probar otro día" — el resto del sistema sí sigue el patrón didáctico (`EmptyResults` de explorar).
- **Cobertura de `loading.tsx` despareja**: dashboard (4 awaits, primera pantalla post-login), `settings/facturacion` (5 awaits, OAuth MP), jugadores, analiticas y todo super-admin quedan sin skeleton en la cadena de ancestros; grilla/caja/abonados sí tienen siluetas reales. `reserva/[bookingId]/verificar` es el único de los 4 hermanos sin loading propio.
- **Modal de galería pública sin focus-trap** — [TenantGallery.tsx:93-146](src/app/(public)/[slug]/components/TenantGallery.tsx:93): único modal custom no-Radix del repo; Escape/flechas sí, pero Tab escapa a la página tapada por el overlay. En la página pública de mayor tráfico; axe estático no lo ve.
- **Checkout: la declaración jurada no linkea los términos** — [LoginGate.tsx:73-76](src/app/(public)/[slug]/reservar/components/LoginGate.tsx:73): "acepto los términos y condiciones (declaración jurada)" es texto plano; leerlos implica abandonar el form no-controlado y perder lo tipeado.
- **Countdown sin urgencia visual** — [ExpiryCountdown.tsx](src/components/booking/ExpiryCountdown.tsx): el timer de la seña nunca cambia de color al acercarse a 0.

## 9. Formularios

- **Validación "primer error y submit"** en el form más largo del admin — [AbonadoForm.tsx:289-338](src/app/(admin)/abonados/nuevo/AbonadoForm.tsx:289): early-return campo por campo con banner único al fondo; corregir 3 campos = 3 submits. Sin errores inline por campo; validación mixta (nativa en unos, custom en otros). El patrón correcto (fieldErrors por campo) ya existe en register.
- **Labels con dos convenciones en el mismo form** (screenshot abonados/nuevo): "CANCHA/DÍA SEMANAL/EMPIEZA EL" en mayúsculas+ícono vs "Teléfono \*" sentence-case+asterisco — y el asterisco solo en teléfono cuando cancha/fecha también son obligatorios.
- **Cupo de torneo hasta 256 equipos** — [TorneoForm.tsx:180-191](src/app/(admin)/torneos/nuevo/TorneoForm.tsx:180): techo sin guía para un torneo de complejo barrial.
- **Onboarding: 3 mecanismos de submit distintos en 4 pasos** (`onSubmit+preventDefault` / `useActionState` / `onClick` suelto) — [StepIdentity](src/app/onboarding/components/StepIdentity.tsx), [StepSchedule](src/app/onboarding/components/StepSchedule.tsx), [StepCourts](src/app/onboarding/components/StepCourts.tsx), [StepPayments](src/app/onboarding/components/StepPayments.tsx).
- **Combobox de capitán declara ARIA que no cumple** — [TeamsPanel.tsx:163-182](src/app/(admin)/torneos/[id]/TeamsPanel.tsx:163): `role="combobox"` sin navegación por flechas/Enter; placeholder confuso "Buscar jugador u opcional".

## 10. Copywriting es-AR

**Verificado limpio (relevante decirlo):** cero tuteo real (~55 candidatos revisados uno a uno — todos comentarios, 3ª persona o sustantivos), cero "cancelled" doble-L visible, cero "Loading/Submit/Save", terminología "seña" 100% consistente (88 archivos, cero "depósito/anticipo"), fechas es-AR.

Lo que sí hay:

- **"Turnos Fijos" vs "Suscripción" vs "abonados"**: el sidebar y el h1 dicen "Turnos Fijos", el resumen del form dice "Resumen de Suscripción" ([AbonadoForm.tsx](src/app/(admin)/abonados/nuevo/AbonadoForm.tsx)), la ruta y el código dicen `/abonados` — tres nombres para el mismo concepto en la misma pantalla.
- **Módulo Deudas en Title Case sistemático** ("Monto Total Acumulado en Deuda", "Saldar Deuda", "Sancionar Jugador", "Motivo del Bloqueo" — [DebtListClient.tsx:54,68](src/app/(admin)/deudas/DebtListClient.tsx:54), [ChargeDebtDialog.tsx:152](src/app/(admin)/deudas/ChargeDebtDialog.tsx:152), [ManualBanDialog.tsx:91,110,122](src/app/(admin)/deudas/ManualBanDialog.tsx:91)) + **"Sin Nombre (Guest)"** con anglicismo ([DebtListClient.tsx:145](src/app/(admin)/deudas/DebtListClient.tsx:145)) — la única zona que no pasó por el rediseño v2. También "Nuevo Turno Fijo" ([abonados/nuevo/page.tsx:29](src/app/(admin)/abonados/nuevo/page.tsx:29)) vs "Nuevo turno fijo" en el CTA que lleva ahí, y "Motivo / Tipo de Bloqueo" en la grilla ([BookingFormModal.tsx:631](src/components/booking/BookingFormModal.tsx:631)).
- **El email del magic link no sabe que hay una reserva en juego** — [supabase/templates/magic_link.html](supabase/templates/magic_link.html) (verificado en vivo): asunto "Tu acceso a TurnoGol", cuerpo "Hacé click para entrar y ver tus reservas", CTA "Ingresar" — cuando el uso principal es CONFIRMAR una reserva concreta. No menciona complejo, fecha ni hora; un Tomás distraído no entiende que sin click no hay cancha. (Limitación real: es el template único de GoTrue — personalizarlo por contexto no es trivial; mínimo, el copy debería cubrir ambos casos: "para entrar y confirmar tu reserva".)
- **Plural con paréntesis inglés** "gol(es) / cobro(s) / hora(s)" en [torneos/actions.ts](src/app/(admin)/torneos/actions.ts) (7 mensajes) mientras el resto del módulo resuelve plurales con ternarios.
- **h1 de la home con palabras pegadas**: "Reservá tu canchaal instante." — [Hero.tsx:66](src/app/home/Hero.tsx:66): el `<span className="hero-accent-text">al instante.</span>` concatena sin espacio con "cancha" (confirmado en el pagelog de las 96 capturas). Lectores de pantalla y Google leen "canchaal".
- **"¿Qué club buscás?"** ([HeroSearch.tsx:144,283](src/components/site/HeroSearch.tsx:144)) vs "complejo" en las otras 414 instancias — probablemente coloquial deliberado; confirmar.
- **Teléfono del complejo sin formatear** en el portal: "+541100000000" crudo como texto visible (observado en vivo; formatear para humanos).
- **Emojis como íconos estructurales** (⚡💡⚠📞) en [BookingCharges.tsx:303,432](src/app/(admin)/reservas/[id]/BookingCharges.tsx:303) y [CompleteBookingDialog.tsx:347,358](src/app/(admin)/reservas/CompleteBookingDialog.tsx:347) — anti-patrón MASTER §11 con Lucide ya importado en los mismos archivos.
- **"+1.200 turnos libres hoy" inventado** sobrevive como código muerto en [HeroSearch.tsx:264](src/components/site/HeroSearch.tsx:264) (rama `horizontal` sin call sites) — la deuda P2-7 de MASTER no se resolvió, se dejó de renderizar; mina lista para reactivarse.

## 11. Accesibilidad (además de los 🔴 4.7/4.9)

**Verificado limpio:** 8/8 botones icon-only con `aria-label`; 0 `outline-none` sin reemplazo; 0 tabIndex positivo; imágenes con `alt`/`sizes` correctos; Radix en 20 modales con labels axe-conscientes; `prefers-reduced-motion` respetado en todos los reveals.

- **Heading skips**: `/explorar` h1→h3 en el camino con resultados (el h2 solo existe en el empty — [TenantCard.tsx:85,201](src/app/(public)/explorar/components/TenantCard.tsx:85)); super-admin tab "Acciones" h1→h3×7 por el `SectionCard` duplicado ([detail-primitives.tsx:14](src/app/(super-admin)/super-admin/tenants/[id]/_components/detail-primitives.tsx:14) h2 vs [support-actions/SectionCard.tsx:4](src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/SectionCard.tsx:4) h3). Invisible al CI: `heading-order` es best-practice, fuera de las tags WCAG del helper.
- **3 `<select>` fantasma tabulables** en el modal de reserva — [BookingFormModal.tsx:391-411,472-484,658-670](src/components/booking/BookingFormModal.tsx:391): `sr-only` sin `tabIndex={-1}`/`aria-hidden` — el teclado pasa por 3 controles invisibles.
- **`title=` nativo en vez de Tooltip** para botones deshabilitados ([BookingCharges.tsx:262-270](src/app/(admin)/reservas/[id]/BookingCharges.tsx:262), [DebtListClient.tsx:197,216](src/app/(admin)/deudas/DebtListClient.tsx:197)) — en touch no existe: el motivo del botón gris es invisible en el celular.
- **Layout admin sin landmark `<main>`** (observado en vivo: `get_page_text` no encuentra `main` en `/caja` mientras todo el público sí lo tiene) — verificar `AdminLayoutShell` y cerrar el gap de landmarks.
- **Error de "Quitar día cerrado" sin `aria-live`** ([RemoveClosedDateForm.tsx:36-38](src/app/(admin)/settings/horarios/RemoveClosedDateForm.tsx:36)) cuando sus hermanos del mismo form sí lo tienen.
- **Targets <44px** concentrados en diálogos de cobro: chips h-9 ([CompleteBookingDialog.tsx:27-32](src/app/(admin)/reservas/CompleteBookingDialog.tsx:27)), +/-/borrar del ticket h-9 sin cascada ([TicketPanel.tsx:320-347](src/app/(admin)/caja/cantina/TicketPanel.tsx:320)), estrellas de reseña ~40px ([LeaveReviewButton.tsx:82-101](src/app/(player)/mis-reservas/LeaveReviewButton.tsx:82)), X de borrar equipo ~28px ([TeamsPanel.tsx:296-304](src/app/(admin)/torneos/[id]/TeamsPanel.tsx:296)).

## 12. Velocidad percibida y varios

- **Sin waterfalls reales**: los 5 page.tsx de mayor tráfico con 3+ awaits fueron leídos — cada await depende del anterior; único paralelizable: [analiticas/page.tsx:63-67](src/app/(admin)/analiticas/page.tsx:63) (`getStaffTenant` + `resolveSystemAdmin`). El dashboard tiene un `getDailyClose` serializado evitable ([dashboard/page.tsx:52-68](src/app/(admin)/dashboard/page.tsx:52)).
- **Marketing acoplado a JS (fail-closed)**: observado en vivo — 36 elementos de `/precios` (cards de features, FAQs) arrancan `opacity-0` esperando el observer; `motion-reduce` está bien contemplado, pero si la hidratación falla, la página de PRECIOS no muestra contenido. Mismo patrón en la home (el fullPage screenshot headless la captura 60% vacía). Riesgo de conversión bajo pero fail-open sería gratis (contenido visible por defecto, animación como mejora).
- **Tabs de `/perfil` con `<a>` nativo** ([ProfileHeaderNav.tsx:63](src/app/(player)/perfil/ProfileHeaderNav.tsx:63)) = recarga completa por tab, vs `<Link>` en mis-reservas — mismo patrón visual, dos mecanismos, el peor en la pantalla de 4 tabs.
- **`BookingFormModal` con `dynamic({ssr:false})` sin fallback** ([BookingGrid.tsx:33-36](src/components/booking/BookingGrid.tsx:33)): el primer tap en un slot descarga el chunk sin spinner — "no pasó nada" en la PC del mostrador.
- **`<title>` genérico**: `/[slug]/reservar` y las vistas del player quedan como "TurnoGol" pelado (observado), mientras el portal sí compone "Complejo · TurnoGol".
- **`animate-ping` infinito decorativo** en el sidebar admin ([admin-sidebar.tsx:100-103](src/components/layout/admin-sidebar.tsx:100)) — anti-patrón §5.3/§11 del MASTER para vistas de tarea.
- **Glow de marketing dentro de settings** ([ActivatePlanSection.tsx](src/app/(admin)/settings/facturacion/ActivatePlanSection.tsx), [ReservasPolicyForm.tsx:294](src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx:294)) — lenguaje visual de `/precios` en pantallas operativas.
- **`PinGate` fantasma**: comentarios en [analiticas/page.tsx:54](src/app/(admin)/analiticas/page.tsx:54) y `settings/layout.tsx` refieren a una protección por PIN que no existe en ningún lado (grep 0) — comentarios mintiendo sobre seguridad inexistente (el comportamiento actual es el correcto según los roles documentados; el bug es el comentario).
- **`bg-emerald-505`** typo muerto en [ActivatePlanSection.tsx:126](src/app/(admin)/settings/facturacion/ActivatePlanSection.tsx:126).
- **0,0% sobre 0 turnos**: la tasa de ausencias muestra 0/0 como "0,0%" (en vivo, `/analiticas`) — "Sin datos aún" sería honesto.

## 13. REQUIERE INPUT — decisiones de negocio (no aplicar sin el dueño)

1. **Retención churned: ¿90 días o 7?** Términos §6 y Privacidad §5 prometen 90 días de datos tras la baja; `CHURNED_DELETION_DAYS = 7`. O el código extiende, o el legal corrige a 7 aclarando que los 90 son la etapa `blocked` previa. Con Ley 24.240 invocada, no es un detalle. (§4.10)
2. **Ban manual por deuda: ¿debe existir con default "Deuda incobrable + Permanente"?** Reintroduce con un click el modelo revertido el 2026-07-11. Opciones: quitar el precargado y el "Permanente" para motivos de deuda, alinear el tope al softban (14 días), o ratificar que el staff puede banear indefinido por plata (revirtiendo la decisión). (§4.11)
3. **El magic link en el medio del checkout con seña.** Hoy: slot → form → **email → inbox → click → volver** → pagar en MP. Cada salto de app en mobile pierde usuarios, y acá hay DOS (email + MP) antes de confirmar. Es consecuencia directa de ADR-002 (passwordless) y no se arregla con copy — pero el costo de conversión es real y medible. Alternativas a evaluar en v1.5: OTP de 6 dígitos inline (sin salir), sesión persistente más agresiva, o pagar primero y verificar email después. Mientras tanto, lo barato: pantalla "Revisá tu email" con reenviar + "el turno te queda reservado X minutos" + email que mencione la reserva (§8, §10).
4. **¿La identidad visual partida light/dark es una decisión?** Admin+portal light; player+auth+checkout+business dark; home light y `/precios` dark. Si es intencional (marketing dark premium / herramienta light neutra), documentarla en MASTER y arreglar solo los bordes rotos (blog §4.3, auth hardcodeada sin `.dark` wrapper [ingresar/page.tsx:13](src/app/(auth)/ingresar/page.tsx:13), [verify/page.tsx:65](src/app/(auth)/verify/page.tsx:65)). Si no, es el proyecto de consistencia más grande que deja este informe.
5. **"¿Qué club buscás?"** como copy coloquial del buscador vs "complejo" universal — confirmar o unificar. (§10)

## 14. Lo que se verificó y está BIEN (control positivo)

Para calibrar la dureza del resto: precios públicos $55.000/$85.000/$115.000 y anual −20% **sincronizados** con `plans-data.ts` y la tabla real; "30 días gratis" = `TRIAL_DAYS`; "60 días post-trial" = constante real (60+7); calculadora de `/precios` sin claims inventados; cero `href="#"`, cero TODO visibles, cero console.log residuales; 18/18 tablas con protección responsive; filtros de explorar con paridad mobile real (Sheet); `ResponsiveList` en todas las listas largas del admin; empty states del dashboard con 3 variantes según el motivo; error boundaries existentes con Sentry + retry + acción contextual; iconografía 100% Lucide (0 mezclas); `next/font` sin FOUT; overlays `bg-black/50` canónicos; upcoming-bookings, GhostKpis, ChangePlanSection/CancelSubscriptionSection y el flujo "Completar y cobrar" server-side citados por las auditorías como ejemplares.

## 15. Anexo — método y trazabilidad

- **Sub-reports crudos** (scratchpad de la sesión, `audit-1…6-*.md`): admin-operación 37 hallazgos (11🔴/15🟡/11🟢), admin-gestión 53 (5/16/32), player-auth-conversión 20 (2/9/9), público-business-superadmin 16 (4/7/5) + 7 verificaciones positivas, design-system 15 (2/8/5), transversal 10 (1/5/4). Este documento deduplica los solapamientos (patrón emerald-600 reportado por 3 auditorías; `window.confirm` por 2; inputs 16px por 3 — resuelto en §6.3) y suma ~14 hallazgos propios del recorrido en vivo (banner torneos §4.12, eje en centavos §5, WeekStrip §8, email template §10, h1 pegado §10, fail-closed JS §12, entre otros).
- **Honestidad del método**: dos hallazgos que este auditor creyó ver en vivo se DESCARTARON al verificar — el "crash de login staff" era la DB local sin las migraciones 067/069 (entorno, no producto), y el "radio que anuncia cash en inglés" era la herramienta de accesibilidad del pane mostrando el value (el label envolvente de [PaymentMethodSelector.tsx:97-116](src/app/(public)/[slug]/reservar/components/PaymentMethodSelector.tsx:97) es válido). Los conteos de grep de las auditorías descartaron sistemáticamente falsos positivos antes de reportar (55 candidatos de tuteo → 0 reales; 29 anchos fijos → 0 reales; 20 archivos "sin toast" → 1 real).
- **Límites**: no se corrió Lighthouse ni axe dinámico nuevo (existen en CI); la velocidad percibida se evaluó en dev (no concluyente para métricas absolutas, sí para waterfalls estructurales); el flujo de upgrade de plan con MP real y el panel con datos de producción no se recorrieron.

