# Blueprint — Refactor Experiencia Mobile

> **Estado**: APROBADO 2026-07-06 (rama `launch-hardening`). Paso 7 (bottom-nav admin) **DESCARTADO** por decisión del dueño: se mantiene MASTER §6.8 (sidebar → drawer).
> **Fuente**: auditoría mobile de 3 barridos (admin / player-public / componentes compartidos) sobre viewports 360–430px.
> **Ejecución**: un paso por vez, con OK del dueño entre pasos. Ledger de avance al final de este doc.

## 1. Diagnóstico general

La app **no está rota en mobile de forma global** — calidad despareja:

**Lo que ya está bien (NO tocar, usar como referencia):**
- **Money path del jugador** (landing → explorar → perfil complejo → checkout → éxito): mobile-first genuino. `ConfirmBookingButton` h-[58px] full-width, `PaymentMethodSelector` stacked, `LoginGate` correcto.
- **Caja**: patrón canónico de datos anchos — cards `sm:hidden` + tabla `hidden sm:block` con `overflow-x-auto` (`src/app/(admin)/caja/page.tsx:260-318`). Template para todas las tablas rotas.
- **Patrones reutilizables existentes**: `WeekStrip` (chevrons `h-11 md:h-9` + scroll interno `snap-x`), `QuickFilters` (chips 44px scrolleables), `TenantCardCarousel` (snap-mandatory), `TenantGallery` lightbox, `PageHeader` (stack `flex-col sm:flex-row`), `WizardShell` onboarding, `PortalFrame`+`PlayerBottomNav` (safe-area correcto).
- **Convención de touch ya existe**: cascada `h-11 md:h-10` en `button.tsx`/`input.tsx` (44px <768px). El problema: decenas de componentes la **bypassean** con `h-8`/`h-9`/`h-10` crudos.
- Cero JS de viewport (todo CSS `sm:/md:/lg:`, breakpoints stock Tailwind) — bueno para RSC, preservar.

**Contratos vigentes**: MASTER.md §6.8/§9/§10/§12 (touch ≥44px, sin scroll-x a 375px, sidebar→drawer, CTA full-width mobile), specs `docs/spec/design-system/pages/*.md`, y e2e `tests/e2e/mobile/` (Pixel 5: sin scroll horizontal, hamburger `/menú/i`, dialogs fitean).

## 2. Hallazgos

### 🔴 Críticos (layout roto o funcionalidad muerta en touch)

| # | Archivo | Problema |
|---|---------|----------|
| 1 | `src/app/(admin)/abonados/AbonadosList.tsx:94-95` | Tabla de 6 columnas **sin wrapper de overflow ni alternativa card** → desborda la card y fuerza scroll horizontal de página a 360-430px |
| 2 | `src/app/(admin)/staff/page.tsx:72-73` | Tabla 5 columnas (Email ancho) dentro de `overflow-hidden` → **clipea** en vez de scrollear, sin alternativa card |
| 3 | `src/components/booking/BookingCard.tsx:246,253` + `BookingPopover.tsx:66` | Popover de detalle abre solo por `onMouseEnter`/`onFocus` — en iOS el tap no mueve focus a un button → detalle **inalcanzable por touch**. El popover (`absolute w-60`, sin portal) se clipea contra el `overflow-auto` del `GridScroller` |
| 4 | `src/components/ui/image-uploader.tsx:103,115,124` | Controles borrar/reordenar de **24px** sobre thumbnails |

### 🟡 Medios (por causa raíz)

**a) Tablas sin patrón mobile** (misma causa que 🔴 1-2):
- `src/app/(admin)/reportes/page.tsx:192-196` ("Por cancha", 4 cols, `overflow-hidden` + `px-6`)
- `src/app/(admin)/jugadores/page.tsx:60-61` (4 cols, `overflow-hidden`)

**b) Primitives faltantes** (deuda estructural, bloquea specs):
- **No existe Sheet/Drawer/BottomSheet** en `ui/` — MASTER §6.8 exige "sidebar → drawer" y `pages/explorar.md` exige "drawer Todos los filtros"; hoy el drawer de explorar es un Dialog centrado (`QuickFilters.tsx:97`) y el drawer del admin sidebar es hand-rolled **sin focus-trap ni scroll-lock** (`admin-sidebar.tsx:148-161`)
- **No existe Popover portaled con collision detection** — `BookingPopover`, `date-picker`, `combobox`, `phone-input` hand-rollean paneles `absolute` que clipean bajo `overflow-*` (el dropdown de país de `phone-input` se clipea adentro de `BookingFormModal`)
- `Tooltip` muerto en touch (§7.4 promete long-press, no implementado)
- `toast.tsx:18` sin `env(safe-area-inset-bottom)` → pisa el home indicator de iOS

