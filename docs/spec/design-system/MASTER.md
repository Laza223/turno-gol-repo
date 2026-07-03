# TurnoGol — Design System (MASTER) · v2.0

> **Fuente de verdad visual.** Todo código de UI sigue estas reglas.
> Al construir una página específica, revisá primero `design-system/pages/[page].md`:
> si existe, sus reglas **overridean** este archivo en lo que definan. Para todo lo demás, rige este MASTER.
>
> ⚠️ Precedencia sobre overrides viejos: `pages/player-area.md` §0–§1 ("prohibido header oscuro",
> "cabecera siempre clara") quedó **superado** por el sistema theme-adaptive de este MASTER (§2, §4).
> El resto de ese archivo (PortalHeader, AccountMenu, bottom-nav, hub Cuenta) sigue vigente.
> `pages/explorar.md` sigue vigente en estructura (chips, card, split map), pero su superficie
> hero "siempre clara" se reinterpreta como **theme-adaptive** (clara en light, slab en dark).

**Proyecto:** TurnoGol — SaaS B2B2C para complejos de fútbol (Argentina)
**Stack:** Next.js 14 · TypeScript · shadcn/ui · Tailwind CSS · Lucide · next-themes
**Versión:** 2.0 — 2026-07-02 (reescritura: tokens duales light/dark reales, contraste re-verificado,
formato es-AR, Guided UX, psicología aplicada, dos personalidades)
**Reemplaza:** v1 (2026-04-27) + nota dark-premium (2026-06-26)

---

## 1. Identidad: un sistema, dos personalidades

TurnoGol tiene dos usuarios que no se parecen en nada, y un solo sistema que debe servir a ambos
sin duplicar componentes. La misma paleta, la misma tipografía, los mismos primitives — pero dos
**presupuestos de expresión** distintos.

| | 🖥️ **Admin — "El Mostrador"** | ⚽ **Jugador — "La Previa"** |
|---|---|---|
| Quién | Marcelo (35–60, dueño) y Rodrigo (encargado). Tech literacy 2–3/5. La usan 8 h/día. | Tomás (18–35). Nativo PedidosYa/Rappi/ML. La usa 2 min/semana. |
| Es | Herramienta de trabajo. Caja registradora + agenda. | App de consumo. Vidriera + checkout. |
| Métrica de éxito | Segundos hasta completar la tarea. Cero ambigüedad. | Ganas de volver. Confianza para pagar. |
| Densidad | Alta. Datos primero, decoración después. | Media/baja. Una idea por pantalla. |
| Motion budget | ≤ 200 ms, solo funcional (feedback, transición). | Hasta 500 ms en momentos pico (confirmación). |
| Display type | `font-display` solo en KPIs y títulos de página. | `font-display` (itálica) protagonista en heros. |
| Tono | Directo, operativo: "Cobrar", "Cerrar caja". | Cercano, de vestuario: "Tenés 2 turnos por jugar". |
| Referencia mental | PedidosYa lado restaurante, Toast POS. | PedidosYa/Rappi lado cliente, Airbnb. |

**Regla de oro:** ante una decisión de diseño, preguntá primero *"¿de qué lado estoy?"*. Un
degradé animado en la Caja es ruido; una tabla densa en el checkout del jugador es frío.
La belleza del admin ES su eficiencia; la eficiencia del jugador ES su belleza.

### Principios del sistema (no negociables)

1. **La grilla es el producto.** Cualquier decisión que enlentezca leer/cargar una reserva es un bug de diseño, por linda que sea.
2. **Tokens antes que clases.** Los primitives consumen tokens semánticos (`bg-card`, `text-foreground`), nunca colores crudos (`bg-white`, `text-slate-900`). Un primitive con `bg-white` hardcodeado es un bug: nace roto en dark mode.
3. **Dark y light son first-class.** Ninguna vista de producto se diseña "para un tema y ya se verá". Lenguaje adaptativo: **light = elevación** (sombras en capas), **dark = glass** (white-alpha + blur + glow). Nunca glass en light (lee barroso).
4. **Nada comunica solo con color.** Todo estado lleva color + ícono y/o texto. (Daltonismo ~8 % de varones — nuestra base es mayormente masculina.)
5. **El sistema enseña en contexto.** Cero manuales: estados vacíos didácticos, coachmarks de primera vez, tooltips en iconografía (§7). Como un videojuego: el tutorial es jugar.
6. **es-AR en serio.** Voseo, plata con puntos de miles, fechas en castellano, cero anglicismos de dashboard (§8). Un "Revenue hoy" rompe más confianza que un bug.

---

## 2. Color

### 2.1 Arquitectura (3 capas)

```
Primitivas Tailwind (emerald-600, slate-950…)   ← solo se citan en ESTE doc y en globals.css
        ↓ se asignan a
Tokens semánticos (--primary, --card, --border…) ← lo que consumen los primitives ui/
        ↓ se componen en
Recetas de componente (.card-premium, .page-header-band, StatCard…)
```

- **Primitives `ui/`**: SOLO tokens semánticos. Así el theme flip es gratis y un componente nuevo nace dark-safe.
- **Vistas**: tokens semánticos + recetas. Colores de primitiva Tailwind solo para semántica de dominio declarada en §2.5/§2.6 (estados de reserva, semáforo financiero).
- **Prohibido**: hex inline en JSX; `dark:` sueltos para "arreglar" un primitive (arreglá el token).

### 2.2 Tokens semánticos — duales (fuente: `globals.css`, verificado 2026-07-02)

