# Área del Jugador — Design System (page override)

> **Override de `MASTER.md`** para todo el viaje del jugador: zona pública (`(public)/*`), área
> logueada (`(player)/*`) y páginas de retorno de reserva (`reserva/[bookingId]/*`).
> Donde esta página defina una regla, **prevalece** sobre el MASTER. Para todo lo no cubierto acá,
> aplica el MASTER.
>
> **Spec de refactor**: `docs/superpowers/specs/2026-06-09-portal-unificado-jugador.md`
> **Generado**: 2026-06-09

---

## 0. Principio rector

El jugador vive en **un solo portal**. No existe "el portal" y "la cuenta del jugador" como dos
mundos: hay un único cascarón (shell) que cambia su cabecera según el estado de sesión. Toda página
de esta área debe sentirse parte de la misma tienda (referencia mental: ecommerce tipo MercadoLibre /
Airbnb), nunca una app separada.

**Prohibido en esta área:** headers oscuros de página (`bg-slate-900` y similares como cabecera),
layouts que no expongan una salida hacia "Explorar/Reservar", y cualquier estado logueado que no
muestre un indicador de sesión.

---

## 1. Color y superficie

- **Cabecera (`PortalHeader`)**: actualizado 2026-08-27 al diseño real (`src/components/site/PortalHeader.tsx`,
  reusado por `SiteNav`, que hoy es un re-export suyo) — pill flotante, no barra con borde inferior:
  `<header>` externo `sticky top-0 z-50 bg-transparent`; el contenido vive en un `<div>` interno
  `rounded-full border border-border bg-card/80 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.06)]`,
  altura `h-14` (no `h-16`). **Nunca** fondo oscuro como cabecera de página.
- **Primario**: `emerald-600` (`#059669`). Texto y bordes interactivos.
- **Anti-pattern (heredado del MASTER)**: nunca `emerald-500` para texto sobre blanco (~2.97:1, falla
  AA). Para texto/acciones siempre `emerald-600`+.
- **Estado activo de nav**: `text-emerald-700` (coincide con `PlayerBottomNav` actual).
- **Fondo de página**: `bg-background` (`slate-50`). Tarjetas en `white` con `border-slate-200`.

---

## 2. `PortalHeader` (cabecera única session-aware)

Una sola cabecera para toda el área. Dos estados:

**Deslogueado**
- Izquierda: `Logo` (→ `/`) + `Explorar`.
- Derecha: `Ingresar` (link) + `Comenzar` (botón emerald-600). Igual que hoy.

**Logueado (jugador)**
- Izquierda: `Logo` (→ `/`) + `Explorar` (+ complejo actual si aplica).
- Derecha: **chip de sesión** = avatar de iniciales + nombre + `chevron-down`, que abre el
  `AccountMenu` (dropdown Radix).
- El chip es la prueba visual de "estás logueado". Es **obligatorio** en cualquier vista del área
  cuando hay sesión de jugador.

Reglas:
- Altura del header: `h-16`, `max-w-7xl`, padding `px-4 sm:px-6 lg:px-8` (igual que `SiteNav`).
- `sticky top-0 z-30` (z-index "sticky" del MASTER §layout).
- El chip y sus ítems respetan touch-target 44px en mobile (`h-11 md:h-10`).

---

## 3. Avatar de sesión

- **Iniciales** del jugador (1–2 letras de `firstName`/`lastName`), círculo `emerald` claro con texto
  `emerald-700` — reusar el patrón existente de `(player)/perfil/page.tsx`.
- Tamaño: `h-8 w-8` en el chip del header (`h-10 w-10` en el bloque de identidad del panel
  desplegado); `h-4 w-4` para los íconos (`Calendar`/`Settings`/`LogOut`) dentro de ítems de menú.
- Si en el futuro hay `avatarUrl`, la imagen reemplaza las iniciales (mismo contenedor).
- Nunca depender solo de color para transmitir estado: el chip siempre lleva **nombre** junto al avatar.

---

## 4. `AccountMenu` (dropdown de cuenta)

Construido sobre `src/components/ui/popover.tsx` (Radix `Popover`, **no** `DropdownMenu`: el panel
mezcla links de navegación con el `ThemeToggle` (`role="radiogroup"`), que por ARIA no puede vivir
dentro de un `role="menu"` — Radix igual provee teclado, foco y `aria`).

Ítems (en orden):
1. `Mis reservas` — ícono `Calendar` → `/mis-reservas`
2. `Cuenta` — ícono `Settings` → `/configuracion` (hub; incluye Perfil, Datos, Eliminar)
3. separador
4. `Tema` — `ThemeToggle` (claro/oscuro/sistema), no es un link
5. separador
6. `Salir` — ícono `LogOut`, invoca `signOutAction` (server action compartido)

`Perfil` **no** es ítem de primer nivel: vive dentro del hub "Cuenta" (decisión 2026-06-09). El dropdown
(desktop) y el bottom-nav (mobile) comparten el mismo set para un mental model único entre dispositivos.