**c) Navegación secundaria que desborda o cramea:**
- Tabs de settings duplicadas en 4 páginas (`settings/{perfil,reservas,horarios,facturacion}/page.tsx:24-49`) — `flex` sin wrap ni scroll → **desbordan a 360px**
- `src/app/(player)/perfil/page.tsx:124-138` — 4 tabs crameadas (~36px alto)
- `src/app/(public)/explorar/page.tsx:210` — barra sticky `top-16` queda ~16px debajo del PortalHeader (~80px)

**d) Cluster touch-targets <44px superficie jugador (plata):**
- `AvailabilityGrid.tsx:148,265,292,302,335-355` — celdas "Reservar" ~28-42px, pills de cancha ~24px, nav de día 32px
- `TenantHeader.tsx:42,100` chips h-10; `FavoriteButton.tsx:99` h-9 en cada card; `ExplorarToolbar.tsx:61,77` h-9 en toolbar sticky

**e) Touch-targets <44px admin** (bypass de la cascada): `ConfirmDialog:99,113,121` (h-10), `ScheduleFields:88,157` (h-10/h-9), `date-picker:194` (celdas ~32×28px), `dropdown-menu:37` (~36px), `CourtList:257,266` (~24px), `AbonadoCreditLoader:103` (h-8), `BookingActions/BookingCharges` (h-9), `InviteStaffDialog:93` (grid 2-col no stackea), onboarding `CourtDraftCard:79,98` (h-8)

**f) Menores**: `BookingFormModal:158` sin gutter (edge-to-edge <448px), `phone-input:255` clase inválida `h-8.5`, `mis-reservas:245` badge sin `whitespace-nowrap`, landing h1 clamp floor 42px, `para-complejos:411` `p-11` sin cascada, grilla compacta ~40px por celda.

## 3. Arquitectura

**Principio rector: NO fork mobile.** Nada de árbol `components/mobile/` paralelo. Tres niveles:

```
Nivel 1 — Primitives nuevos (src/components/ui/)
├── sheet.tsx            Sheet lateral + bottom-sheet. Base @radix-ui/react-dialog
│                        (YA instalado, cero deps nuevas): focus-trap, scroll-lock,
│                        portal, safe-area. Reemplaza drawer hand-rolled del sidebar
│                        y el Dialog-centrado de filtros de explorar.
├── popover.tsx          Radix Popover portaled + collision detection.
│                        ⚠️ ÚNICA dep nueva del plan: @radix-ui/react-popover (~3kb).
│                        Absorbe BookingPopover, date-picker, combobox, phone-input.
├── scroll-tabs.tsx      Tab bar scrolleable (overflow-x-auto + snap + h-11 md:h-9,
│                        receta QuickFilters/WeekStrip). Mata: tabs settings ×4,
│                        perfil jugador, mis-reservas.
└── responsive-list.tsx  Shell del patrón caja: slot cards (sm:hidden) + slot tabla
                         (hidden sm:block + overflow-x-auto + min-w). Solo estructura;
                         cada página define sus cards.

Nivel 2 — Componentes colocated por página (NO globales)
├── (admin)/abonados/AbonadoCardList.tsx      cards mobile de abonados
├── (admin)/staff/StaffCardList.tsx           cards mobile de equipo
├── (admin)/jugadores/PlayerCardList.tsx      cards mobile de jugadores
├── (admin)/reportes/CourtReportCards.tsx     cards mobile "por cancha"
└── (admin)/settings/SettingsTabs.tsx         tab bar única (des-duplica ×4)

Nivel 3 — Fixes in-place con cascada mobile-first
└── h-11 md:h-{9,10} / grid-cols-1 sm:grid-cols-2 / safe-area en offenders.
```

**Decisiones deliberadas:**
- **CSS-first, sin `useMediaQuery`**: cero JS de viewport hoy; se mantiene. Radix Popover con trigger por click funciona en desktop Y touch → no hace falta branch popover/sheet por JS.
- **Sheet vía Radix Dialog** (patrón shadcn estándar), no `vaul`: cero deps nuevas para el caso principal.
- Desktop intacto por construcción: cambios aditivos bajo breakpoint (`sm:hidden` / `md:h-*`) o reemplazo 1:1 de comportamiento.

## 4. Orden de ejecución

