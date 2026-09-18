# Plan de diseño — sacarle lo genérico a TurnoGol

**Fecha:** 2026-09-17 · **Estado:** propuesta, sin ejecutar · **Dueño de la decisión:** Lazar
**Origen:** el dueño ve "toda la app tipo diseño IA, sin onda". Auditoría visual sobre capturas
(`.design-sync/handoff/2026-09-11/capturas/`, baselines de `tests/e2e/visual/`) y sobre el código.

## 0. Diagnóstico en una frase

La app no tiene una voz: tiene la plantilla shadcn/v0 entera más diez variantes de cada cosa.
Lo genérico no es falta de "onda", es falta de decisión: cuando todo es card, todo lleva sombra
y todo tiene ícono, nada manda. El ojo no engaña.

Medido el 2026-09-17:

| Señal | Valor |
| --- | --- |
| `<button>` crudos fuera de `ui/` vs archivos que importan `<Button>` | ~279 vs 26 |
| Recetas visuales distintas de CTA | ~10 (hay violeta, gradiente teal, `green-700`, dashed) |
| Radios en uso | 8 valores repartidos parejo (lg 366 · full 267 · xl 205 · md 183 · 2xl 104 · 3xl 24) |
| `text-emerald-*` crudo (no token) | 660 |
| Lift/sombra al hover, blur, gradientes | 109 usos |
| Texto con degradé o glow | 45 usos (`hero-accent-text` en 8 archivos) |
| Banda de header con ícono (`page-header-band`) | 12 archivos |
| `card-premium` | 62 archivos |

## 1. Qué se ve, pantalla por pantalla

| Pantalla | Qué hay hoy | Por qué se lee genérico | Cambio |
| --- | --- | --- | --- |
| Shell admin | Fondo con gradiente (`shell-bg` + `content-area-gradient`); sidebar con dos cards grises apiladas (COMPLEJO / HOY $ 0) con micro-labels en mayúscula; topbar con email en píldora, ícono en caja y "Salir" | El fondo "con vida" y las cards dentro del sidebar son la firma de toda plantilla de dashboard | Fondo plano de un tono; sidebar sin cards: nombre del complejo como texto; el total del día vive en el topbar o en Hoy, no en el menú |
| Header de página | Banda con gradiente + ícono en cuadrado tintado + título + subtítulo. En mobile ocupa un cuarto de la pantalla | El ícono no informa nada; la banda es decoración | `h1` + subtítulo + acciones a la derecha. Sin banda, sin ícono |
| Hoy | Checklist con cohete en halo; 3 StatCards con ícono arriba a la derecha; "Necesita tu atención" con dos botones primarios | StatCard-con-ícono-en-la-esquina es EL patrón de plantilla; dos primarios = ninguno | StatCard = número + label + delta, sin ícono. Un primario por bloque, el resto outline |
| Grilla desktop | Celdas vacías con borde y "+" centrado; ocupadas con fondo tintado entero; dos botones de header con tratamientos distintos; sub-tabs Calendario/Reservas debajo del sidebar; línea "ahora" roja con punto | Lo vacío grita y lo ocupado no; nav duplicada; el rojo de "ahora" compite con el rojo de "sin cobrar" | Vacío = solo retícula, "+" en hover/focus. Ocupado = barra lateral de 3 px por estado + texto, fondo blanco. Una línea "ahora" de marca. Sub-tabs mueren o pasan a un toggle de vista |
| Grilla mobile | Cinco filas de chrome antes del contenido (topbar, tabs, título+botones, tira de semana, chips de cancha); slots con borde punteado | La herramienta que se usa 8 h/día no puede pedir cinco filas para empezar | Título y fecha en la misma fila que la tira de semana; chips dentro del scroll; slot vacío = una línea, no una caja |
| Configuración | Tres estilos de chip en la misma pantalla (gris apagado, outline verde, gris claro); inputs con relleno gris cuando el login los tiene blancos con borde; labels en mayúscula con tracking | Cada sección se inventó su control | Un `SegmentedControl`, un `Input`, labels normales |
| Login | Foto stock (pelotas Nike, deuda P2.9), ícono "sparkles" + testimonio con cita, card centrada | Es la pantalla de login de cualquier plantilla; sparkles es el ícono del "slop"; el testimonio cae bajo la cláusula §9 | Color de marca plano o foto propia; sin sparkles; testimonio solo si es real y con nombre verificable |
| Perfil público | Nav flotante glass; card blanca gigante sobre fondo con líneas de cancha; tres pill-buttons outline con ícono seguidos; card de cancha con degradé y un ícono placeholder | Card-sobre-card y tres botones iguales | Las PitchLines son la ÚNICA firma real que tiene el producto: se quedan. Muere la card gigante (el contenido va sobre el fondo). Un primario "Reservar", el resto links |
| Botones | 279 crudos, 10 recetas, sombra + lift al hover en admin | El primitive tiene un look; el 90 % no lo usa | Ver Fases 1-3 |

