# Diseño — Dark mode del jugador/público (con base para light toggle)

**Fecha:** 2026-06-25
**Estado:** Aprobado (diseño) — pendiente plan de implementación
**Alcance:** Vistas de jugador + públicas. Panel admin/staff fuera por ahora.

## 1. Problema

El rediseño "dark premium" del home se propagó a varias vistas del jugador **a medias**: las páginas focus (home, reservar, éxito, ingresar) quedaron full dark, pero las páginas de "app" del jugador (mis-reservas, perfil, configuración) quedaron con banda dark + contenido claro. La app se siente inconsistente con el tema.

Causa raíz: el rediseño metió color oscuro con **hex inline** (`style={{ background: '#020617' }}`, `rgba(...)`) en vez de usar los tokens semánticos que ya existen. El hex inline **no se puede togglear**: un futuro switch light/dark no tiene de dónde agarrarse.

Hay 84 ocurrencias de hex dark en 24 archivos. `tailwind.config.ts` ya tiene `darkMode: ['class']` y `globals.css` define tokens en `:root`, pero **solo con valores light** y sin bloque `.dark`.

## 2. Objetivo

1. **Fase inmediata:** dejar las vistas de jugador + públicas **completamente en dark**, de forma consistente.
2. **Fase posterior:** sumar un **toggle light/dark** que funcione sin retrabajo.

La clave es hacer (1) sobre una base de **tokens semánticos** para que (2) salga casi gratis y nada del trabajo dark se tire.

## 3. Decisiones tomadas (forks resueltos)

| Decisión | Elección | Razón |
|---|---|---|
| Base técnica | **Token-first** (CSS vars + `.dark` + next-themes) | Dark = tema default; light después sin re-tokenizar |
| Alcance del toggle | **Híbrido** | Hero/marketing/focus siempre dark; superficies de "app" toggleables |
| Fondo del portal dark | **Cancha recoloreada** | Mantiene el motivo cancha; recoloreo del SVG inline, sin asset nuevo |
| Panel admin | **Fuera por ahora** | Ya es oscuro (`shell-bg`); se togglea más adelante, no se rediseña ahora |

## 4. Arquitectura: tokens semánticos

### 4.1 Mecanismo