| Paso | Alcance | Archivos clave | Riesgo | Estado |
|------|---------|----------------|--------|--------|
| **1. Tablas admin → patrón caja + tabs settings** | 2 🔴 layout + 2 🟡: `responsive-list.tsx` + cards colocated abonados/staff/jugadores/reportes; `SettingsTabs` con `scroll-tabs.tsx`. Solo CSS/markup, cero deps | AbonadosList, staff/page, jugadores/page, reportes/page, settings/×4 | Bajo | ✅ COMPLETADO 2026-07-06 (sin commitear) |
| **2. Primitives: `sheet.tsx` + `popover.tsx`** | Crear ambos; drawer admin sidebar → Sheet (focus-trap/scroll-lock, hamburger `/menú/i` intacto); filtros explorar → bottom-sheet (spec explorar.md). Instala `@radix-ui/react-popover` | ui/sheet, ui/popover, admin-sidebar, admin-layout-shell, QuickFilters | Medio | ✅ COMPLETADO 2026-07-07 (sin commitear) |
| **3. Grilla mobile** | `BookingPopover` → `ui/popover.tsx` portaled con tap-to-toggle (revive iOS, conserva hover-intent desktop); fila compacta ≥44px; `BookingFormModal` gutter + fix clipping `phone-input` | BookingCard, BookingPopover, GridScroller, BookingFormModal | Medio | pendiente |
| **4. Touch-targets superficie jugador** | `AvailabilityGrid` a receta `h-11 md:h-9` (celdas Reservar, pills, nav día); `TenantHeader` chips; `FavoriteButton`; `ExplorarToolbar`; sticky `top-16→top-20` | AvailabilityGrid, TenantHeader, FavoriteButton, ExplorarToolbar, explorar/page | Bajo | pendiente |
| **5. Touch-targets admin + primitives menores** | ConfirmDialog, date-picker (≥40px), dropdown-menu, ScheduleFields, image-uploader (24→44px), CourtList, AbonadoCreditLoader/DebtPayment/BookingActions/Charges, InviteStaffDialog stack, toast safe-area, `h-8.5` inválido | ~12 archivos, clases puntuales | Bajo | pendiente |
| **6. Polish player/business/onboarding** | perfil tabs → `scroll-tabs`, badge `whitespace-nowrap`, landing h1 clamp, `para-complejos` `p-7 sm:p-11`, `CourtDraftCard` h-8→44px | 6 archivos | Bajo | pendiente |
| ~~7. Bottom-nav admin~~ | **DESCARTADO** (decisión dueño 2026-07-06): se mantiene MASTER §6.8 sidebar → drawer | — | — | descartado |

Dependencias: Paso 2 antes de 3 (grilla consume `popover.tsx`). Pasos 1, 4, 5, 6 independientes.

## 5. Guardrails por paso

- `pnpm typecheck` + `pnpm lint` después de cada hallazgo (protocolo-fixes: revertir si rojo).
- e2e mobile en verde: `tests/e2e/mobile/admin-mobile-smoke.spec.ts` (sin scroll-x Pixel 5, hamburger `/menú/i`, dialogs fitean) + `touch-targets.spec.ts`. Paso 1 extiende el smoke a `/abonados` y `/staff` con datos.
- Prohibido: tocar Server Actions/Zod/DB, commits automáticos, romper desktop.
- Única dep nueva de todo el plan: `@radix-ui/react-popover` (Paso 2).

## 6. Ledger de ejecución