## 2. Dirección

MASTER §1 ya define dos personalidades (Mostrador / Cancha). El problema es que el código las
implementó con la misma receta. Dirección propuesta:

**Admin, "Mostrador": plano, denso, tipográfico.**

- Fondo de un solo tono con leve sesgo verde. Superficies sin sombra, separadas por borde de
  1 px o por espacio. Sombra solo en lo que flota: menús, diálogos, toasts.
- Verde SOLO en tres lugares: la acción primaria (una por vista), el estado seleccionado, la
  línea "ahora". Nunca como texto de énfasis.
- Estados de reserva (§2.6) como barra lateral de 3 px + texto, no como fondo tintado entero.
- Radios: 8 px controles, 12 px paneles y diálogos, `full` solo chips. Nada más.
- Cero íconos decorativos: un ícono solo si reemplaza una palabra o marca un estado.
- Motion ≤ 150 ms y solo de color. Sin lift, sin glow, sin gradientes.

**Jugador, "Cancha": el dark premium se queda, con las mismas foundations.**

- Firma: PitchLines + Archivo itálica en UN hero por página.
- Mueren `hero-accent-text` y los glows. Una sola fuente de luz por pantalla.

**Referencias para calibrar (ver, no copiar):** Linear (silencio y densidad), la app de
Mercado Pago (jerarquía de plata y un solo color de acción), Google Calendar (cómo lo vacío no
pesa en una grilla).

