# Auditoría UI completa — TurnoGol (barrido de ~54 agentes, 2026-07-28)

Reporte maestro de síntesis. Fuente: resultados crudos de ~54 subagentes de QA visual recorriendo la app entera con browser real, en 10 olas paralelas (fixtures/estados difíciles, público, auth, jugador, manager, admin, super-admin, tema/responsive, diff sin commitear, re-verificación de hallazgos previos). Ningún fix se aplicó en este barrido — solo observación y síntesis.

## (a) Resumen ejecutivo

**46 hallazgos activos** (ya deduplicados por causa raíz) + 2 hallazgos previos confirmados **RESUELTOS** (no generaron findings nuevos).

| Severidad | Cantidad |
|---|---|
| 🔴 Crítico | 11 |
| 🟡 Medio | 22 |
| 🟢 Bajo | 13 |
| **Total activos** | **46** |

| Relación con hallazgos previos | Cantidad |
|---|---|
| Nuevos (no documentados antes) | 42 |
| Recurrentes (mismo problema, sigue igual) | 2 — banner push tapa botones mobile; mock MP `amount=1` contamina caja |
| Matizados (parcialmente resueltos o refutados) | 2 — guard de plazo en cancelación admin; contraste WCAG emerald-600/700 |
| Resueltos (ya no reproducen) | 2 — B1 (orden FSM/MP en cancelación con seña); B2 (atomicidad de `expire-trials.worker`) |

**Cobertura**: 403 puntos de cobertura registrados en las 10 olas (ruta × rol × condición) → **209 efectivamente verificados (52%)**, 194 sin verificar con motivo explícito documentado (ver tabla completa en (b)). La causa dominante de los gaps (>70% de los `tested:false`) fue infraestructura compartida del entorno de QA (tope de 9 tabs de browser repartidas entre ~54 agentes concurrentes, `computer{screenshot}` roto el 100% de las sesiones, sesión de staff/jugador compartiendo cookie, resets de DB concurrentes) — no falta de intento. Se señala explícitamente dónde el gap es de infraestructura de testing vs. dónde es un gap de producto real (Super Admin, onboarding wizard).

**Nota metodológica transversal**: ninguna de las ~54 sesiones logró tomar una captura de pantalla real (`computer{action:"screenshot"}` devolvió "the Browser pane is not displayed, so the page is not compositing frames" de forma consistente en el 100% de los intentos). Toda la verificación visual de este barrido se hizo vía árbol de accesibilidad (`read_page`), extracción de texto (`get_page_text`) y estilos computados vía JS (`getComputedStyle`/`getBoundingClientRect`), nunca por inspección de píxeles reales. Los hallazgos de contraste/overlap reportados abajo están calculados con la fórmula WCAG real sobre colores computados, no "a ojo" — pero ningún hallazgo de este barrido debe tratarse como confirmación visual definitiva sin una revisión con captura real.

---

## (b) Tabla de cobertura completa

Un punto de cobertura por fila (ruta × rol/tema/viewport tal como lo registró cada agente). Agrupada por módulo/ola para navegabilidad; es la cobertura consolidada de las 10 olas.

### Fixtures / estados difíciles (85 puntos — 53 verificados, 32 no)

| Ruta | Rol | Tested | Motivo si no |
|---|---|---|---|
| /login (admin), lectura de código invite flow, /settings/equipo invitar, Inbucket mailbox, click "Accept invitation", /forgot-password→recovery, /login manager→/dashboard, /settings manager click Configuración, /settings/equipo manager directo | admin/manager | 9× T | — |
| Inspección visual por screenshot (invite flow) | — | F | screenshot roto toda la sesión |
| /login, /dashboard, /grilla hoy, /settings/canchas toggle, /dashboard Reserva rápida, /jugadores listado+ficha, login jugador magic link | admin/jugador | 7× T | — |
| Crear 2 reservas manuales pasadas para softban, Marcar No vino 1ra/2da vez | admin | F ×3 | reserva manual de admin nunca lleva `player_id` (bloqueo estructural, ver finding); reservas de prueba pisadas por otro agente concurrente |
| Reservar online como jugador / intentar reservar bloqueado | jugador | F ×2 | portal sin canchas disponibles (otro agente togglea Online/Offline en simultáneo) + sesión de jugador pisada por cookie compartida |
| /login dark, /settings/canchas, /e2e-complejo-demo público, /e2e-complejo-demo/reservar (guard esperado) | admin/público | 5× T | — |
| /dashboard Reserva rápida (offline court) | admin | T | usado como sustituto de /grilla |
| /grilla y /grilla?date= | admin | F | nunca terminó hidratación (48 skeletons stuck), servidor respondía OK por fetch directo |
| /abonados/nuevo, pausar, reactivar, cancelar, /login previo | manager | F ×5 | sin tab propia (tab cap), no se pudo abrir sesión aislada |
| /e2e-complejo-sena público, /reservar, /mock-mp/checkout, espera real expiración (pg-boss), /disponibilidad re-check, /api/public/availability fetch, /reservar reintento, /mis-reservas jugador | jugador | 8× T | — |
| /reservas admin forzar expiración, /reservas/[id] forzar expiración, /grilla admin ver expirado | admin | F ×3 | `e2e-admin` no es staff del tenant `e2e-complejo-sena` (sin fixture de cuenta) |
| /login, /dashboard, /grilla lectura, /settings/canchas read-only | admin | 4× T | — |
| /grilla crear reserva pasado, /reservas/[id] marcar No vino, /reservas/[id] Deshacer ausente | admin | F ×3 | pane sin compositing (`document.hidden=true` persistente) + sesión pisada por agentes concurrentes, 80+ reintentos de click sin efecto real |
| /login super-admin, /super-admin sin sesión, Inbucket mailboxes/monitor | super-admin | 4× T | — |
| /super-admin/tenants forzar transición dunning, dashboard tenant afectado, portal público tenant afectado | super-admin | F ×3 | sin cuenta system-admin disponible (requiere `pnpm seed:system-admin` manual), no descubrible desde la UI |
| /login, /torneos/nuevo crear, tomar horarios, anotar equipos, generar fixture, partido normal, walkover, /posiciones, Publicar torneo, portal público listado | admin/público | 10× T | — |
| capitán vinculado a Player, tarjeta amarilla, tarjetas hasta suspensión, detalle público del torneo, verificar no-DNI en público, screenshots, cobro de inscripción | admin/público | F ×7 | sin UI de autocomplete de Player (capitán); sin UI de plantel (tarjetas, ver finding crítico); portal público crashea antes de renderizar (SQL bug); sin tiempo/fuera de alcance de los pasos pedidos |
| /e2e-complejo-sena público+reservar+mock-mp, /mis-reservas cancelar fuera de plazo, /dashboard admin tenant demo, /grilla+/reservas bloqueo Mantenimiento, /caja verificar $0 sin movimiento | jugador/admin | 6× T | — |
| Vista admin tenant seña (booking del Caso A), /grilla drag-select directo, edición de precio $0 en reserva real | admin | F ×3 | sin staff seedeado para tenant seña; celdas vacías sin rol accesible + pane sin compositing; no existe campo de precio en el modal (ver finding crítico) |