| Token | Light | Dark | Rol |
|---|---|---|---|
| `--background` | `214 25% 91%` (#DDE3EC, slate frío) | `224 71% 4%` (#020617, slate-950) | Fondo de página. Las cards flotan sobre él. |
| `--foreground` | `224 71% 4%` | `210 40% 98%` | Texto principal |
| `--card` | `0 0% 100%` (blanco) | `222 33% 9%` (~#0D1424) | Superficie elevada |
| `--primary` | `161 94% 30%` (emerald-600) | `161 94% 30%` | Marca / acción. Ver §2.4 para TEXTO. |
| `--secondary` / `--muted` | `214 32% 85%` | `217 33% 14%` | Superficies anidadas |
| `--muted-foreground` | `215 20% 40%` | `215 20% 65%` | Texto secundario |
| `--accent` | `214 32% 85%` | `217 33% 17%` | Hover bg de menús |
| `--border` / `--input` | `214 32% 83%` | `217 33% 17%` | Bordes |
| `--ring` | `160 84% 39%` (emerald-500) | igual | Focus ring |
| `--destructive` | `0 72% 51%` (red-600) | igual | Peligro / borrar |
| `--success` | `142 72% 29%` (green-700) | `142 70% 45%` | Confirmado / cobrado |
| `--warning` | `32 95% 44%` (amber-600) | `38 92% 50%` | Pendiente / atención |
| `--info` | `221 83% 53%` (blue-600) | `217 91% 60%` (blue-500) | Informativo neutro / procesos de terceros |
| `--shell-bg` | — | `221 32% 14%` | Shell del layout admin |

**`--info` vive en `globals.css` + `tailwind.config.ts`** (mismo patrón que `--success`; agregado
2026-07-02 junto con la grilla). Es el color "esto es información/proceso, ni bien ni mal" —
estados `in_process` de MP, confirmadas-a-cobrar en la grilla (§2.6), avisos neutros, links
informativos. Regla de marca de terceros: el azul MP se permite **solo** dentro del contexto de
pago (selector de método, logos), nunca como acento general.

### 2.3 El verde: jerarquía de un solo protagonista

Emerald es la marca (césped, cancha, "GOL"). Correcto y defendible — **se queda**. El riesgo no es
el hue: es la **inflación semántica**. Hoy emerald significa a la vez marca, acción, éxito, dinero,
disponibilidad y selección → cuando todo es verde, nada resalta (se diluye el efecto Von Restorff).

Jerarquía obligatoria por vista:

1. **Un (1) elemento grita**: el CTA primario o el dato clave. Fill sólido emerald.
2. **Pocos susurran**: acentos (íconos halo, borde activo, link). Emerald texto/borde.
3. **Todo lo demás calla**: neutros slate. La disponibilidad, la decoración y los fondos NO compiten en verde con la acción.

En la grilla esto se invierte a propósito: el verde marca **lo confirmado/cobrado** (el negocio),
no el CTA. Ver §2.6.

### 2.4 Contraste — números reales (re-verificados, WCAG 2.1)

⚠️ **Corrección a v1.** La v1 afirmaba "emerald-600 cumple AA (4.5:1) sobre blanco". **Es falso:
da 3,77:1.** Cumple AA solo para texto grande/componentes UI (≥3:1), no para texto normal.
Toda regla derivada se corrige así:

| Combinación | Ratio | Veredicto AA texto normal |
|---|---|---|
| emerald-500 `#10B981` sobre blanco | **2,5:1** | ❌ PROHIBIDO como texto |
| emerald-600 `#059669` sobre blanco | **3,8:1** | ❌ Solo texto grande (≥24px / ≥18,7px bold) o componente UI |
| emerald-700 `#047857` sobre blanco/card | **5,5:1** | ✅ Texto emerald estándar en cards |
| emerald-700 sobre `--background` light (#DDE3EC) | **4,2:1** | ❌ Sobre el fondo de página usar 800 |
| emerald-800 `#065F46` sobre background light | **6,0:1** | ✅ Texto emerald sobre fondo de página |
| Blanco sobre emerald-600 | **3,8:1** | ❌ Como label de botón 14px NO alcanza |
| Blanco sobre emerald-700 | **5,5:1** | ✅ CTA sólido light-mode |
| slate-950 sobre emerald-500 (dark CTA) | **7,9:1** | ✅ CTA sólido dark-mode |
| emerald-400 `#34D399` sobre slate-950 / card dark | **10,5 / 9,6:1** | ✅ Texto emerald estándar en dark |
| Blanco sobre red-600 | **4,6:1** | ✅ |
| Blanco sobre amber-600 | **3,2:1** | ❌ Warning sólido lleva texto oscuro (amber-950) o fill amber-700+ |

**Reglas duras resultantes:**

- Texto/link emerald en light: `text-emerald-700` sobre cards, `text-emerald-800` sobre el fondo de página. En dark: `text-emerald-400`.
- **CTA primario sólido: light = `bg-emerald-700 hover:bg-emerald-600 text-white`; dark = `bg-emerald-500 hover:bg-emerald-400 text-slate-950`.** El CTA dark en verde eléctrico con texto oscuro es además más "app de moda" (neón sobre negro) — la accesibilidad y la estética empujan para el mismo lado.
- `bg-emerald-600` con texto blanco queda permitido SOLO en elementos con texto grande/bold ≥18,7px o como componente UI sin texto esencial (día seleccionado del date-picker con número bold, píldoras decorativas).
- Warning con fondo sólido: texto `amber-950`, nunca blanco.

### 2.5 Color por lado

**Admin — semáforo financiero.** El dueño lee plata de un vistazo: `success` = entra/cobrado,
`destructive` = sale/deuda, `warning` = pendiente, `info` = en proceso (MP). Estos cuatro hues están
**reservados**: no usarlos decorativamente en el admin. Ingresos en verde y egresos en rojo SIEMPRE,
con signo y label (no color solo, §1.4).

**Jugador — emerald como deseo.** En el lado del jugador el verde vende: hero glow, precio,
CTA "Reservar". Los estados de reserva del jugador usan la misma paleta de §2.6 para que lo que ve
Tomás coincida con lo que ve Rodrigo cuando hablan por teléfono ("figura confirmada, verde").

### 2.6 Estados de reserva — paleta canónica (grilla, listados, badges, player)

Mapa 1:1 con `booking_status` + estado de pago. Siempre color + ícono + texto.

| Estado | Light | Dark | Ícono Lucide |
|---|---|---|---|
| Libre (slot) | superficie `--card`, borde `--border`; hover: borde emerald + ícono `+` | ídem con glass | `Plus` (solo hover/focus) |
| Pendiente de seña (`pending_payment`) | borde-l 3px + tinte `warning` | ídem, tinte al 15 % | `Clock` |
| Confirmada sin seña (efectivo) | borde-l 3px `info` + texto normal | ídem | `HandCoins` |
| Confirmada con seña (`confirmed`) | borde-l 3px + tinte `success` suave | ídem | `CheckCircle2` |
| Completada + cobrada | fill `success` 10–15 % + check sólido | ídem | `CheckCheck` |
| No-show / deuda | borde-l 3px + tinte `destructive` | ídem | `UserX` |
| Cancelada | neutro `muted`, texto tachado opcional | ídem | `XCircle` |
| Pasado (sin acción) | desaturado, opacidad 60 % | ídem | — |
| Bloqueado / cancha offline | patrón rayado diagonal `muted` | ídem | `Ban` |

Los tintes se logran con `color-mix`/alpha del token semántico — nunca hex nuevos. El **borde
izquierdo de 3px** es el identificador primario (legible en densidad alta y para daltónicos por
posición constante); el tinte de fondo es refuerzo.

---

## 3. Tipografía

Tres caras, tres trabajos. No hay cuarta.

| Familia | Token | Rol | Dónde |
|---|---|---|---|
| **Inter** (variable) | `font-sans` | Cuerpo, UI, datos. La que trabaja. | Todo por defecto |
| **Archivo** (variable) | `font-display` | Display: heros, h1/h2, **numerales clave** (precios, KPIs, montos). En itálica bold = voz "cancha" del jugador. | Heros player (itálica), títulos de página y KPIs admin (recta) |
| **Sora** | `font-logo` | SOLO el logotipo TURNOGOL. | Logo. Nada más. |

### Escala

| Rol | Tamaño/peso | Tailwind | Notas |
|---|---|---|---|
| Display XL (hero player) | 48–60px / 800 itálica | `font-display text-5xl md:text-6xl font-extrabold italic` | Solo lado jugador, 1 por página |
| Display L (hero sección) | 36px / 700 | `font-display text-4xl font-bold` | |
| KPI / numeral clave | 28–36px / 700 | `font-display text-3xl font-bold tabular-nums` | StatCard, precio card, totales caja |
| Título de página (h1) | 24px / 600 | `text-2xl font-semibold` (admin en `font-display`) | |
| Título de sección (h2) | 20px / 600 | `text-xl font-semibold` | |
| Título de card (h3) | 16px / 600 | `text-base font-semibold` | |
| Body | 14px / 400 | `text-sm` | Mínimo admin |
| Label | 14px / 500 | `text-sm font-medium` | |
| Caption / helper | 12px / 400 | `text-xs text-muted-foreground` | |
| Badge | 12px / 500 | `text-xs font-medium` | |

**Reglas:**
- `tabular-nums` en **todo** dato numérico (precios, horas, contadores, columnas). Sin excepción: los números que "bailan" al actualizar rompen el escaneo de la grilla.
- Disciplina display: `font-display` no aparece en párrafos, tablas ni forms. Si todo es display, nada es display.
- Body mínimo 14px; en al lado del jugador el body puede ser 16px (`text-base`) en flujos de lectura (detalle de complejo, confirmación).
- Nada de monospace en UI.

---

## 4. Superficie: espaciado, radio, elevación

### 4.1 Espaciado — grilla de 4px (sin cambios v1)

`space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-6` 24 (padding card) ·
`space-8` 32 (secciones) · `space-12` 48 (hero). Vertical entre secciones: `space-y-6`.

### 4.2 Radio (mapeo shadcn real: `--radius: 0.5rem`)

| Token | Valor | Uso |
|---|---|---|
| `rounded-sm` | 4px | Badges, tags |
| `rounded-md` | 6px | Inputs, ítems de menú |
| `rounded-lg` | 8px | Botones, cards estándar |
| `rounded-xl` | 12px | `card-premium`, paneles, modales |
| `rounded-full` | — | Avatares, pills, chips |

### 4.3 Elevación — el lenguaje premium adaptativo

**Light = elevación** (sombras suaves en capas + tinte emerald sutil; **prohibida la translucidez**
sobre claro — lee barrosa). **Dark = glass** (relleno white-alpha 3–8 % + `backdrop-blur` + sombra
profunda + glow emerald). Recetas canónicas ya en `globals.css`:

| Receta | Qué es | Cuándo |
|---|---|---|
| `.card-premium` | Card elevada/glass según tema | Superficie destacada por defecto en admin y player |
| `.card-premium-interactive` | + lift −4px y glow al hover | SOLO si la card ES clickeable (agregar `cursor-pointer`) |
| `.page-header-band` | Banda de cabecera de página | Toda página admin (via `PageHeader`) |
| `.icon-halo` | Chip de ícono con halo emerald | StatCard, acciones destacadas |
| `.player-hero-band` + `.player-hero-grid` | Banda hero jugador + retícula | Heros del lado jugador |
| `.hero-accent-text` | Degradé emerald en titulares | 1 vez por hero |
| `.reserva-*` | Shell/badge/receipt del flujo de reserva | Flujo `reserva/[bookingId]` |
| `.shell-bg` / `.content-area-gradient` | Fondo del shell admin | Layout admin |
| `.skeleton` | Shimmer de carga | Todo loading que reemplaza contenido |

Sombras utilitarias shadcn (`shadow-sm/md/lg/2xl`) siguen válidas para dropdowns/modales.
**Regla:** una vista no inventa su propia sombra/glass inline; si la receta no existe, se agrega a
`globals.css` con par light/dark y se documenta acá.

### 4.4 Z-index

Base 0 · Sticky 10 · Dropdown 20 · Header portal 30 · Overlay modal 40 · Modal 50 · Toast 100.

---

## 5. Motion con significado

La animación es información: comunica causalidad (qué disparó qué), continuidad (de dónde vino
esto) y estado (esto cambió). Si no comunica nada, no va.

### 5.1 Tokens

| Token | Duración | Easing | Uso |
|---|---|---|---|
| `motion-instant` | 100ms | ease-in | Press feedback (`active:scale-[0.98]`) |
| `motion-fast` | 150ms | ease | Hover, color, focos |
| `motion-base` | 200ms | ease-out | Dropdowns, tabs, `card-premium` |
| `motion-slow` | 300ms | ease-out | Modales, sheets, drawers |
| `motion-peak` | 400–600ms | ease-out / spring suave | SOLO momentos pico del jugador (§5.3) |

Implementación: clases Tailwind (`duration-150`, `ease-out`, `tailwindcss-animate`). No agregar
librerías de animación al stack.

### 5.2 Presupuesto por lado

- **Admin: techo 200ms** para todo lo interactivo (excepción: modales 300). Nada "flota" ni "respira" en el admin: Rodrigo repite estas acciones cientos de veces por día; 400ms de gracia × 200 usos = minuto y medio diario de espera decorativa.
- **Jugador: techo 300ms** en navegación, **hasta 600ms UNA vez** en momentos pico.

### 5.3 Catálogo semántico

| Patrón | Receta | Ejemplo TurnoGol |
|---|---|---|
| **Feedback** (presioné algo) | `active:scale-[0.98]` 100ms + spinner en async (`isLoading` del Button) | Todo botón |
| **Transición** (cambié de contexto) | fade+zoom 95→100 200ms | Dropdown, popover, tabs |
| **Atención** (algo cambió sin que lo toques) | 1 pulso de tinte emerald 600ms + badge persistente | Reserva online entra por Realtime a la grilla → el slot pulsa una vez. Von Restorff aplicado: el cambio es EL elemento distinto |
| **Celebración** (peak del jugador) | check dibujado + glow 600ms, una sola vez, sin loop | Pantalla "¡Reserva confirmada!" |
| **Espera** (estoy trabajando) | `.skeleton` shimmer con la MISMA silueta del contenido final | Grilla/caja/dashboard loading |
| **Ambiente** (solo marketing) | `tg-float` / `tg-drift` (existentes) | Heros de landing/para-complejos. PROHIBIDO en vistas de tarea |

**Reglas:** sin loops infinitos fuera de skeleton/ambiente marketing · nada que desplace layout
(transform/opacity only) · `prefers-reduced-motion` ya se respeta global en `globals.css` (motion
→ 0.01ms) — no romper ese contrato · un solo elemento animándose a la vez por vista.

---

## 6. Componentes

### 6.1 La regla primitives (P0 del sistema)

Todo componente de `src/components/ui/` usa **exclusivamente tokens semánticos**. Estado real
auditado 2026-07-02: 14 de 16 primitives hardcodean clases light (`bg-white`, `border-slate-200`,
`text-slate-700`) sin par dark — por eso el theme flip requirió parches por vista. **Migración
progresiva obligatoria:** cada vez que se toque un primitive, se tokeniza:

| Hardcodeado (mal) | Token (bien) |
|---|---|
| `bg-white` | `bg-card` |
| `text-slate-900` | `text-foreground` / `text-card-foreground` |
| `text-slate-500/600` | `text-muted-foreground` |
| `border-slate-200` | `border-border` (o solo `border`, el reset ya aplica) |
| `hover:bg-slate-100` | `hover:bg-accent` |
| `bg-slate-100` | `bg-secondary` / `bg-muted` |
| `bg-emerald-600` (CTA) | `bg-primary` (con §2.4 aplicado al token) |
| `focus:ring-emerald-500` | `focus-visible:ring-ring` |

### 6.2 Button

```tsx
// Primario — uno por vista. AA en ambos temas (§2.4):
// light: bg-emerald-700 + blanco (5,5:1) · dark: bg-emerald-500 + slate-950 (7,9:1)
<Button>Guardar</Button>              // variant default → tokens

// Jerarquía completa: default (primario) · outline (secundario) · ghost (terciario)
// · destructive (peligro) · link (inline)
```

- Alturas con cascada mobile-first ya implementada: `h-11 md:h-10` (44px touch en <768px, 40px desktop). `sm`: `h-10 md:h-9`. `icon`: `h-11 w-11 md:h-10 md:w-10`.
- Async: `isLoading` (spinner + disabled) SIEMPRE — nunca doble-submit silencioso.
- Un primario por vista. Si hay dos acciones "importantes", una es outline (Ley de Hick: decidir entre 2 CTAs iguales es no decidir).
- El hover lift (`-translate-y-0.5`) actual es aceptable (transform, no layout shift), pero en admin es opcional; en listas densas, preferir solo cambio de color.
- Icon-only (`size="icon"`): `aria-label` **y** `<Tooltip>` obligatorios (§7.4).

### 6.3 Inputs / forms

- `<label>` visible SIEMPRE (nunca placeholder-como-label). Placeholder = ejemplo con "Ej:" y debe caber completo en el ancho del campo (auditoría: el email del onboarding y la fecha de la landing truncan — bug).
- Error debajo del campo: `text-xs text-destructive` + `role="alert"`. Validar on-blur, no por tecla.
- Helper: `text-xs text-muted-foreground` debajo.
- `autocomplete` en auth/datos personales; `inputmode="numeric"` en montos/teléfonos.
- Fecha/hora nativos heredan el tema vía `color-scheme` (ya seteado en `:root`/`.dark`).

### 6.4 Cards — cuál usar

| Componente | Cuándo |
|---|---|
| `Card` shadcn plana (`bg-card border shadow-sm`) | Contenido de trabajo: forms, tablas, listados admin |
| `PremiumCard` / `.card-premium` | Superficies destacadas: paneles de dashboard, cards de complejo/cancha del jugador |
| `StatCard` | KPIs. **Único** formato de KPI permitido (número `font-display` + label + ícono halo + comparativa opcional). Reportes hoy viola esto con su propio formato — migrar |
| `PageHeader` | Cabecera de TODA página admin: ícono halo + h1 + subtítulo (fecha/contexto) + acciones a la derecha |

Interactiva ⇒ `card-premium-interactive` + `cursor-pointer` + `focus-visible:ring-2`. Display-only ⇒ sin cursor pointer (no mentir affordance).

### 6.5 Badges de estado

Receta dual-theme con tokens (reemplaza los hex fijos de v1):

```tsx
// success | warning | destructive | info | muted — SIEMPRE ícono + texto
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
  bg-success/10 text-success ring-1 ring-inset ring-success/25
  dark:bg-success/15 dark:ring-success/40">
  <CheckCircle2 className="h-3 w-3" aria-hidden /> Confirmada
</span>
```

Mapeo de estados → §2.6. El texto del badge usa el vocabulario canónico de §8.5.

### 6.6 Tablas / datos

- Header: `text-xs font-medium text-muted-foreground uppercase tracking-wide`.
- Filas: `text-sm text-foreground`, `divide-y divide-border`, hover `bg-accent/50`.
- Numéricas: right-align + `tabular-nums`. Montos con formato §8.2.
- Fila clickeable entera si abre detalle (Fitts: blanco grande), con `cursor-pointer` + focus visible.
- Densidad admin: `py-2.5` por celda como base; nunca inflar por estética.

### 6.7 Modales, toasts, estados

- **Modal**: overlay `bg-black/50` (dark: `bg-black/70`), contenido `bg-card rounded-xl shadow-2xl max-w-md p-6`. Escape + botón cerrar. Confirmación destructiva: botón rojo separado del cancelar, con consecuencia explícita ("Se le avisará al jugador por email").
- **Toast**: éxito auto-dismiss 4s; error persiste hasta acción. `aria-live="polite"`. Texto = qué pasó + qué sigue ("Reserva cargada. Quedó en la grilla de las 18:00"). PROHIBIDO el toast "1 error" pelado (existe hoy en landing — bug de copy).
- **Empty state**: SIEMPRE didáctico (§7.2): ícono + qué es esto + CTA de primera acción. Nunca un vacío mudo (Reportes hoy).
- **Error state**: qué falló en castellano + botón "Reintentar" + fallback ("Llamá al complejo: …" en player).
- **Loading**: skeleton con la silueta real del contenido (no spinners de página completa).

### 6.8 Navegación

- **Admin**: sidebar 240px (`--sidebar-width`), ítems con ícono+label, activo = pill emerald sutil + barra izquierda. Orden por frecuencia de uso (serial position): Inicio, Grilla, Reservas… Configuración al final. Ítems bloqueados por rol (manager) muestran candado + tooltip "Solo el dueño" (§7.4) — no desaparecen (el encargado entiende el sistema completo).
- **Player**: `PortalHeader` sticky session-aware + `PlayerBottomNav` (Explorar/Reservas/Cuenta) fijo en mobile con `pb-[env(safe-area-inset-bottom)]`. Especificado en `pages/player-area.md` (vigente).
- Mobile admin: sidebar → drawer; el título de página siempre visible al abrir una vista.

---

## 7. Guided UX — el producto que se explica solo

Marcelo no va a leer un manual y nadie se lo va a dar. El sistema enseña como un videojuego:
**en el momento exacto de la necesidad, en contexto, una sola vez.**

### 7.1 Reglas globales

1. Máximo **un** elemento de guía visible a la vez por pantalla.
2. Todo hint se descarta con un tap y **no vuelve** (persistencia `localStorage` key `tg-hint-*`; futura tabla de preferencias si se necesita cross-device).
3. Nunca bloquear el input del usuario. PROHIBIDO el tour modal de N pasos al primer login (se saltea sin leer y quema el único momento de atención).
4. Texto ≤ 90 caracteres, voseo, verbo primero: "Tocá un horario libre para cargar una reserva".
5. La guía usa `--info` o emerald suave — nunca warning/destructive (no es un problema).

### 7.2 Inventario de patrones

| Patrón | Qué es | Cuándo | Ejemplo TurnoGol |
|---|---|---|---|
| **Empty state didáctico** | Vacío = primera lección: ícono + 1 línea + CTA | Toda colección vacía | Grilla sin reservas: "Tocá cualquier horario libre y cargá tu primera reserva" + pulso único en el slot más próximo |
| **Checklist de setup** | Progreso con % arrancado (goal gradient §9) | Dashboard hasta completar | Ya existe ("Progreso de configuración", 57 %) — patrón canónico, mantener |
| **Coachmark** | Globo anclado a UN elemento, 1 línea + "Entendido" | Primera visita a una vista con acción no obvia | Primera vez en Caja: ancla en "Cerrar caja" → "Al final del día cerrá la caja acá; te queda el resumen guardado" |
| **Tooltip** | Hover/focus/long-press, instantáneo | SIEMPRE en icon-only y candados de rol | Toggle densidad de grilla (hoy: ícono ↓↑ mudo — bug) |
| **Hint inline de dato** | `HelpCircle` 16px junto a un término | Términos de dominio con lógica detrás | "Seña" en settings: "Porcentaje que el jugador paga online para confirmar" |
| **Primera-vez espectral** | Ejemplo fantasma no interactivo (opacity 50 % + label "ejemplo") | Vistas de datos incomprensibles vacías | Reportes sin datos: KPIs de ejemplo grisados + "Así se verá tu mes cuando cargues reservas" |

### 7.3 Anatomía del coachmark

`bg-card border shadow-lg rounded-lg p-3 max-w-[260px]` + flecha al target + `text-sm` +
botón ghost "Entendido". Foco atrapado NO (se puede ignorar y seguir). Analytics: emitir evento
al mostrarse y al descartarse (mide qué guía sirve).

### 7.4 Tooltips como sistema

Radix `Tooltip` (agregar a `ui/` si falta): delay 300ms hover, inmediato en focus. Obligatorio en:
botones icon-only, candados de rol, íconos de estado ambiguos, botones deshabilitados (¿por qué no
puedo? — "Conectá MercadoPago para activar señas").

---

## 8. Contenido y formato es-AR

La v1 no normaba contenido y el resultado está en producción: tres formatos de plata en un mismo
flujo (`$ 100` → `$50,00` → `$ 100,00`), fechas ISO cara al usuario (`Caja — 2026-07-01`,
`2026-07-03` en la confirmación del jugador) y "Revenue hoy" en el dashboard. Esta sección es
**normativa y bloqueante** en code review.

### 8.1 Voz

- **Voseo rioplatense** siempre: "Reservá", "Cargá", "Tenés". Nunca tuteo ni usted.
- Admin: operativo y directo ("Cobrar deuda", "Cerrar caja"). Player: cercano sin caretear ("Tenés 2 turnos por jugar", "Mostrá este código al llegar").
- Anglicismos PROHIBIDOS en UI: Revenue → **Ingresos** · Dashboard → **Inicio** · Booking → **Reserva** · Balance → **Saldo** · No-show → **Ausente** (en UI; el término técnico vive en código/docs). Excepciones de marca: MercadoPago, email, link, online.

### 8.2 Plata (ARS, centavos internos → presentación única)

Helper único `formatMoney` (Intl es-AR). Formatos permitidos:

| Contexto | Formato | Ejemplo |
|---|---|---|
| Player + grilla + listados (montos enteros) | `$ 12.500` sin decimales | Precio turno, seña |
| Caja / cierres / reportes (contable) | `$ 12.500,00` | Movimientos, totales del día |
| Compacto SOLO en charts | `$ 12,5 mil` | Ejes |

Miles con punto, coma decimal, espacio fino tras `$`. Negativos: `−$ 1.500` con `text-destructive`
y signo (no color solo). Nunca "ARS", nunca "$100" pegado, nunca decimales en player.

### 8.3 Fecha y hora (UTC interno → ART presentación)

| Contexto | Formato | Ejemplo |
|---|---|---|
| Relativo (≤ 2 días) | prefijo relativo + hora | "Hoy 18:00", "Mañana 21:00" |
| Corto (chips, celdas) | `eee d MMM` | "vie 3 jul" |
| Medio (cards, headers) | `eee d 'de' MMMM` | "mié 1 de julio" |
| Largo (confirmaciones) | `eeee d 'de' MMMM` | "viernes 3 de julio" |
| Rango horario | en-dash sin espacios | "17:00–18:00" |

Hora SIEMPRE 24h `HH:mm`. **ISO (`2026-07-03`) prohibido cara al usuario** — solo en URLs/APIs/e2e.
Día operativo: los slots post-medianoche muestran la fecha de la NOCHE a la que pertenecen, con
sufijo claro cuando haga falta ("sáb 4 · 01:00 (noche del vie 3)").

### 8.4 Otros

- Teléfonos: `+54 9 11 1234-5678` (agrupado, clickeable `tel:`).
- Números: miles con punto (`1.250 reservas`).
- Mayúsculas: sentence case en todo (títulos, botones, labels). ALL CAPS solo en microlabels de 1–2 palabras con `tracking-wide` (labels de KPI, "HORARIOS").

### 8.5 Vocabulario canónico de estados (UI)

`pending_payment` → **"Esperando seña"** · `confirmed` → **"Confirmada"** · `completed` →
**"Jugada"** · `no_show` → **"Ausente"** · `canceled_*` → **"Cancelada"** · court `offline` →
**"Pausada"**. Un término por estado en TODA la app (admin y player dicen lo mismo → se entienden
por teléfono).

---

## 9. Psicología aplicada — leyes como reglas del sistema

No decoración intelectual: cada ley acá tiene una regla dura y su aplicación concreta.

| Ley | Regla TurnoGol | Aplicación concreta |
|---|---|---|
| **Hick** (más opciones = más lento) | Máx 5–7 opciones simultáneas de igual jerarquía; el resto se pliega | Day-picker muestra 7 días, no un mes. Caja: 1 botón "Agregar movimiento" que abre tipo/categoría, no 6 botones sueltos. Filtros de explorar: 4 chips rápidos + drawer "Todos" |
| **Fitts** (blanco grande y cerca = rápido) | Acción primaria mobile: full-width, zona del pulgar. En listas, la fila entera es el blanco | CTA "Pagar seña y reservar" full-width bottom. Slot de grilla completo clickeable, no un botoncito interno |
| **Von Restorff** (lo distinto se ve) | UNO distinto por vista; el estado que exige acción es el distinto | En la grilla del día, "Esperando seña" (warning) es lo que salta — es lo único que Rodrigo debe perseguir. La reserva nueva por Realtime pulsa una vez (§5.3) |
| **Miller / chunking** (memoria de trabajo ≈ 4±) | Información en grupos de 3–4 | Detalle de reserva: QUIÉN / CUÁNDO / PLATA en 3 bloques. Onboarding: 4 pasos, no 12 campos |
| **Jakob** (la gente vive en otras apps) | Patrones de ecommerce conocidos en el player; patrones de agenda/caja conocidos en admin | Checkout = resumen + método + CTA único (como PedidosYa). Grilla = agenda semanal (como el cuaderno que ya usaba) |
| **Goal gradient** (progreso visible acelera) | Todo proceso multi-paso muestra progreso con arranque regalado | Checklist de setup arranca en 57 % ("Cuenta creada" ya tildada). Onboarding "Paso 1 de 4 · 25 %" |
| **Zeigarnik** (lo inconcluso tira) | Lo pendiente deja marca visible y clickeable | Badge numérico en "Reservas" (pendientes de seña) en el sidebar. Checklist visible hasta 7/7 |
| **Peak-End** (se recuerda el pico y el final) | Invertir diseño/motion en el pico y el cierre de cada viaje | Pico jugador: "¡Reserva confirmada!" con celebración (§5.3) + QR. Cierre admin: "Cerrar caja" termina en resumen verde del día, no en un form mudo |
| **Aversión a la pérdida** | Mostrar lo que se pierde, honesto — NUNCA escasez inventada | "Quedan 2 horarios esta noche" (solo si es verdad, calculado). Cancelación: "Perdés la seña de $ 5.000" antes de confirmar |
| **Prueba social** | Números y voces reales, nunca placeholders truchos | Login staff: quote de cliente real. Perfil de complejo: rating + cantidad de reservas del mes ("+120 reservas este mes") |
| **Serial position** (primero y último se recuerdan) | Nav ordenada por frecuencia; lo crítico primero o último, nunca en el medio | Sidebar: Grilla arriba (uso diario), Configuración al final. En modales: CTA primario abajo-derecha SIEMPRE |

**Cláusula ética:** estos mecanismos empujan a completar lo que el usuario YA quiere hacer. Prohibido
usarlos para dark patterns (escasez falsa, culpa en cancelación, opt-out escondidos). Somos la
herramienta de confianza del complejo, no un casino.

---

## 10. Accesibilidad (baseline AA)

- Texto normal ≥ 4,5:1; texto grande/UI ≥ 3:1 — **en ambos temas**, con los números de §2.4 (no de memoria).
- Focus visible: `focus-visible:ring-2 ring-ring ring-offset-2` (offset usa `--background`).
- Touch ≥ 44px en mobile (cascada `h-11 md:h-10` ya en primitives).
- Skip-to-content en todo layout.
- Errores de form: `role="alert"`; toasts `aria-live="polite"`; cambios de grilla Realtime anuncian con `aria-live` en un live-region del contenedor.
- Nada comunica solo con color (§1.4): estado = color + ícono/texto; posición constante (borde-l de slots).
- Teclado: tab order = orden visual; grilla navegable con flechas (roving tabindex); Escape cierra capas en orden.
- `prefers-reduced-motion`: contrato global ya en `globals.css` — cualquier animación nueva debe verse bien congelada.
- Íconos decorativos: `aria-hidden`; informativos: label.

---

## 11. Anti-patterns

| ❌ No | ✅ Sí |
|---|---|
| Emoji como ícono estructural | Lucide |
| Hex/clases de color crudas en primitives (`bg-white`, `border-slate-200`) | Tokens semánticos (§6.1) |
| `text-emerald-600` para texto normal sobre claro (3,8:1) | `text-emerald-700` en cards / `-800` en fondo de página (§2.4) |
| CTA `bg-emerald-600` + blanco 14px | Light `bg-emerald-700`+blanco · dark `bg-emerald-500`+slate-950 |
| `emerald-500` como texto (2,5:1) | Solo acentos no-textuales (glows, bordes) |
| Placeholder como label / placeholder que trunca | Label visible + ejemplo que cabe |
| Icon-only sin tooltip ni aria-label | §7.4 |
| ISO dates / "Revenue" / 3 formatos de plata | §8 completo |
| Glass/translucidez en light | Light = elevación; glass solo dark (§4.3) |
| Neutralizar color semántico en dark (finanzas, estados) | Preservar hue con par `dark:` o token dual |
| Hex inline en charts (no flipan con `.dark`) | `useChartTheme` / CSS vars |
| Tour modal de bienvenida multi-paso | Guided UX en contexto (§7) |
| Toast "1 error" / errores mudos | Qué falló + qué hacer (§6.7) |
| Escasez inventada, culpa, dark patterns | Cláusula ética §9 |
| Animación decorativa en vistas de tarea | Presupuesto §5.2 |
| `bg-white` como fondo de página | `bg-background` (el fondo NO es blanco en ningún tema) |
| `text-black` / `bg-black` | Tokens (`foreground`, `slate-950` vía token) |
| KPIs con formato propio por vista | `StatCard` único (§6.4) |

---

## 12. Checklist pre-delivery

**Ambos lados**
- [ ] Colores solo vía tokens; cero hex en JSX; primitives sin clases light hardcodeadas
- [ ] Probado en light **y** dark (toggle real, no solo el tema en que desarrollaste)
- [ ] Contraste verificado contra §2.4 (no "me parece que se lee")
- [ ] `tabular-nums` en todo número; plata/fechas por helpers §8
- [ ] Labels visibles; errores debajo del campo; `isLoading` en async
- [ ] Focus ring visible; touch 44px; sin scroll horizontal a 375px
- [ ] Estados: loading (skeleton con silueta), empty (didáctico), error (accionable)
- [ ] `prefers-reduced-motion` no rompe nada
- [ ] Copy en voseo, vocabulario §8.5, cero anglicismos §8.1

**Admin**
- [ ] Tarea principal de la vista completable en ≤ 3 interacciones desde el load
- [ ] Densidad respetada (sin aire decorativo en tablas/grilla)
- [ ] Ítems bloqueados por rol: candado + tooltip, no desaparición
- [ ] KPI = `StatCard`; cabecera = `PageHeader`
- [ ] Motion ≤ 200ms

**Jugador**
- [ ] Una idea por pantalla; CTA primario único full-width en mobile
- [ ] Precio y estado de seña visibles ANTES del CTA de pago (cero sorpresas)
- [ ] Microcopy de confianza en pasos de plata ("Te llevamos a MercadoPago…")
- [ ] Continuidad post-acción: nunca pantalla huérfana sin "Ver mis reservas / Seguir explorando"
- [ ] Peak-end: confirmaciones con momento de celebración (una vez)

---

## 13. Estado del sistema — deuda conocida (auditoría 2026-07-02)

El doc anterior divergió del código y perdió autoridad. Para que no se repita: esta sección lista
**dónde el código viola este MASTER hoy**. Al cerrar un ítem, borrarlo de acá.

### P0 — sistema (bloquean la coherencia)
1. **Primitives sin tokens** (14/16 en `ui/`: button, input, badge, dialog, toast, etc. con clases light hardcodeadas y 0 `dark:`) → §6.1. Migrar al tocar cada uno; empezar por `button` y `badge` (los más visibles; `button` sigue con `bg-emerald-600` hardcodeado en vez de `bg-primary`, ya corregido a nivel token). Nota: `tooltip.tsx` (2026-07-02) nace tokenizado — es el patrón a seguir.
2. **Formato de contenido inconsistente**: `$ 100` / `$50,00` / `$ 100,00` en el mismo flujo; `Caja — 2026-07-01` y `2026-07-03` (éxito jugador) en ISO → §8. Fix: helpers `formatMoney`/`formatDate` únicos + barrida (el dashboard ya migró a `formatArs` de `lib/format` — 2026-07-02; "Revenue hoy" murió con el rediseño de Inicio).

### P1 — vistas
3. **Reportes**: KPIs con formato propio (no `StatCard`), vacío gigante sin empty state didáctico ni ejemplo espectral → §6.4, §7.2.
5. **Landing mobile**: header desborda a la derecha (Ingresar cortado), valor de fecha trunca ("01/0..."), toast "1 error" → §6.3, §6.7.
6. **Coherencia de journey de tema**: `(public)/layout.tsx` fuerza dark con `<div className="dark">` (además `color-scheme` queda light → controles nativos/scrollbars inconsistentes), mientras `(player)` y `reserva/` son theme-adaptive. Un jugador en light salta dark→light dentro del mismo flujo. **REQUIERE INPUT (decisión de producto):** (a) público theme-adaptive completo [recomendada: el rediseño 2026-06-26 ya pagó el costo], o (b) público always-dark como identidad — entonces usar `forcedTheme` de next-themes y asumir el salto. Siempre-dark queda confirmado SOLO para marketing B2B (`para-complejos`).

### P2 — polish
8. Teléfonos sin formato (`+541100000000` en página de complejo) → §8.4.
9. Foto stock del login staff con marcas visibles (pelotas Nike) — reemplazar por foto propia/sin trademark.
10. Docs `doc20`/`pages/*`: actualizar referencias cruzadas a esta v2 (player-area §0–1 superado, explorar hero adaptativo).

Cerrados 2026-07-02: CTA fuera de AA (token `--primary` dual), token `--info`, rediseño de grilla
(spec nueva `pages/grilla.md`: estados §2.6, densidad, colapso de madrugada, scroll-to-now, pulso
Realtime §5.3, tooltips §7.4, vocabulario §8.5), rediseño de Inicio (spec nueva
`pages/dashboard.md`: KPIs semáforo §2.5, "Revenue hoy" → "Caja de hoy", checklist compacta
Zeigarnik, próximos turnos), rediseño de horarios y precios (spec nueva
`pages/horarios-precios.md`: horario general + excepciones por día con toggle Cerrado —fix del
schema que despojaba `closed`—, plantilla rápida de precios en 3 modos + copiar de otra cancha +
resumen legible, matriz plegada como ajuste fino, muerte de DEFAULT_RULES y del `formatArs` local),
rediseño de Caja (spec nueva `pages/caja.md`: KPIs a `StatCard` con delta `tone` para métricas
invertidas, cierre peak-end §9 —diálogo no-destructivo + CierreCard verde—, coachmark de primera
visita `tg-hint-caja-cierre` [ex P2.8], chips en vez de selects en el modal de movimiento,
`formatArsContable` único §8.2 —mueren 3 `formatARS` locales—, hora 24h forzada `hourCycle h23`,
fecha humana en vez de ISO, label de `abonado_payment` que llegaba crudo a la UI), rediseño del
onboarding wizard [ex P1.7] (spec nueva `pages/onboarding.md`: rail de marca con lista de pasos =
indicador único §9, creación de canchas + precios inline —doc10 siempre lo pidió—, horarios
general+excepciones compartidos con settings via `ScheduleFields`, `horariosSchema` canónico en el
wizard —muere el scheduleSchema local que rechazaba sus propios defaults—, cierre peak-end
`/onboarding/listo` con WhatsApp share, el callback MP activa `requires_deposit` solo en flujo
wizard, placeholders que caben §6.3 y preview de URL veraz `/c/slug`), rediseño de Reservas
(spec nueva `pages/reservas.md`: tooltips en toggles de vista y menú contextual [cierra P1.4],
badge de estado único ícono+texto §6.5/§8.5 compartido entre lista y detalle
(`status-visual.tsx`, muere el `STATUS_VISUALS`/`STATUS_LABELS` duplicado), fila completa
clickeable con Link estirado (Fitts) + `hover:bg-accent/50`, CTA y píldoras a `bg-primary`,
empty state con CTA "Cargar una reserva", `formatArs`/`formatDateLong` únicos —mueren 4
`formatARS`/`formatDate` locales en `[id]/*`—, skeleton con silueta real).

---

*Mantenimiento: este archivo se versiona con cada cambio de reglas (no de deuda). Cambios de
paleta/tokens exigen actualizar `globals.css` + `tailwind.config.ts` en el mismo PR y re-verificar
§2.4 con medición real, no de memoria.*
