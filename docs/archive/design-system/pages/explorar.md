# /explorar — "Matchday" (page override)

> **Override de `MASTER.md` y refuerzo de `player-area.md`** para la vista `/explorar`
> (`src/app/(public)/explorar/*`). Donde esta página defina una regla, **prevalece**.
> Para todo lo no cubierto, aplica `player-area.md` y luego `MASTER.md`.
>
> **Spec de diseño**: `docs/superpowers/specs/2026-06-23-explorar-redesign-matchday-design.md`
> **Generado**: 2026-06-23

Esta página documenta la identidad visual de `/explorar`. El detalle de arquitectura,
componentes y criterios de aceptación vive en el spec de diseño enlazado arriba.

---

## 1. Concepto: "Matchday"

`/explorar` es donde el jugador elige **dónde jugar hoy**. Debe tener la energía del
pre-partido, no el frío de un directorio SaaS. La identidad se enraíza en el mundo real
del subject: cancha de fútbol argentina, líneas de cal, marcador.

**Firma (la única cosa memorable):** *la cancha como sistema visual* — **líneas de cal**
(pitch lines, finas) como recurso estructural + **tipografía de marcador** para titulares
y números clave. Todo lo demás queda quieto, claro y brillante (espíritu Airbnb/ML del
portal del jugador). La audacia se gasta en un solo lado.

---

## 2. Tipografía (extensión de MASTER §2)

- **Body / UI:** Inter (sin cambios — consistencia con todo el sistema).
- **Display (NUEVO):** **Archivo** (Google Fonts, variable). Grotesca técnica/señalética
  para: hero de la banda de búsqueda, `h1`/`h2` de la página y el **numeral de precio** de
  la card. Clase Tailwind `font-display`.
- **Disciplina:** `font-display` SOLO en hero + títulos de sección + precio de card. La
  data densa (direcciones, contadores, horas, montos en tablas) sigue en Inter con
  `tabular-nums`. No se introduce un segundo tipo tabular en columnas de datos.

---

## 3. Color (extensión mínima de MASTER §1)

No se inventa paleta. Solo se suma el motivo de líneas y se reusa emerald/slate.

| Rol | Token | Uso |
|-----|-------|-----|
| Primario | `emerald-600` | CTAs, links, texto AA en blanco (sin cambios) |
| Superficie hero | `emerald-50` / `emerald-100` | banda de búsqueda clara y brillante |
| Líneas de cal (hero) | `emerald-600/15`–`/25` | motivo decorativo sobre la banda clara — nunca texto |
| Numeral de precio | `emerald-700` | precio de card en blanco (AA), `font-display` |
| Acento línea de card | `emerald-500` | borde superior 2px de la card (decorativo, no texto) |
| Neutros | slate (sin cambios) | bg `slate-50`, cards `white`, bordes `slate-200`, texto `slate-900/500` |

**Prohibiciones heredadas (vigentes):** nunca `emerald-500` para texto sobre blanco
(falla AA); nunca cabecera oscura de página (`player-area.md` §1) — la banda hero es
**clara**; `PortalHeader` no se toca.

---

## 4. Reglas específicas de la vista

- **Banda de búsqueda (hero claro):** superficie `emerald-50/100` con motivo de líneas de
  cal (SVG/CSS, sin imágenes). Titular en `font-display`. Se **condensa al scrollear** a
  una barra sticky compacta (los resultados mandan).
- **Filtros híbridos:** barra de **chips rápidos** sticky arriba (formato F5/F7/F11,
  superficie, techado, online, precio) en todos los viewports + **sidebar completo** solo
  en desktop ancho (`lg+`) + drawer "Todos los filtros" en mobile. Un solo mental model.
- **Card:** foto protagonista con overlays mínimos (solo badge "Reservá online" +
  favorito). Precio y rating **salen de la foto** al body con jerarquía real. Chips de
  **formato** protagonistas (es lo primero que decide un jugador). Borde superior 2px
  emerald = línea de cal (firma sutil).
- **Mapa:** **split view** lista + mapa lado a lado en desktop (lista con card compacta);
  en mobile, toggle pantalla-completa con FAB "Ver lista".
- **Estados:** vacío con ilustración de líneas de cal + reset; skeleton al card/grid nuevo.

---

## 5. Checklist de implementación (visual)

- [ ] `font-display` (Archivo) cableada en `layout.tsx` + `tailwind.config.ts`; usada solo
      en hero/títulos/precio.
- [ ] Banda hero clara (nunca oscura); motivo de líneas vía CSS/SVG (sin imágenes).
- [ ] Chips de filtro sticky + sidebar desktop + drawer mobile; estado activo visible.
- [ ] Card: precio (`font-display`, `emerald-700`) y rating en el body; foto con máximo 2
      overlays; chips de formato prominentes; borde superior 2px.
- [ ] Map split view (desktop) / toggle+FAB (mobile); pins y popup conservados.
- [ ] Estados vacío/loading actualizados.
- [ ] AA en todos los textos; foco visible emerald; `prefers-reduced-motion` respetado;
      touch ≥44px; sin scroll horizontal en 375px.
- [ ] `tabular-nums` en precios/horas/contadores; URL-driven filters preservado (SSR).