Accesibilidad: foco visible emerald (`focus-visible:ring-2 ring-emerald-500 ring-offset-2`) +
`aria-expanded` en el trigger; navegación con flechas/Esc (Radix). Los ítems usan el resaltado
estándar de los dropdowns del repo (`focus:bg-slate-100`, consistencia con admin) y target ≥44px en
mobile (`min-h-11 md:min-h-9`).

---

## 5. Navegación mobile (`PlayerBottomNav`)

- Barra inferior fija `fixed bottom-0 inset-x-0`, `bg-white border-t border-slate-200`, z-index
  "sticky" (10), `pb-[env(safe-area-inset-bottom)]` (notch iOS — ya implementado).
- **Ítems** (override del set actual): `Explorar` (`Compass`) · `Reservas` (`Calendar`) ·
  `Cuenta` (`Settings`). "Explorar/Reservar" es destino de primera clase — el jugador nunca
  queda encerrado.
- **Alcance** (decisión 2026-06-09): se renderiza para el jugador logueado en **toda** el área en
  mobile (zona pública incluida), no solo en `(player)/*`. El shell lo condiciona a la sesión de
  jugador y reserva `pb-20` en el `main` cuando está visible. Deslogueado: no se muestra.
- Cada tab: `flex-col`, ícono `h-5 w-5` + label `text-xs font-medium`, target ≥44px.
- Activo: `text-emerald-700`; inactivo: `text-slate-500 hover:text-slate-900`. `aria-current="page"`.
- En mobile, el chip de sesión vive en el `PortalHeader` (arriba); el bottom-nav es navegación, no
  identidad — no duplica el "Salir" (eso vive en el `AccountMenu`).

---

## 6. Secciones de cuenta (Mis reservas + hub "Cuenta")

- Renderizan **dentro** del `PortalHeader` claro. Sin cabecera propia oscura.
- **Hub "Cuenta"** (`/configuracion`): índice que enlaza Mi perfil (`/perfil`), Descargar datos y
  Eliminar cuenta (`/eliminar-cuenta`). Rutas preservadas; "Perfil" se accede desde el hub, no como
  tab independiente (decisión 2026-06-09).
- Encabezado de sección: `h1` 24px/600 (MASTER §typography) + breadcrumb/volver opcional para
  orientación. Contenedor `max-w-lg mx-auto px-4 py-5` (coincide con páginas actuales).
- Mantienen el candado de seguridad server-side (`extractAuthUser()` → redirect si no es player).
- Conservar `tabular-nums` en horarios, fechas, precios y montos.
- Badges de estado de reserva: paleta de status del MASTER (green/amber/red/slate), nunca color solo
  (ícono + texto).

---

## 7. Continuidad post-reserva (`reserva/[bookingId]/*`)

- `exito`, `pendiente`, `error` se envuelven en el mismo shell (`PortalHeader`).
- Mantener al jugador en el portal: CTAs `Ver mis reservas` (primario) + `Seguir explorando`
  (secundario). Nunca una tarjeta huérfana sin cabecera ni salida.

---

## 8. Accesibilidad (refuerzos sobre el MASTER §10)

- **Indicador de sesión obligatorio**: estado logueado siempre visible (chip avatar+nombre). Reduce
  carga cognitiva — es un requisito de accesibilidad, no decorativo.
- Foco visible `focus-visible:ring-2 ring-emerald-500 ring-offset-2` en chip, ítems de menú y tabs.
- `prefers-reduced-motion`: sin transiciones de apertura bruscas en el dropdown.
- Orden de tabulación = orden visual; `skip-to-content` ya provisto por los layouts.
- Contraste AA en todos los textos del header sobre superficie clara.

---

## 9. Checklist de implementación (visual)

- [ ] Ningún header del área usa fondo oscuro como cabecera de página.
- [ ] Estado logueado muestra chip avatar + nombre en todas las vistas del área.
- [ ] "Explorar/Reservar" alcanzable desde cualquier sección sin cerrar sesión.
- [ ] Dropdown de cuenta operable 100% por teclado, con foco visible.
- [ ] Touch-targets ≥44px en chip, ítems de menú y bottom-nav.
- [ ] `tabular-nums` en horarios/fechas/montos.
- [ ] Páginas `reserva/[bookingId]/*` dentro del shell, con CTAs de continuidad.
- [ ] Bottom-nav visible para jugador logueado también en zona pública (mobile); oculto si deslogueado.
- [ ] "Cuenta" es un hub (Perfil/Datos/Eliminar); rutas `/perfil` `/configuracion` `/eliminar-cuenta` intactas.

## 10. `/explorar` (identidad "Matchday")
La vista `/explorar` evoluciona la identidad con un motivo de líneas de cal y la fuente
`font-display`. Reglas específicas en `pages/explorar.md` (prevalece sobre esta página).
La banda de búsqueda es **clara** (no viola §1) y `PortalHeader` no cambia.