**Tipografía:** se decide en Fase 0 con la muestra publicada
(https://claude.ai/artifact/EQMxNFoRVmLcrLTK5EzeGm). Si ninguna convence, quedan Inter +
Archivo y se arregla la convivencia: Archivo solo en KPIs y `h1`, Inter para todo lo demás.

## 3. Fase 0 — Decidir mirando: tres direcciones con Claude Design

Antes de tocar código. Es el método "style tile": tres versiones distintas de la MISMA pantalla,
se elige una, y de la ganadora se copian REGLAS (tokens, radios, cómo usa el color), no píxeles.

Cómo: chat de Claude Design **sin** el proyecto de design system sincronizado (o con la
instrucción explícita de no usar los primitives), porque si no devuelve el mismo botón de hoy.

Criterios para elegir (responder sí/no por dirección):

1. ¿Lo vacío desaparece y lo ocupado se ve primero?
2. ¿Se ve qué turno está sin cobrar en un segundo?
3. ¿Hay un solo verde?
4. ¿La reconocerías como TurnoGol sin el logo?
5. ¿Aguanta 16 horas × 4 canchas en 900 px de alto sin scroll?

Prompt listo para pegar:

```
Contexto: TurnoGol, panel de gestión para complejos de fútbol en Argentina. El encargado vive
8 horas por día en la Grilla: una tabla canchas × horas del día. Tareas, por frecuencia:
(1) ver qué turno está libre ahora y en las próximas 2 horas: decenas de veces por día;
(2) ver qué turno está sin cobrar: cada vez que llega alguien;
(3) cargar una reserva en un hueco: 10 a 20 veces por día;
(4) cambiar de día: pocas veces.

Cómo es hoy: sidebar de 240 px con menú y dos cards (complejo, total del día); sub-tabs
Calendario/Reservas; título "Grilla" + fecha + dos botones (densidad, Hoy); tira de semana;
tabla con 4 canchas y 16 horas. Las celdas vacías tienen borde y un "+"; las ocupadas, fondo
tintado por estado (confirmada verde, sin cobrar rojo, pendiente ámbar, torneo violeta) con
nombre y estado. Línea "ahora" roja.

Pedido: 3 direcciones visuales DISTINTAS para esta misma pantalla, 1440×900, con datos reales:
jueves, 4 canchas (una pausada), 60 % ocupada, los 4 estados visibles. Cada dirección incluye
además: la celda ocupada en los 4 estados, el botón primario / secundario / ghost, un KPI de
plata ("$ 847.000 cobrado hoy"). No uses el design system sincronizado: quiero ver
alternativas, no lo que ya tenemos.

Restricciones: lo vacío tiene que pesar menos que lo ocupado; un solo color de acción; sin
gradientes, sin sombras al hover, sin íconos decorativos; densidad alta (16 horas visibles
sin scroll en 900 px); WCAG AA en claro y oscuro; tipografía de Google Fonts. Nada nuevo
funcionalmente: podés reordenar, fusionar o sacar chrome, no inventar datos ni pantallas.

Entregá por dirección: nombre, las 3 reglas que la definen (tipografía, radio, cómo usa el
color), y qué chrome sacaste y por qué.
```

## 4. Fases de ejecución

| Fase | Qué | Dónde | Tamaño | Verificación |
| --- | --- | --- | --- | --- |
| 0 | Tres direcciones, elegir una, fijar tipografía | Claude Design + muestra publicada | 1 sesión, sin código | Los 5 criterios de §3 |
| 1 | **Foundations**: tokens de radio y superficie; recetas decorativas muertas (`page-header-band`, `icon-halo`, `content-area-gradient`, `hero-accent-text`); `Button` sin sombra ni lift, 4 variantes; `StatCard` sin ícono; `PageHeader` sin banda; shell, sidebar y topbar planos; familia tipográfica si cambia | `globals.css`, `layout.tsx`, `ui/button.tsx`, `admin/StatCard.tsx`, `admin/PageHeader.tsx`, `layout/admin-*.tsx` | 1 PR | Storybook a11y claro y oscuro; baselines visuales regeneradas (ya están pendientes) |
| 2 | **Candado**: `no-restricted-syntax` para `<button>` crudo fuera de `ui/`, `rounded-(sm\|2xl\|3xl)`, `bg-gradient-to`, `hero-accent-text`; script ratchet `scripts/design-debt.mjs` con conteos que no pueden subir (mismo espíritu que knip) | `eslint.config.mjs`, `scripts/`, CI | 1 PR chico | El job Lint & Types lo corre |
| 3 | **Migración de botones**: ~135 CTA + ~25 links con look de botón a `<Button>`; ~60 controles a `SegmentedControl` / `RadioChip` (precedente F-007) | Fan-out Sonnet por directorio, paquetes file-disjuntos (como `storybook-stories-fanout`) | 2-3 sesiones | Ratchet a cero; e2e de los flujos tocados |
| 4 | **Las tres pantallas de 8 h/día**: Grilla, Hoy, Cantina. Cada una con el protocolo de rediseño (tabla de tareas con frecuencia, "cómo es hoy" contado, flujo antes/después, lista de resta). Claude Design con primitives re-sincronizados | `.design-sync/` re-sync, un PR por pantalla | 1 PR por pantalla | `verificacion-ux` + baselines |
| 5 | **Lado jugador**: explorar, perfil público, reservar, login. Mismas foundations; sin glows ni texto con degradé; login sin foto stock ni testimonio inventado | `(public)/*`, `(auth)/login` | 1-2 PRs | e2e `@critical` del flujo de reserva |
| 6 | **Cierre**: MASTER v3 con las reglas de §5 y §13 depurado; `pages/*.md` actualizados; recetas muertas borradas de `globals.css`; re-sync del DS | `docs/spec/design-system/` | 1 PR | `audit-docs` |

Orden mínimo que ya cambia la percepción: Fases 0, 1 y 2. Con eso el 80 % del look de plantilla
muere y no vuelve. El resto es barrida.

## 5. Reglas nuevas (van a MASTER v3)

- Un primario por vista; el resto outline o ghost.
- Cero íconos decorativos. Un ícono reemplaza una palabra o marca un estado, nada más.
- Sombra solo en lo que flota. Cards: borde o espacio.
- Verde = acción, selección, "ahora". Nunca texto de énfasis.
- Dos radios (8 y 12 px) + `full` para chips.
- Lo vacío no tiene borde.
- Texto con degradé: prohibido.
- `<button>` crudo fuera de `ui/`: error de lint.
- Toda pantalla nueva nace de los primitives; si el primitive no alcanza, se extiende el
  primitive, no se hace uno local.

## 6. Freeze y costo

No es feature, tampoco bug ni plata. No entra limpio en D4
(`docs/decisions/2026-09-02-experimento-30-dias.md`). Dos caminos, decisión del dueño:

1. Registrarlo en `docs/gtm/ejecucion/10-aprendizajes.md` como fricción de adopción por
   percepción de calidad (observación propia, no de cliente) y ejecutar Fases 0-2 ahora.
2. Esperar al 2026-11-01 y arrancar por Fase 0 igual, que no toca código.

## 7. Lo que NO cambia

Flujos, datos, tablas, vetos de producto. Nada de features. Las PitchLines se quedan. El
dark premium del jugador se queda. La paleta pineada de `globals.css` (emerald/red/amber por
WCAG) se queda.