| Fecha | Paso | Hallazgo | Cambio | Verificación |
|-------|------|----------|--------|--------------|
| 2026-07-06 | 1 | 🔴 #1 AbonadosList tabla sin patrón mobile | Nuevo `ui/responsive-list.tsx` (patrón caja; tabla primero en DOM por `.first()` de e2e). `AbonadosList.tsx`: lógica de acciones extraída a `useAbonadoActions` (sin cambio de comportamiento), `AbonadoTableRow` (desktop, markup intacto) + `AbonadoCard` nueva (mobile, botones min-h-11). Cards colocated en el mismo archivo (no `AbonadoCardList.tsx` aparte: comparten hook/dialogs). Tests: `abonados-list.test.tsx` queries a `getAllBy*[0]` (markup dual), `abonados-crud.spec.ts:171` `.first()` | audit-verify.sh 🟢 (202 files / 1510 tests) |
| 2026-07-06 | 1 | 🔴 #2 staff/page tabla `overflow-hidden` | `ResponsiveList` + cards mobile inline (nombre/(vos)/email/badges + `StaffActions` 44px), tabla `min-w-[640px]`. `staff-crud.spec.ts:76` `.first()` | audit-verify.sh 🟢 |
| 2026-07-06 | 1 | 🟡 a) reportes "Por cancha" | Patrón dual manual dentro del container existente (header propio): cards `sm:hidden` + tabla `hidden sm:block overflow-x-auto min-w-[520px]`. "Por método" (2 cols) sin tocar: entra. `reportes.spec.ts` usa `getByRole('cell')` → sin colisión con cards (`li`) | audit-verify.sh 🟢 |
| 2026-07-06 | 1 | 🟡 a) jugadores lista | Patrón dual: cards con fila entera como `Link` ≥44px (Fitts §9) + deuda como badge; tabla `min-w-[560px]` con scroll. Sin contratos e2e | audit-verify.sh 🟢 |
| 2026-07-06 | 1 | 🟡 c) tabs settings ×4 desbordan a 360px | Nuevo `ui/scroll-tabs.tsx` (overflow-x-auto + scrollbar oculto + `min-h-11 md:min-h-9`, `<a>` nativo = full reload como antes) + `settings/SettingsTabs.tsx` único; los 4 nav duplicados reemplazados (borrado autorizado por Paso 1 aprobado) | audit-verify.sh 🟢 |
| 2026-07-06 | 1 | e2e | Smoke mobile extendido: rutas `/staff`, `/jugadores`, `/reportes` en el loop de no-scroll-x + test `/abonados` con datos (seed service-role, card visible, acción ≥44px) + test card `/staff` | mobile-chrome: **12 passed, 1 failed PRE-EXISTENTE** (abajo). chromium: abonados-crud #3/#4 🟢, staff-crud+reportes 7 passed / 0 failed |
| 2026-07-06 | — | **PRE-EXISTENTE** (stash-confirmado, NO es del Paso 1) | `touch-targets.spec.ts` /grilla: botón banda madrugada "Mostrar" h:32 <44px → corresponde a **Paso 3** (grilla mobile) | falla idéntico sin el diff |
| 2026-07-06 | — | **PRE-EXISTENTE** (stash-confirmado, NO es del Paso 1) | `abonados-crud.spec.ts` #1/#2: `page.fill('input[name="contactPhone"]')` apunta al input hidden de `phone-input` en /abonados/nuevo → drift previo spec↔componente. Pendiente de fix aparte (el fix natural cae con Paso 2/3 al tocar phone-input, o fix de spec puntual) | fallan idéntico sin el diff |
| 2026-07-07 | 2 | 🟡 b) drawer admin hand-rolled sin focus-trap | Nuevo `ui/sheet.tsx` (Radix Dialog + cva; variants left/right/bottom, bottom con safe-area y `max-h-[85dvh]`, props `hideClose`/`overlayClassName`). `admin-sidebar.tsx`: panel mobile → `Sheet side="left"` (gana focus-trap, scroll-lock, Esc; `lg:hidden` en panel+overlay conserva el edge de resize); overlay manual de `admin-layout-shell.tsx` eliminado (lo trae el Sheet) | audit-verify.sh 🟢 |
| 2026-07-07 | 2 | 🟡 b) filtros explorar en Dialog centrado (spec pide drawer) | `QuickFilters.tsx`: `Dialog` → `Sheet side="bottom"` (bottom-sheet, `sm:max-w-lg sm:mx-auto` en desktop). `quick-filters.test.tsx` no toca el drawer → sin cambios | audit-verify.sh 🟢 |
| 2026-07-07 | 2 | 🟡 b) sin Popover portaled | Dep nueva `@radix-ui/react-popover@^1.0` (única del plan, aprobada) + `ui/popover.tsx` (portal + collision detection + `collisionPadding=8`). Consumidores llegan en Paso 3 | audit-verify.sh 🟢 |
| 2026-07-07 | 2 | e2e | Smoke: assertion nueva — hamburger abre el Sheet (dialog visible, link Caja, Esc cierra). **12/12 passed** mobile-chrome. touch-targets: 4 passed + 1 rojo pre-existente (grilla, sin cambios). portal-search (explorar): 4/4 passed | verde con server limpio |
| 2026-07-07 | — | **INFRA e2e (Windows), no código**: matar el dev server lanzado en bg deja un zombie `node.exe` reteniendo :3000 → el server nuevo se corre a :3002 y los tests pegan contra el zombie crasheado ("Jest worker encountered 2 child process exceptions" / assert libuv). | Solución: NO levantar dev en bg propio; dejar que Playwright gestione su webServer (lo mata bien) + `--workers=1` | 12/12 verdes tras limpiar |