### Público (26 puntos — 9 verificados, 17 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| /, /explorar, /precios, /blog, /blog/[slug], /para-complejos, /vs/alquila-tu-cancha (desktop+mobile) | 7× T | — |
| /e2e-complejo-demo, /disponibilidad, /reservar | F ×3 | tab cap (9/9), 11 reintentos sin liberar tabs |
| /e2e-complejo-demo/torneos, /torneos/liga-qa-julio | 2× T | — |
| verificar equipos/fixture/tabla visibles sin login, verificar no-DNI, dark/mobile | F ×3 | página crashea (error SQL, ver finding crítico) antes de renderizar nada |
| /privacidad, /terminos, /suspended, /reactivar, /esto-no-existe-123 (404), /metricas, /reportes, /canchas, /deudas, /staff, /settings (redirects de rutas viejas) | F ×11 | tab cap (9/9), 7 reintentos en ~2 min sin liberar tabs |

### Auth (27 puntos — 25 verificados, 2 no)

| Ruta | Rol | Tested | Motivo si no |
|---|---|---|---|
| /login, password incorrecta, contraste light, /forgot-password, /reset-password (4 variantes: link válido+débil, no coincide, misma actual, válida+éxito) | admin | 8× T | — |
| /login y /reset-password mobile | admin | F | sin tiempo tras resolver contención de pane |
| /ingresar, magic link real, validación email inválido, mobile; /register, validación mismatch, mobile; /verify (nuevo jugador real, success×3 intents, error×4 variantes, sin params, reuso real de token) | jugador | 17× T | — |
| captura pixel-perfect | jugador | F | screenshot roto |

### Jugador (18 puntos — 5 verificados, 13 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| /e2e-complejo-sena landing, selección horario+modal, /mock-mp/checkout ×3 (aprobar/rechazar/pendiente), /reserva/[id]/exito, /error, /pendiente | F ×8 | tab cap total (9/9 ocupadas, 5 reintentos), tab reusada terminó siendo conducida por otro agente en simultáneo |
| /mis-reservas Próximos, Historial, cancelar con seña, cancelar sin seña, mobile | 5× T | — |
| cancelar con seña muy cercana al turno, dejar reseña sobre turno completed | F ×2 | bloqueado por bug crítico de cancelación con seña; no hay forma de generar un turno `completed` vía UI (solo fechas futuras) |
| /perfil, /configuracion | F ×2 | tab cap (8 intentos en 3-4 min) |
| /eliminar-cuenta | F | tab cap (5 intentos) |

### Manager (81 puntos — 46 verificados, 35 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| /login, /dashboard, /settings sidebar target | 3× T | — |
| /dashboard modales Reserva/Venta rápida submit, checklist "Configurar" click-through, visual contraste/overlaps, mobile | F ×4 | tab compartida re-navegada por otro agente en simultáneo; screenshot roto |
| /login, /grilla soft+hard nav, BookingFormModal (abrir/llenar/submit), click reserva existente, toggle densidad, autocomplete jugador (confirmado ausente), /settings sidebar, método de seña (confirmado ausente) | 11× T | — |
| /grilla day-pill nav, drag horizontal, visual check | F ×3 | solo inventariado por tiempo; tenant solo tiene 1 cancha (nada que scrollear); screenshot roto |
| /reservas Hoy/Próximas/Historial/filtros de estado, /reservas/[id] cancelada, confirmada+cobros | 6× T | — |
| buscador de texto, CompleteBookingDialog (abrir/completar), cobro parcial, marcar ausente, cancelar con/sin reembolso, confirmar pago, densidad, menú mobile | F ×10 | ningún `onClick` de React responde en la sesión (confirmado con control negativo: toggle de tema tampoco reacciona); `document.hidden=true`/`hasFocus=false` persistente |
| /abonados, /nuevo happy path, validaciones, conflicto, modal pausar | 5× T | — |
| /abonados mobile, visual real | F ×2 | tiempo insumido en diagnosticar tab cap; rAF nunca dispara en el tab (falso positivo de loading investigado y descartado) |
| /login, /caja, /dashboard control, /grilla mismo patrón | 4× T | — |
| /caja abrir caja, agregar movimiento, totales, cerrar caja | F ×4 | botones sin handler de React adjunto (`__reactFiber$` ausente) — bug crítico de hidratación, ver finding |
| /login, /dashboard, /caja raíz, /settings acceso directo | 4× T | — |
| /caja/cantina carga, vender ticket, abrir fiado, saldar fiado, category/method badges; /caja/productos carga | F ×6 | Suspense boundary nunca resuelve en cliente (skeleton stuck), servidor responde OK en <300ms por fetch directo |
| /caja/productos, bloqueo alta/edición manager (confirmado), /settings sidebar acceso manager | 3× T | — |
| reponer stock manager, salida stock manager | F ×2 | catálogo vacío + sesión admin pisada por logins concurrentes de otros agentes (cookie compartida) |
| /jugadores, /jugadores/[id]+bloquear, /jugadores/deudas vacío, /torneos listado, /torneos/nuevo acceso directo manager, equipos/horarios visibilidad, /fixture listado, Acta visibilidad, /posiciones, /inscripciones, portal público publicar | 10× T | — |
| ChargeDebtDialog cobrar deuda real, anotar equipo persistencia, guardar resultado partido | F ×4 | `document.hidden=true`/`hasFocus=false` + tab compartida con otro agente concurrente |

### Admin (38 puntos — 12 verificados, 26 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| /login, /settings/reservas, /settings/horarios | 3× T | — |
| Días cerrados, guardar+recargar (persistencia real), inspección visual | F ×3 | sesión cortada por error 500 en /login (reset concurrente de DB por otro agente) |
| /settings/canchas, crear cancha, editar (abrir+precarga), editar (guardar+foto) | 4× T | — |
| toggle Online/Offline | F | sesión irrecuperable tras >10 reintentos de login |
| /login, /settings/equipo | 2× T | — |
| editar nombre manager, guard único admin, visual screenshot | F ×3 | sesión invalidada en milisegundos por logins concurrentes de otros agentes con la misma cuenta |
| /login, /settings/facturación (sin suscripción), botón Conectar MercadoPago | 3× T | — |
| ActivatePlanSection, CancelSubscriptionSection, /onboarding fresh, reintentos de login, visual | F ×5 | cuenta QA estándar nunca tiene fila en `tenant_subscriptions` (gap de fixture); entorno se rompió (JWT con `staff_user_id` sin fila en `staff_users`) |
| /login, /settings/perfil, /select-tenant | F ×3 | tab cap (18 intentos en ~7 min, 9/9 ocupadas) |
| /torneos/nuevo (login previo, envío vacío, fechas cruzadas, nombre vacío) | F ×4 | tab cap |
| /login admin-fresh, /onboarding pasos 1-4, /onboarding/listo, /dashboard checklist post | F ×7 | tab cap (7 reintentos en ~60s, 9/9 ocupadas por otros agentes) |

### Super Admin (14 puntos — 3 verificados, 11 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| /login intento, /super-admin sin sesión, /super-admin/login | 3× T | guards de acceso funcionan correctamente |
| /forgot-password super-admin, sesión autenticada para el resto de la ola | F ×2 | sin cuenta de super-admin disponible; submit no disparó request (no concluyente) |
| /super-admin, /super-admin/tenants | F ×2 | tab cap |
| /super-admin/tenants/[id] (Datos, Suscripción, Staff, 4ta tab), impersonar, detener impersonación, reset password staff | F ×7 | tab cap (4 intentos, ~65s de espera, 9/9 ocupadas) |