Componentes usan **clases de token** (`bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, …) — **cero hex**. El tema lo determina la presencia de la clase `.dark` en un ancestro (`darkMode: ['class']` ya configurado). next-themes (fase final) pone/saca esa clase en `<html>`.

```css
:root  { --background: 0 0% 100%;  --card: 0 0% 100%;  ... }   /* LIGHT */
.dark  { --background: 224 71% 4%; --card: 222 33% 9%; ... }   /* DARK  */
```

### 4.2 Paleta dark propuesta (punto de partida, se afina en implementación)

Valores HSL (formato que ya usa `globals.css`):

| Token | Light (actual) | Dark (propuesto) | Nota |
|---|---|---|---|
| `--background` | `214 25% 91%` | `224 71% 4%` | #020617 slate-950 |
| `--foreground` | `224 71% 4%` | `210 40% 98%` | slate-50 |
| `--card` | `0 0% 100%` | `222 33% 9%` | superficie elevada ~#0d1424 |
| `--card-foreground` | `224 71% 4%` | `210 40% 98%` | |
| `--popover` / `-foreground` | `0 0% 100%` / `224 71% 4%` | `222 33% 9%` / `210 40% 98%` | |
| `--primary` | `161 94% 30%` | `161 94% 30%` | emerald-600 (legible en dark) |
| `--primary-foreground` | `0 0% 100%` | `0 0% 100%` | |
| `--secondary` | `214 32% 85%` | `217 33% 14%` | nested surface |
| `--secondary-foreground` | `222 47% 11%` | `210 40% 98%` | |
| `--muted` | `214 32% 85%` | `217 33% 14%` | |
| `--muted-foreground` | `215 20% 40%` | `215 20% 65%` | más claro p/ legibilidad dark |
| `--accent` | `214 32% 85%` | `217 33% 17%` | hover bg |
| `--accent-foreground` | `222 47% 11%` | `210 40% 98%` | |
| `--destructive` | `0 72% 51%` | `0 72% 51%` | |
| `--border` / `--input` | `214 32% 83%` | `217 33% 17%` | borde sutil sobre dark |
| `--ring` | `160 84% 39%` | `160 84% 39%` | emerald-500 |
| `--success` / `--warning` | (igual) | hue igual, `-foreground` blanco | |

Tokens nuevos: ninguno estrictamente necesario para los componentes (usan los existentes). El shell se maneja con reglas CSS dedicadas (§6), no con tokens nuevos.

## 5. Split híbrido: always-dark vs toggleable

El split se resuelve **por layout group** (no per-page), porque `(public)`, `(player)` y `reserva` envuelven todo en `PortalShell` (header + `.player-shell-bg` + footer). El force-dark se aplica al layout, no a cada página.

| **Always-dark** (layout forzado dark) | **Toggleable** (light/dark via tokens) |
|---|---|
| `app/page.tsx` (home, header propio overlay) | `(player)/mis-reservas` |
| **`(public)/*`** → explorar (+cards/mapa), `[slug]` (+CourtCard), `[slug]/reservar` (+LoginGate, BookingSummary), `privacy`, `terms`, `suspended` | `(player)/perfil` (+ subcomponentes) |
| **`reserva/*`** → `{exito,pendiente,error}` | `(player)/configuracion` (+ DataExportButton) |
| `(auth)/ingresar`, `(auth)/verify` (layout bare, self-dark) | `(player)/eliminar-cuenta` (+ form) |
| | chrome compartido: PortalHeader, SiteFooter, PortalFrame, PlayerBottomNav (tokenizados; dark vía wrapper o tema) |

Nota: privacy/terms/suspended pasan a always-dark (son legal/marketing → encaja con "marketing siempre dark"). `(business)/para-complejos` ya es dark con header/footer propios (BusinessHeader/Footer) → fuera del esfuerzo activo.

### 5.1 Mecanismo force-dark (a nivel layout)

`(public)/layout.tsx` y `reserva/layout.tsx` envuelven su contenido en `<div className="dark">`. Como Tailwind matchea el `.dark` ancestro, **todo** lo que vive adentro —incluido el `PortalShell` tokenizado (header/shell/footer)— renderiza dark, aunque el usuario prenda light global. `(player)/layout.tsx` NO se envuelve → su `PortalShell` sigue el tema. Es el mismo componente `PortalShell` instanciado en contextos de tema distintos.

Durante F0–F2 hay `.dark` fijo en `<html>` (todo dark); los wrappers de layout son redundantes pero idempotentes. En F3 se retira el `.dark` de `<html>` (lo maneja next-themes) y los wrappers quedan haciendo el trabajo de blindaje.

### 5.2 Casos puente (importantes)

- **`TenantCard`** aparece en `/explorar` (always-dark) **y** en `FavoritesList` dentro de `/perfil` (toggleable). Solución: la tarjeta usa **tokens** → en `/explorar` el wrapper `.dark` del layout la fuerza dark; en favoritos sigue el tema. Un solo componente, dos contextos.
- **`PlayerHeroBand`** es una banda dark que se usa **arriba de** páginas toggleables (perfil/config). Queda como **isla always-dark** (momento de marca): mantiene su hex/estética dark; el contenido debajo togglea. No se tokeniza la banda.

## 6. Shell del portal (cancha recoloreada)

`.player-shell-bg` hoy = `emerald-50` + SVG de cancha (`stroke #059669 @ 0.15`) + gradiente. Como no se puede meter una CSS var dentro de un `url(data:...)`, se usan **dos reglas completas**:

- `.player-shell-bg` (base = **light**): el actual (emerald-50 + cancha @15%).
- `.dark .player-shell-bg` (= **dark**): `#020617` + mismo SVG con stroke esmeralda a baja opacidad (~6%) + glow blob sutil.

Como dark es el default (html con `.dark` desde F0), el usuario ve dark; al togglear a light se quita `.dark` y aplica la regla base.

`.skeleton` ya usa `hsl(var(--muted))` / `hsl(var(--secondary))` → **flipa solo** cuando `.dark` está activo. Los loadings dark hand-rolled (`bg-white/[.06]`) que se hicieron en el rediseño se pueden revertir a `Skeleton` como limpieza (no bloqueante).

## 7. Fases

**F0–F2 = "terminar dark" (pedido inmediato). F3 = el toggle ("después").**

### F0 · Fundación (invisible para el usuario)
- Agregar bloque `.dark { ... }` en `globals.css` con la paleta dark (§4.2).
- Reescribir `.player-shell-bg` a dos reglas (§6).
- Aplicar `.dark` fijo en `<html>` (root layout) → dark = default, **sin toggle todavía**.
- Resultado: lo que ya usa tokens flipa solo; queda visible qué falta convertir.

### F1 · Superficies de app → tokens + dark
Convertir hardcode claro a tokens (`bg-white→bg-card`, `text-slate-900→text-foreground`, `border-slate-200→border-border`, `text-slate-500→text-muted-foreground`, `bg-slate-50→bg-muted`, etc.) en:
- `(player)/mis-reservas/page.tsx`
- `(player)/perfil/page.tsx` + `ProfileForm.tsx`, `ActivityStats.tsx`, `NotificationPrefs.tsx`, `FavoritesList.tsx`
- `(player)/configuracion/page.tsx` + `DataExportButton.tsx`
- `(player)/eliminar-cuenta/page.tsx` + `DeleteAccountForm.tsx`
- loadings: `(player)/{perfil,configuracion}/loading.tsx`
- chrome: `components/site/PortalHeader.tsx`, footer, `PlayerBottomNav.tsx`, `PortalFrame.tsx`
- `TenantCard.tsx` (puente, §5.2)

Esto elimina el "a medias".

### F2 · Blindar always-dark (a nivel layout)
- Envolver el contenido de `(public)/layout.tsx` y `reserva/layout.tsx` en `<div className="dark">`.
- `(auth)` ya es self-dark (layout bare); home tiene header propio overlay (ya dark).
- Verificar que el `PortalShell` tokenizado (header/shell/footer) quede dark en esos layouts.
- Redundante mientras `<html>` tiene `.dark` (F0), pero deja el blindaje listo para F3.

### F3 · Toggle light
- Instalar `next-themes`. `ThemeProvider` en root layout: `attribute="class"`, `enableSystem`, `defaultTheme="system"`, `suppressHydrationWarning` en `<html>`.
- **Reconciliación del default:** en F0–F2 `.dark` está fijo en `<html>` (sin toggle, dark forzado). Al activar F3, ese `.dark` fijo se retira y lo maneja next-themes con default **Sistema**: primera visita sigue la preferencia del SO. Las always-dark quedan dark siempre por el wrapper, independiente del tema global.
- Control de toggle **3 estados: Sistema / Claro / Oscuro** (default = Sistema → respeta la preferencia del SO; `enableSystem`). En menú del jugador / configuración.
- Valores light ya viven en `:root` desde F0 → el toggle "simplemente funciona" en las superficies toggleables; las always-dark quedan dark por el wrapper.
- Anti-FOUC cubierto por el script inline de next-themes.

## 8. Testing

- **Unit existentes:** chequean copy/roles/headings, no color → sobreviven. Verificar tras cada fase.
- **e2e:** headings con match case-insensitive substring → no se rompen por cambio de color.
- **F3:** test e2e opcional que togglea tema y verifica que `<html>` cambia de clase + que una superficie toggleable cambia de fondo, y que una always-dark NO cambia.
- Correr `pnpm typecheck` después de cada cambio (regla del proyecto).

## 9. Riesgos

- **Contraste de texto:** `text-slate-400/500` sobre dark puede quedar bajo; mapear a `text-muted-foreground` y revisar AA.
- **Componentes shadcn/ui:** ya usan tokens → flipan gratis (bonus, pero verificar que ninguno asuma fondo claro).
- **Force-dark en chrome compartido:** si una página always-dark olvida el wrapper, el header tokenizado se vería light al togglear (en F3). Checklist por página en F2.
- **FOUC:** solo posible en F3; mitigado por next-themes. En F0–F2 dark es fijo.

## 10. Fuera de alcance

- Panel admin/staff (ya oscuro; se togglea en un esfuerzo posterior).
- Páginas auth de staff (`login`, `register`, `forgot-password`, `reset-password`).
- Rediseñar un light variant de las páginas hero/focus (quedan always-dark).
- 3er tema / personalización de acento.