### Tema / Responsive (38 puntos — 22 verificados, 16 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| /login | 1× T | — |
| /dashboard, AdminThemeMenu, /grilla, /caja, ×3 temas (light/dark/system) | F ×7 | login roto por desync `staff_user_id`/`staff_users` (reset de DB concurrente, no reproducible como bug de UI) |
| /precios y /para-complejos (dark+light forzado), /ingresar→magic link→/mis-reservas, /configuracion (sistema/claro/oscuro), /perfil (claro) | 9× T | — |
| /perfil oscuro, AdminThemeMenu rutas admin | F ×2 | redundante con otra verificación ya hecha; fuera del alcance pedido |
| /super-admin, selector de tema | F ×2 | tab cap, sin cuenta super-admin utilizable por login real |
| /dashboard, /grilla, /caja, /reservas @ 375×812 light | 4× T | — |
| /ingresar, /mis-reservas (2 tabs), /perfil (4 tabs), /configuracion @ mobile | 8× T | — |
| flujo reserva/cancelación mobile, verificación visual por captura | F ×2 | fuera de alcance pedido; screenshot roto |
| /, /explorar, /e2e-complejo-demo/reservar @ mobile | F ×3 | tab cap (7 intentos, >100s de espera) |

### Diff sin commitear (57 puntos — 21 verificados, 36 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| /login, /caja abrir caja, agregar movimiento, /caja/cantina (ticket, cobrar, anotar fiado), /caja cerrar caja, dashboard venta rápida, /caja/productos (agregar, reponer), mobile 375, contraste claro/oscuro | 12× T | — |
| /caja corregir fondo, movimiento combinaciones, cobrar/anular fiado, salida stock, restricción manager | F ×5 | tiempo insuficiente tras hallazgo crítico; bloqueado por bug de TabDialog (fiado nunca se crea) |
| alta de producto nuevo | 1× T | — |
| edición, reponer, salida/merma, tabla stock recalculado, validaciones, copy sin control, dark/mobile | F ×7 | tab se congeló tras hard-reload; /caja/productos nunca hidrató en tabs nuevas |
| /login, toolbar grilla, reserva telefónica, "Otro" auto-block, bloqueo interno, horario editable, navegación fechas, layout formatos, cobro único/dividido/pagado completo, visual light/dark | F ×12 | tab cap total (9/9, ~10 min de reintentos escalonados, conteo no varió) |
| /ingresar, BookingFormModal, RegisterMovementModal, ProductFormDialog, ChargeDebtDialog, DatePicker abonados, AdminThemeMenu/ThemeToggle | F ×7 | tab cap (>15 reintentos en ~15 min) |
| /torneos admin, /[slug]/torneos público, /analiticas, ChargeDebtDialog, /precios (Calculadora+PlanSelector), /explorar toolbar, AvailabilityGrid+modal, DashboardCanteenButton | 8× T | — |
| /torneos banner visual, /[slug]/torneos/[slug] detalle, /analiticas panel super-admin caso positivo, mobile pass dedicado | F ×5 | screenshot roto; sin torneos con datos completos; sin cuenta super-admin; tiempo consumido en las 12 rutas ya cubiertas |

### Re-verificación de hallazgos previos (19 puntos — 13 verificados, 6 no)

| Ruta | Tested | Motivo si no |
|---|---|---|
| `billing.service.ts cancel()` (B1) + test unitario, `expire-trials.worker.ts` (B2) + test integración | 4× T | — |
| /settings/facturacion repro visual en browser real | F | tab cap (2 intentos) |
| /login, /dashboard mobile, /grilla mobile, /settings/reservas, checkout con seña (2 tenants), /mock-mp/checkout, /caja | 8× T | — |
| /dashboard/grilla dark theme, banner push trigger nativo | F ×2 | tiempo insumido en bloqueadores de entorno; `Notification.permission` fijo en `denied` (inyección de markup real usada como sustituto) |
| / home admin (contraste) | 1× T | — |
| /login (reintentos), /caja contraste, cancelar reserva admin (guard de plazo) | F ×3 | sesión perdida a mitad de sesión (desync `staff_user_id`), sustituido por lectura de código marcada explícitamente como no verificada en vivo |

---

## (c) Hallazgos por módulo

### Público

**🔴 CRÍTICO — Portal público de Torneos rompe con error SQL (listado y detalle)** — *nuevo*
Rutas: `/[slug]/torneos`, `/[slug]/torneos/[torneoSlug]` (confirmado en `/e2e-complejo-demo/torneos`, 3 sesiones independientes: fixtures, público, diff).
Esperado: la página carga (vacía o con torneos publicados) para cualquier tenant con el flag `tournaments` activo.
Observado: `listPublicTournaments`/`findPublicTournament` (`src/modules/tournaments/tournament-public.service.ts:89` y `:160`) arman `tr.status = ANY(${PUBLIC_STATUSES}::tournament_status[])` interpolando un array JS plano en un `sql\`\`` de Drizzle; Drizzle lo serializa como tupla `($1,$2,$3)` en vez de array Postgres → `ERROR: cannot cast type record to tournament_status[]`. Reproducido de forma determinística (100% de las cargas, mismo código de referencia) y aislado con una consulta literal directa contra Postgres. Rompe el módulo entero (Fase 4, documentado como "hecha" en CLAUDE.md) para cualquier tenant, siempre — nadie sin sesión puede ver un torneo publicado. Cero tests unitarios/integración cubren estas funciones.
Fix sugerido (no aplicado): `sql.array(PUBLIC_STATUSES, 'tournament_status')` o el helper de array que use el resto del código con Drizzle+postgres-js.

**🟡 MEDIO — "Desde Desde $100" duplicado en home**
Ruta: `/` (sección "Los mejor valorados").
`src/lib/format.ts:35` `formatFromPrice()` ya devuelve "Desde $ 100" completo, y `src/components/site/FeaturedComplexCard.tsx:96-99` agrega un `<span>Desde </span>` literal antes. Afecta a cualquier complejo destacado con `fromPriceCents` seteado.

**🟡 MEDIO — Header/main duplicado y tema claro filtrado en 4 páginas del sitio de negocio**
Rutas: `/blog`, `/blog/[slug]`, `/vs/alquila-tu-cancha` (y por el mismo patrón, sin verificar en vivo, `/alternativas-alquila-tu-cancha`).
Esperado: un solo `<header>`/`<main>` (el que ya pone `src/app/(business)/layout.tsx`) con el fondo navy oscuro forzado (`#020617`) que usa el resto del sitio.
Observado: estas 4 páginas renderizan su PROPIO `<BusinessHeader/>` + `<main>` anidado dentro del layout compartido, con `bg-gray-50` propio → `document.querySelectorAll('main').length === 2` (anidado), 2 `<header fixed>` idénticos, fondo blanco/gris en vez de navy oscuro. Salto de identidad visual notorio al navegar Home/Precios (oscuro) → Blog (claro), y regresión de accesibilidad real (2 landmarks "banner", nav recorrida dos veces por lector de pantalla/teclado).

**🟢 BAJO — Calculadora "¿Cuánto te cuesta el que no viene?" sin validación en input custom** — *requiere input*
Ruta: `/precios`. El input "Otro" (`type="text" inputMode="numeric"`) sin validación real (`CalculadoraClavo.tsx:31-36,82-91`): tipear "abc" deja el texto "abc" en pantalla pero el resultado cae silenciosamente a "$0", pudiendo leerse como "no perdés nada".

### Auth

**🔴 CRÍTICO — Email de invitación de staff usa el template roto de Supabase (sin `token_hash`)** — *nuevo*
Ruta: flujo de invitación (`/settings/equipo` → Inbucket → link "Accept invitation").
Esperado: igual que confirmation/recovery/magic_link (ya migrados a `token_hash` + `/api/auth/callback`, ADR-002), el link de invitación debería loguear al invitado y llevarlo a fijar contraseña.
Observado: `supabase/config.toml` (líneas 170-173) tiene `[auth.email.template.invite]` **comentado** y no existe `supabase/templates/invite.html` — el email trae el link legacy de GoTrue (`/auth/v1/verify?...&type=invite&redirect_to=/dashboard`), que deja los tokens en el fragmento de URL (`#access_token=...`). `src/lib/supabase/client.ts` (el único cliente que podría leer ese hash) no lo importa **ningún archivo del repo** (dead code). Con cookies limpias, el invitado llega a `/dashboard` sin sesión → redirige a `/login` sin haber fijado contraseña nunca y sin ningún mensaje. La única vía de activación que funcionó en la práctica fue "¿Olvidaste tu contraseña?" (no mencionada en el email).

**🟡 MEDIO — reset-password: reusar la misma contraseña actual da un error genérico engañoso**
Ruta: `/reset-password`. Al poner la contraseña actual como "nueva" (Supabase Auth la rechaza por duplicada), la app muestra "No pudimos actualizar la contraseña. Probá de nuevo." — invita a reintentar con un dato que siempre va a fallar igual. `src/app/(auth)/reset-password/actions.ts:48-50` mapea cualquier error de `updateUser` al mismo mensaje genérico.

**🟡 MEDIO — CTA de error en /verify lleva al login de staff, no al de jugador**
Ruta: `/verify?error=expired|used|invalid|exchange_failed`. El botón "Volver a intentar" está hardcodeado a `href='/login'` (`src/app/(auth)/verify/page.tsx:158-160`) sin distinguir tipo de usuario — un jugador cae en un formulario de email+contraseña que no tiene, y sin ningún link de vuelta a `/ingresar`. Solo sale por el logo → home → link "Ingresar" del header (2 pasos extra).

**🟡 MEDIO — Email de bienvenida dice "gestionar tu complejo" incluso a jugadores nuevos** — *requiere input*
`supabase/templates/confirmation.html:14-15` se usa para CUALQUIER alta nueva (staff y jugador) — el callback recién diferencia después por `user_metadata.is_player`. El link funciona, pero el copy confunde a un jugador nuevo.

**🟡 MEDIO — Contraste insuficiente en CTAs primarios de auth de jugador (conocido, confirmado de nuevo)**
Botón "Enviarme el enlace" (`/ingresar`) y CTAs de éxito de `/verify`: texto blanco sobre `bg-primary` (rgb(16,183,127)) mide **2.59:1**, muy por debajo de 4.5:1 AA. Coincide con el gotcha ya documentado (`tailwind4-oklch-rompe-aa`), confirmado específicamente en pantallas de auth de jugador.

**🟡 MEDIO — Sesión de staff y jugador comparten el mismo nombre de cookie**
`createClient()` en `src/lib/supabase/server.ts:15` y `client.ts:3` no configuran `cookieOptions`/nombre distinto por realm — ambos usan `sb-127-auth-token`. Reproducido de forma determinística: con sesión de staff Y de jugador activas a la vez, `/api/player/session` devuelve `{"session":null}` hasta borrar la cookie de staff. Bloqueó varias veces el flujo de reserva/cancelación de jugador durante el barrido.

**🟢 BAJO — `/verify?error=used` no se reproduce con reuso real de token**
Reusar el mismo `token_hash` una segunda vez cae en `error=exchange_failed` en vez de `error=used` — la copy específica "ya fue utilizado" solo se vio simulándola por query param.

### Jugador

**🔴 CRÍTICO — Cancelación de reserva con seña pagada rota (500, RefundAmountExceedsOriginalError)** — *recurrente, ya documentado como "Mock MP escribe payments.amount=1", nueva consecuencia funcional grave*
Ruta: `/mis-reservas`. Al confirmar "Sí, cancelar" sobre un booking con seña de $50 pagada vía MercadoPago mock, el server action responde 500: `RefundAmountExceedsOriginalError: Refund amount 5000 exceeds available amount 1`. Causa: `src/modules/payments/mock-mp.ts:90` (`LocalMockGateway.getPaymentStatus()`) devuelve `amount: 1` fijo (comentario propio: "mock artifact"), que se escribe literal en `payments.amount`. La UI muestra un toast genérico de "problema de conexión" que oculta la causa real. **En este entorno (MP_MOCK_MODE=1) es imposible para un jugador cancelar cualquier reserva con seña pagada** — no es solo contaminación de caja, bloquea el flujo end-to-end. El gate `MP_MOCK_ENABLED` exige `isNonProductionRuntime`, así que producción no se ve afectada.

**🟡 MEDIO — Estado "Cancelado (con reembolso)" engañoso cuando no había seña**
Ruta: `/mis-reservas`. Al cancelar una reserva SIN seña (pago en efectivo, el propio diálogo decía "No hay seña que devolver."), el badge posterior dice "Cancelado (con reembolso)" — el jugador puede pensar que le van a devolver plata que nunca pagó online. Probable causa: booking quedó con `status='canceled_refunded'` en vez de `canceled_no_refund`, o el mapeo de la etiqueta no distingue bookings sin depósito.

**🟢 BAJO — Falta `?next=` en el redirect a `/ingresar`**
Los guards de `(player)` (`layout.tsx:10`, `perfil/page.tsx`, `mis-reservas/page.tsx`, `configuracion/page.tsx`, `eliminar-cuenta/page.tsx`) redirigen a `/ingresar` sin `?next=<ruta original>`. `IngresarForm.tsx:64` usa `next ?? '/mis-reservas'`, así que un jugador que entró queriendo ir a `/perfil` siempre cae en `/mis-reservas` tras loguearse.

**🟢 BAJO — IDs de DOM duplicados por Suspense sin limpiar (`<div hidden id="S:0">`)**
Rutas: `/perfil` (las 4 tabs), `/configuracion`. En navegaciones frescas queda colgado un `<div hidden id="S:0">` con una copia completa del contenido (ids `first_name`/`last_name`/`phone`/`preferred_area` duplicados). HTML inválido, podría fallar una regla `duplicate-id` de axe. No reproducido en `/mis-reservas` bajo las mismas condiciones — posible relación con la carga concurrente extrema del entorno compartido, sin poder aislarlo con certeza.

**🟢 BAJO — Posible desfasaje UTC vs. ART en "Cliente desde" de la ficha de jugador (confianza baja)**
`src/app/(admin)/jugadores/[playerId]/JugadorProfileView.tsx:106`: con hora ART aún en 28/jul, la ficha mostró "29 de jul de 2026". Podría ser que `formatDate` no convierte a ART, o simplemente un dato de seed ya presente — no confirmado, reportado con confianza baja.

### Manager

**🟡 MEDIO — El manager ve "Configuración" en el sidebar sin ningún filtro por rol** — *recurrente en 4+ olas independientes (fixtures, manager×4)*
CLAUDE.md: "El manager NO accede a Configuración ni a gestión de Equipo". `src/components/layout/admin-sidebar.tsx` (`NAV_ITEMS`, líneas ~38-48) es un array estático con un único filtro (`requiresTournaments`) — ningún filtro por rol. El guard server-side (`requireAdminStaff`, `src/modules/staff/guards.ts:116-134`) SÍ funciona (redirect silencioso a `/dashboard`, sin fuga de datos), pero el manager ve y puede clickear un ítem que lo devuelve a Inicio sin ninguna explicación — ni oculto ni bloqueado con mensaje claro, como pedía la spec original.

**🟡 MEDIO — Onboarding checklist ofrece al manager 3 de 7 pasos que no puede completar**
Ruta: `/dashboard`. `src/components/dashboard/onboarding-checklist.tsx` (ITEMS, líneas 20-28) linkea a `/settings/canchas`, `/settings/horarios`, `/settings/facturacion` — los tres bajo el guard admin-only. Para el manager son dead ends silenciosos.

**🟡 MEDIO — `/reservas`: el header muestra el total sin filtrar cuando se aplica un filtro de status** — *CONFIRMED por lectura de código, sin ambigüedad de entorno*
`src/app/(admin)/reservas/page.tsx:133` hace `const total = countFor(counts, '')`, que suma TODOS los status sin importar el filtro activo. Con `?status=completed` (0 resultados reales) el header dice "4 reservas" con el EmptyState de "Sin reservas" debajo. Reproducido igual con `?dia=historial&status=completed` y `&status=no_show`. Fix sugerido: `status ? rows.length : countFor(counts,'')`.

**🟡 MEDIO — "Nuevo torneo" visible para manager en `/torneos` sin gate visual**
El botón se renderiza siempre (`src/app/(admin)/torneos/page.tsx:42-50`, guard de página solo chequea `user.type !== 'staff'`, nunca el rol). Navegar a `/torneos/nuevo` SÍ rebota correctamente (`role !== 'admin'` en `nuevo/page.tsx:27` + `requireAdminStaffAction`) — no es un agujero de seguridad, es un botón que solo rebota sin explicación.

**🟡 MEDIO — `/abonados/nuevo`: pluralización rota, "Luness"/"Miércoless"**
`AbonadoForm.tsx:591` concatena una `s` fija al nombre del día (`{selectedDayLabel}s`). Afecta a Lunes/Martes/Miércoles/Jueves/Viernes (ya terminan en "s" en español, invariables en plural); Sábado/Domingo quedan bien por casualidad.

**🔴 CRÍTICO — `/caja`: los botones no responden, sin handler de React adjunto** — *nuevo*
Ruta: `/caja`. El contenido real llega completo (heading, tarjeta de apertura, "Sin movimientos por ahora") pero queda como HTML estático: el nodo del botón "Abrir caja" no tiene `__reactFiber$`/`__reactProps$` (a diferencia de "Cerrar sesión"/"Cambiar tema" del layout persistente, que sí los tienen). El fallback de `loading.tsx` (6 skeletons) queda mostrado para siempre en paralelo, colgado dentro de `<main>`. Clickear "Abrir caja" (nativo Y dispatch completo de eventos) no abre ningún diálogo. Reproducido idéntico en 3 tabs independientes, con hard-reload, y en `/grilla` (mismo patrón, 48 skeletons). `/dashboard` (sin `loading.tsx`) hidrata perfecto en las mismas condiciones. Nota de contexto: varios de los archivos involucrados (`OpenDayCard.tsx`, `RegisterMovementModal.tsx`, `dialog.tsx`, `caja-lib.ts`) están modificados sin commitear — no se puede descartar que sea un efecto colateral de edición concurrente sobre el dev server en vez de una regresión estable. **Recomendación: reproducir con un restart limpio de `pnpm dev` (borrando `.next`) antes de escalar como regresión confirmada.**

**🔴 CRÍTICO — `/caja/cantina` y `/caja/productos` cuelgan en el skeleton de carga indefinidamente** — *nuevo, posiblemente misma clase que el anterior pero reportado con matiz distinto*
Con `/caja` YA hidratado y funcionando en la misma tab, un click de cliente a "Cantina" o "Productos" navega la URL pero el contenido nunca sale del fallback de `loading.tsx` (probado hasta 34s+ continuos, 3 tabs distintas). Un `fetch()` directo autenticado a `/caja/cantina` devuelve HTML completo y correcto del servidor en ~287ms — descarta problema de datos/backend/permisos. Efecto práctico: un manager que entra a Cantina se queda mirando un esqueleto para siempre — no puede vender tickets ni gestionar fiados. Igual que el finding anterior, no se puede descartar con certeza que sea contención del entorno compartido (HMR bajo carga de ~54 agentes concurrentes) vs. un bug real — **recomendado re-verificar en entorno aislado antes de tratarlo como confirmado**.

**🟢 BAJO — `/abonados`: horario mostrado con segundos crudos**
`AbonadosList.tsx:324,408` renderiza `a.timeStart`/`a.timeEnd` sin recortar segundos: "Mié 19:00:00–20:00:00" en vez de "Mié 19:00–20:00".

**🟢 BAJO — Torneos: banner "Próximamente" se muestra siempre, incluso con torneos activos** — *dedup con el mismo finding de Admin/Fixtures*
Ver detalle en sección Admin/Fixtures — confirmado también en la vista de manager.

**🟢 BAJO — Checklist "Descartar" es tenant-wide y accesible al manager** — *requiere input*
`markChecklistDismissedAction` (`dashboard/actions.ts:79-103`) usa `requireOperatorStaff` (admin+manager) y persiste `checklist_dismissed_at` en `tenants.settings` — a nivel tenant, no por-usuario. El manager puede ocultar permanentemente para todo el complejo una checklist de la que no puede completar 3 de 7 pasos.

**🟢 BAJO — BookingFormModal (reserva manual) sin buscador de jugador ni método de seña** — *requiere input*
El modal abierto desde un slot libre de la grilla solo soporta guest/walk-in: sin autocomplete de Player registrado, sin selector de método de seña. Puede ser diseño deliberado (walk-in guest-only, depósito solo en reserva online del jugador) — se marca como decisión de producto a confirmar.

### Admin

**🔴 CRÍTICO — BookingFormModal no tiene ningún campo de precio — imposible dar cortesía $0 a un cliente nombrado** — *nuevo* — *requiere input*
Ruta: `/grilla`, `/dashboard` (Reserva rápida). El backend SÍ soporta `priceOverride: z.number().int().nonnegative().optional()` (`booking.schema.ts:26`) pero un grep de `priceOverride` en todo `src/` da 0 resultados fuera de los 3 archivos de módulo — código muerto, nunca cableado a la UI. La única forma de llegar a $0 es un motivo "interno" (Mantenimiento/Escuelita/Profesores), que crea `type:'block'` sin nombre de cliente real, tratado como bloqueo administrativo. Verificado end-to-end que cuando el sistema SÍ maneja $0 (bloqueos internos, `bookings` de torneo) lo hace correctamente sin generar `CashFlow`. El gap es puntual: un admin no puede regalar la cancha a un cliente conocido manteniendo su nombre en el sistema.

**🟡 MEDIO — `booking_advance_days` solo editable desde Super Admin, no autoservicio** — *requiere input*
Ruta: `/settings/reservas`. El formulario "Políticas de Reserva" solo expone seña, reservas online y anticipación PARA CANCELAR — nunca la anticipación de reserva a futuro (`settings.booking_advance_days`, default 6 días). Solo editable desde `src/app/(super-admin)/super-admin/tenants/[id]/_components/support-actions/SettingsSection.tsx:81-83`.

**🟡 MEDIO — `depositPercentage` se precarga en 0 (inválido) al activar seña por primera vez, y el guardado de "Sin seña" falla en silencio** — *une dos síntomas de la misma causa raíz, confirmados por dos agentes distintos*
Ruta: `/settings/reservas`. Con un tenant en "Sin seña" (`deposit_percentage=0` guardado), al togglear "Requerir seña" el input `min=10 max=100` se precarga con "0" sin ningún estilo de error visible (`form.checkValidity()===false` confirmado por JS, pero sin feedback visual). Causa: `ReservasPolicyForm.tsx:42-50`, `customPercentage` se inicializa con `String(initialDeposit)` sin clamping cuando no es uno de los presets [30,50,100]. Síntoma relacionado confirmado en la re-verificación de hallazgos previos: togglear a "Sin seña" y Guardar hace desaparecer el input hidden `depositPercentage` del DOM, y el POST devuelve `{"success":false,"error":"Too small: expected number to be >=10"}` — el cambio NO se guarda, sin ningún mensaje visible al usuario. Un admin que activa la seña por primera vez, o que la desactiva después, se queda pegado.

**🟡 MEDIO — `/settings/canchas`: "Tenant no encontrado" al guardar cambios o subir foto (confianza media)**
Editar una cancha existente y clickear "Guardar cambios" (con o sin foto) devuelve `getStaffTenant(user.staffUserId)` → null (`guards.ts:73`), pese a un JWT válido con `tenant_id`/`staff_user_id` correctos, y pese a que la MISMA guard había dejado pasar la creación de cancha minutos antes en la misma sesión. Reportado con confianza media por evidencia fuerte de contención del entorno compartido en simultáneo (contador de canchas fluctuando solo, logouts espontáneos con JWT no vencido) — recomendado re-verificar en sesión aislada.

**🟡 MEDIO — `/settings/facturacion`: la cuenta QA estándar nunca puede probar upgrade/downgrade/cancelación** — *requiere input, gap de datos de prueba*
`scripts/seed-e2e.ts` solo hace `DELETE FROM tenant_subscriptions` para el tenant demo, nunca `INSERT` — `getSubscriptionState()` tira `SubscriptionNotFoundError`, y tanto `ActivatePlanSection` como `CancelSubscriptionSection` requieren `sub` truthy para montarse. Ninguna cuenta seedeada permite ejercitar el flujo completo de Facturación.

**🟡 MEDIO — Login con JWT de `staff_user_id` ya inexistente muestra error genérico en vez de invalidar sesión** — *requiere input*
Cuando el `app_metadata.staff_user_id` del JWT no tiene fila en `staff_users` (típicamente tras un reset de DB sin reseed completo), `provisionAndRouteStaff` (`auth.service.ts:257`) tira sin catch → pantalla "Algo salió mal" genérica en vez de, por ejemplo, invalidar la sesión y mandar a `/login` con "tu sesión expiró". Se reprodujo repetidamente (>10 agentes distintos lo vieron) por resets concurrentes de la DB local compartida — no es un flujo que un usuario real dispare en operación normal, pero vale la pena decidir el manejo de ese caso puntual.

**🟡 MEDIO — Cancelación admin sin guard de plazo horario — PARCIALMENTE resuelto/matizado** — *matizado, ya documentado*
El detalle de reserva (`BookingActions.tsx:196-221`, tag "ENS-2") SÍ calcula `inPolicy` con `cancellationPolicyHours`/`startsAt` reales y muestra un preview concreto ("Corresponde devolver la seña de $X" / "quedó fuera de la ventana") — prácticamente paridad con el jugador. Pero la cancelación rápida desde la lista/grilla (`QuickActions.tsx:227-244`) NO recibe `startsAt` ni la política como prop — el propio comentario del código dice "en la grilla no calculamos el plazo… el server resuelve la retención" — y muestra solo un mensaje genérico sin indicarle al admin si ESA reserva puntual está dentro o fuera de ventana. La asimetría original persiste solo en el camino de cancelación rápida, no en el detalle.

**🟢 BAJO — Pluralización "reserva(s) futura(s)" sin resolver en el diálogo de desactivación**
Ruta: `/settings/canchas`. El diálogo de "Desactivar cancha" muestra siempre el literal "N reserva(s) futura(s)" sin resolver singular/plural.

**🟢 BAJO — `ActivatePlanSection.tsx` con paleta oscura hardcodeada, sin variantes `dark:`** — *requiere input, no verificado visualmente*
A diferencia del resto de `/settings/facturacion` (theme-aware), este archivo (sin commitear) usa clases y gradientes navy hardcodeados sin condicional de tema — se vería como una tarjeta oscura incrustada en una página clara con tema claro activado. Coincide con la deuda ya conocida "Fase E hardcoded dark diferida".

**🟢 BAJO — Contraste emerald-600/700 en el home admin — MATIZADO, la mayoría PASA AA** — *matizado, refuta parcialmente la generalización previa*
Medición real (fórmula WCAG, luminancia relativa) sobre elementos reales del home admin: botones "Reserva rápida"/"Venta rápida" (5.48:1, pasa), links "Configurar"/"Ver grilla →" (5.48:1, pasa), logo "Gol" 24px (4.32:1, pasa por ser texto grande), íconos con ring (3.77:1, pasa como gráfico no-texto). Único caso dudoso: el link activo del nav sobre el tint gris del sidebar (4.32:1), sin confirmar tamaño de fuente exacto antes de perder la sesión. La afirmación genérica "emerald-600/700 cae bajo AA" no se sostiene tal cual en esta pantalla — sigue siendo deuda conocida en otros contextos (ver auth), pero no una regla universal.

**🟡 MEDIO — Horario post-medianoche sin indicador visual "día siguiente" por fila** — *requiere input, observación no confirmada como bug*
Ruta: `/settings/horarios`. Con "Cierra después de medianoche" activado, una fila con cierre "01:00" no muestra ningún badge/tooltip local de que cruza medianoche — solo se infiere recordando el checkbox global. Posible decisión de diseño deliberada (flag único, no por-día) a confirmar con producto.

### Super Admin

Sin hallazgos — el módulo completo quedó sin verificar por falta de cuenta `system_admins` disponible en el entorno (ver Fuera de alcance). Los guards de acceso SÍ se verificaron y funcionan: `/super-admin` sin sesión redirige correctamente a `/login`.

### Tema / Responsive

**🔴 CRÍTICO — Banner de notificaciones push tapa botones "Reservar turno" en la grilla mobile** — *recurrente, ya documentado, confirmado de nuevo en 2 sesiones independientes de esta ola*
Ruta: `/grilla` @ 375×812. El banner fijo (`PushNotificationManager.tsx`, `fixed bottom-[...] inset-x-4 z-40`) ocupa una franja de ~130px de alto en la parte inferior del viewport que tapa 4 de 9 botones "Reservar turno HH:00" visibles sin scroll (2 casi totalmente tapados). Justo debajo del tooltip de onboarding que dice explícitamente "Tocá cualquier horario libre para cargar tu primera reserva". Verificado por dos vías independientes: medición de `getBoundingClientRect()` con el markup real inyectado (permiso de notificación `denied` en el entorno automatizado impide el trigger orgánico), y confirmado con `document.elementFromPoint()` — un tap en la zona tapada activa el banner en vez de reservar el turno.

**🟡 MEDIO — Mismo banner tapa el CTA "Cargar una reserva" del estado vacío en `/reservas` mobile**
Extensión del mismo componente: la franja superior del único CTA del estado vacío (11 de 36px de alto) cae bajo el banner.

**🟢 BAJO — Tap target "Ver grilla →" de "Próximos turnos" mide ~20px de alto**
Ruta: `/dashboard` @ 375×812, por debajo de los ~44px recomendados para tap cómodo.

### Diff sin commitear

**🔴 CRÍTICO — TabDialog "Anotar fiado" no hace nada — causa raíz confirmada con precisión en código** — *nuevo, alta confianza, no ambiguo por entorno*
Ruta: `/caja/cantina`. El botón "Anotar fiado — $X" no dispara ninguna llamada de red (instrumentado `window.fetch`, 0 invocaciones), sin toast ni error, reproducido 2 veces. Causa raíz exacta: `TabDialog.tsx` inicializa `tabIdempotencyKey` (useState `null`) SOLO dentro de `handleOpenChange(true)` (líneas 36-45) — el callback `onOpenChange` de Radix, que dispara únicamente ante triggers INTERNOS del diálogo (Escape, overlay, botón cerrar). El botón que abre el diálogo, en `TicketPanel.tsx:395`, hace `onClick={() => setTabDialogOpen(true)}` — cambia la prop `open` directamente desde afuera, sin pasar por ese callback. `tabIdempotencyKey` queda `null` para siempre y `submitTab()` hace `if (!tabIdempotencyKey) return` — return silencioso. Los diálogos hermanos (`SettleTabDialog`/`CancelTabDialog` en `FiadosList.tsx`) usan correctamente un patrón de sincronización en tiempo de render, no dependiente de `onOpenChange` — TabDialog es el único componente nuevo con el patrón roto. Impacto: "Anotar como fiado" 100% inoperable; en consecuencia, Cobrar/Anular fiado tampoco se puede ejercitar nunca porque jamás existirá un fiado que cobrar.

**🟡 MEDIO — Dashboard "Venta rápida" no avisa de caja cerrada antes de armar el ticket completo**
A diferencia de `/caja/cantina` (banner inmediato + botón deshabilitado cuando la caja está cerrada), `DashboardCanteenButton.tsx` no le pasa `saleDisabled` a `TicketPanel` (queda en `false` por defecto). El staff arma el ticket entero antes de que el servidor lo rechace ("La caja de ese día ya fue cerrada") — la defensa en profundidad funciona (sin pérdida de datos/plata), pero la UX es peor que en el flujo hermano.

**🟡 MEDIO — BookingFormModal no usa el primitivo `dialogContentClass` compartido (riesgo de bug de teclado en iOS)** — *code-only, no verificado visualmente*
`BookingFormModal.tsx:242` monta `Dialog.Content` de Radix directo, siempre centrado (`fixed left-1/2 top-1/2`), sin el anclaje mobile (`top-4 translate-y-0`) que `dialog.tsx:28-44` documenta explícitamente como fix del bug de iOS donde el teclado tapa la mitad inferior del modal (incluido el submit). Es el único modal grande de la app que no migró a ese primitivo.

**🟢 BAJO — `ManualBanDialog` hardcodea `bg-white`/`zinc-900`, rompe el look glass translúcido** — *code-only, no verificado visualmente*
Ruta: `/deudas` (Sancionar Jugador). Pisa el className con `bg-white p-6 shadow-xl dark:bg-zinc-900` en vez de heredar `dialogContentClass`, y usa `zinc-900`/`zinc-50`/`zinc-400` hardcoded en vez de tokens de tema.

### Fixtures / estados difíciles

**🔴 CRÍTICO — Booking expirado (pending_payment→expired) no libera el turno en el portal público** — *nuevo*
Rutas: `/[slug]/disponibilidad`, `/[slug]`, `/api/public/availability`, `/[slug]/reservar`. Confirmado en DB que un booking sí pasa a `status='expired'` correctamente vía el worker `expire-pending-booking` (pg-boss, 6 min). Pero el turno queda "Ocupado" PERMANENTEMENTE en el portal: `/api/public/availability` (no-store) sigue devolviendo `"status":"occupied"` para esa hora mientras todas las demás son `"free"`; la grilla semanal muestra "Ocupado" sin link de reserva; y navegar directo a `/reservar` con esos query params devuelve "Ese turno ya no está disponible." Causa: `getPublicAvailabilityImpl`/`getPublicWeeklyAvailability` (`public.service.ts:~398,~486`) excluyen de "ocupado" solo `canceled_refunded`/`canceled_no_refund`, nunca `expired` — mientras que el chequeo de escritura real (`booking.overlap.ts`, que espeja el exclusion constraint de DB) sí trata `expired` como libre. `expired` es además estado terminal sin transiciones salientes en la FSM, así que nada dentro del flujo normal puede "reparar" la reserva. **Cualquier complejo con seña activada pierde ese turno para reserva online de forma permanente la primera vez que un jugador abandona el pago.**

**🔴 CRÍTICO — Un torneo publicado nunca sale de "Borrador" — falta la acción "abrir inscripción"** — *nuevo* — *requiere input*
Ruta: `/torneos/[id]` (panel Portal público). Clickear "Publicar" sí persiste `isPublic:true` (confirmado 200 OK), pero aparece: "El torneo está marcado como público pero sigue en borrador: no se publica hasta que abras la inscripción." No existe ningún botón/link "Abrir inscripción"/"Iniciar torneo" en toda la UI de admin (grep exhaustivo de `status` en `src/app/(admin)/torneos` y `src/modules/tournaments`: solo se fija `'draft'` en la creación, ningún otro caller lo cambia, pese a que `updateTournamentSchema` sí acepta el campo). Un torneo creado hoy queda permanentemente en Borrador y nunca pasa el filtro `PUBLIC_STATUSES` del portal público.

**🔴 CRÍTICO — Acta de partido: imposible cargar tarjetas amarillas/rojas — falta UI de plantel** — *nuevo*
Ruta: `/torneos/[id]/partidos/[matchId]`. Cargar una tarjeta amarilla con equipo+tipo elegidos pero sin Jugador (el dropdown siempre está vacío: "Ese equipo no tiene plantel cargado") es rechazado: "Elegí al jugador que vio la tarjeta." (`tournament.schema.ts:298` exige `teamPlayerId` no-nulo). `addTeamPlayerAction` (`torneos/actions.ts:466`) existe pero **cero componentes la llaman** en todo `src/` — el alta de equipo (`TeamsPanel.tsx`) solo pide nombre/capitán-texto/teléfono, nunca crea filas en `tournament_team_players`. Consecuencia: ningún torneo creado por la UI actual puede cargar una sola tarjeta, lo que además vacía la tabla de goleadores (agrupa por `teamPlayerId`) y el módulo de disciplina/suspendidos (`computeSuspensions` filtra explícitamente eventos con `teamPlayerId===null`).

**🟢 BAJO — Torneos: capitán de equipo sin autocomplete de Player pese a que el backend lo soporta** — *requiere input*
Ruta: `/torneos/[id]` (Anotar equipo). CLAUDE.md documenta "planteles híbridos: capitán vinculable" — el campo `contactPlayerId` existe en schema/servicio (`createTeamSchema`, `addTeam`) pero el input de "Capitán" es texto libre puro, sin ningún punto de entrada en la UI.

**🟢 BAJO — Torneos: banner "Próximamente" se muestra siempre, sin condicional** — *dedup, confirmado en 3 olas (fixtures, manager)*
Ruta: `/torneos` (admin). `src/app/(admin)/torneos/page.tsx:53-72`, fuera del `if (total===0)` — se muestra incluso con 1 torneo activo, 4 equipos y fixture con partidos jugados, autocontradiciendo el propio mensaje ("vas a poder" sobre algo que ya está pasando).

**🟡 MEDIO — Dashboard: "Turnos de hoy: N de 0" con la única cancha offline**
Ruta: `/dashboard`. Con la única cancha del tenant en Offline y 3-4 reservas confirmadas futuras, la tarjeta muestra literalmente "4 de 0" / "0% de ocupación · 1 bloqueados" — el denominador (canchas online × 15) se vuelve 0 mientras el numerador sigue contando las reservas existentes.

**🟡 MEDIO — "Próximos turnos" vacío mientras "Turnos de hoy" sigue contando, con la misma cancha offline**
Mismo escenario: "Próximos turnos" filtra (aparentemente) por cancha online y pierde silenciosamente todas las reservas de una cancha desactivada, justo cuando el admin más necesita gestionarlas (la propia advertencia de desactivación dice "gestionalas antes").

**🟡 MEDIO — Reserva rápida permite crear una reserva en una cancha marcada Offline, sin ningún aviso** — *requiere input*
El copy de desactivación dice sin matices "Una cancha offline no recibe reservas nuevas." Pero el modal de "Nueva reserva" no muestra ningún indicador de cancha offline ni deshabilita "Confirmar" — se probó con una cancha desactivada y el booking count subió de 3 a 4 sin error. Puede ser intencional (permitir reservas de mantenimiento manuales) — decisión de producto a confirmar.

---

## (d) REQUIERE INPUT — decisiones de producto, no bugs de código

1. **¿Debe existir un camino de UI para vincular un jugador registrado a una reserva creada por el admin?** Hoy es estructuralmente imposible (BookingFormModal solo tiene Nombre/Teléfono texto libre) — el softban por reincidencia (2da ausencia/90 días) nunca puede dispararse desde una reserva manual, solo desde reserva online del jugador. (fixtures)
2. **¿Un admin debe poder crear una reserva manual en una cancha Offline** (para mantenimiento, por ejemplo), o debe bloquearse activamente pese a que el copy de desactivación dice sin matices que "no recibe reservas nuevas"? (fixtures)
3. **¿Cuál es el flujo esperado para pasar un torneo de Borrador a publicable?** Publicar (`isPublic:true`) no alcanza — falta una acción explícita de "abrir inscripción" que hoy no existe en ningún lugar de la UI. (fixtures)
4. **¿Se implementa el buscador/autocomplete de Player para el capitán de equipo** en Torneos? El campo `contactPlayerId` ya existe en schema/servicio, solo falta el punto de entrada en la UI. (fixtures)
5. **¿Se agrega `priceOverride` a la UI de reserva manual** para permitir cortesía $0 a un cliente nombrado, distinto del camino actual de "bloqueo interno" (sin nombre real)? El campo ya existe en el backend, código muerto sin cablear. (fixtures)
6. **¿Es intencional que el botón "Descartar" de la checklist de onboarding sea tenant-wide y accesible al manager**, que no puede completar 3 de los 7 pasos por estar bajo `/settings`? (manager)
7. **¿El modal de reserva manual (BookingFormModal) debería tener buscador de jugador registrado y selector de método de seña**, o es diseño deliberado que sea walk-in guest-only? (manager)
8. **¿`booking_advance_days` debe exponerse en el autoservicio de `/settings/reservas`**, o queda como configuración exclusiva de Super Admin? (admin)
9. **¿Se agrega un indicador visual "día siguiente" por fila** cuando un horario post-medianoche está configurado en `/settings/horarios`, o el flag único (sin distinción por día) es la decisión de diseño final? (admin)
10. **¿Se agrega un tenant/cuenta de fixture con suscripción `trialing`+plan real** para poder testear upgrade/downgrade/cancelación de Facturación? La cuenta QA estándar nunca tiene fila en `tenant_subscriptions`. (admin)
11. **Ante un JWT con `staff_user_id` que ya no existe en `staff_users`, ¿debería invalidarse la sesión con un mensaje claro** ("volvé a iniciar sesión") en vez de la pantalla de error genérica actual? (admin)
12. **¿Se prioriza el fix de `ActivatePlanSection.tsx` (paleta oscura hardcodeada sin variantes claras)**, o queda como parte de la deuda ya aceptada de "Fase E hardcoded dark diferida"? (admin)
13. **¿Alcanza con que el input "Otro" de la calculadora de `/precios` caiga a $0 silencioso ante texto no numérico**, o se agrega validación/feedback? (público)
14. **¿Se bifurca el copy del email de bienvenida por tipo de usuario** (hoy dice "gestionar tu complejo" incluso a jugadores nuevos)? (auth)

---

## (e) Fuera de alcance

- **Módulo Super Admin completo** (`/super-admin/*`, dunning cycle, impersonación, gestión de tenants/staff): sin cuenta `system_admins` disponible en este entorno — requiere que el dueño del proyecto corra `pnpm seed:system-admin` manualmente antes de que un QA pueda entrar. No hay ningún email/cuenta de super-admin descubrible desde la UI de forma legítima (Inbucket sin historial, sin credenciales adivinadas por regla explícita). Los guards de acceso SÍ se verificaron y funcionan correctamente.
- **Onboarding wizard completo** (`/onboarding`, 4 pasos + `/onboarding/listo`): bloqueado en el 100% de los intentos por tope de tabs del browser compartido (9/9 ocupadas por otros agentes en paralelo).
- **`/settings/perfil`, `/select-tenant`**: mismo bloqueo de tabs, sin ningún intento exitoso.
- **`/torneos/nuevo` (validaciones de formulario: envío vacío, fechas cruzadas, nombre vacío)**: mismo bloqueo de tabs.
- **Buena parte de las mutaciones de escritura en `/reservas`** (completar turno, cancelar con/sin reembolso, marcar ausente, cobro parcial, confirmar pago): bloqueadas por una combinación de tab compartida con otros agentes y `onClick` de React que no respondía en la sesión (confirmado con control negativo — ni siquiera el toggle de tema reaccionaba).
- **Pagos reales con MercadoPago (no mock)**: fuera de alcance de un barrido de QA sobre browser automatizado en local — el modo mock ya reveló el bug de `amount=1` que contamina el flujo (ver hallazgos). Verificación de MP real queda para el proceso de staging/producción existente.
- **Dispositivos iOS físicos**: cubierto por `docs/qa/CHECKLIST_IPHONE_MOBILE.md`, no repetido en este barrido (que usó viewports emulados de 375×812).
- **Ensayo end-to-end completo de flujos de negocio** (happy paths largos, multi-paso): cubierto por `docs/qa/ENSAYO_GENERAL.md` y `docs/qa/HAPPY_PATHS_RUN_2026-07-16.md`; este barrido se enfocó en cobertura de superficie (rutas × roles × estados), no en flujos largos completos.
- **Verificación visual real por captura de pantalla** (píxeles, contraste real, solapamientos visuales, glitches de renderizado): `computer{action:"screenshot"}` falló en el 100% de las ~54 sesiones ("the Browser pane is not displayed, so the page is not compositing frames"). Toda la verificación de este barrido es DOM/accesibilidad/estilos-computados vía JS — válida para estructura, texto, colores calculados y geometría, pero **ningún hallazgo de este documento debe tratarse como confirmación visual pixel-perfect** sin una pasada adicional con captura real.
- **MFA TOTP de Super Admin**: no enforced todavía en los guards (columnas en schema, per CLAUDE.md) — no aplica verificar un flujo que no existe.

### Nota sobre confiabilidad del entorno de testing (transversal, no producto)

El pool de tabs del Browser pane (~9 tabs) fue compartido entre las ~54 sesiones de esta ola, generando: sesiones de staff/jugador pisadas por logins concurrentes con la misma cuenta; URLs cambiando solas entre llamadas por navegación de otro agente en la misma tab reusada; datos de prueba (reservas, estado de canchas) mutando fuera del control del agente que los estaba verificando; y al menos 2 incidentes de reset de DB local sin reseed completo a mitad de sesión (`staff_user_id` del JWT sin fila correspondiente en `staff_users`), que tumbó el login en múltiples agentes de forma simultánea. Ningún agente reportó esto como bug de producto — se documenta acá porque explica la mayoría de los gaps `tested:false` de la tabla de cobertura y porque, si se repite este tipo de barrido masivo paralelo, conviene: (1) subir el cap de tabs o asignar una tab dedicada por agente, (2) usar una cuenta staff distinta por agente en vez de compartir `e2e-admin@turnogol.test`, y (3) evitar correr `pnpm dev` de forma compartida entre tantas sesiones simultáneas (HMR bajo carga fue la sospecha recurrente detrás de los hangs de hidratación de Caja).
