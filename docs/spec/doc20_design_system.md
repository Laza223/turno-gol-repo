# DOC 20 — Design System & UI/UX
## TurnoGol: Cómo Definimos y Construimos las Interfaces

> [!CAUTION]
> **Superado el 2026-09-23.** La única autoridad de diseño es [`DESIGN.md`](../../DESIGN.md), en la
> raíz del repo, escrito a partir del código. `MASTER.md`, la gramática de interacción y las specs
> por página que describe este documento se archivaron en
> [`docs/archive/design-system/`](../archive/design-system/). Lo que sigue queda como registro de
> cómo se trabajaba antes: no es regla. No se vuelve a crear `design-system/MASTER.md` ni specs por
> página: si falta una regla, va a `DESIGN.md`.

> **Propósito**: Documentar la estrategia de diseño visual de TurnoGol y la herramienta
> que la gobierna. Este documento asegura que todo el equipo (humanos y AI assistants)
> sepa de dónde viene cada decisión de color, tipografía, estilo y layout.

> [!IMPORTANT]
> TurnoGol NO diseña su UI manualmente. Utiliza un **design system propio** persistido en
> `design-system/MASTER.md` como fuente de verdad para todas las decisiones de estilo visual.
> Esto garantiza consistencia profesional sin necesidad de un diseñador UX dedicado.

---

## 1. La Jerarquía de Diseño

```
┌────────────────────────────────────────────────────────────────┐
│                   JERARQUÍA DE DISEÑO                          │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐     │
│   │   CAPA 1: Design System (Definición visual)          │     │
│   │                                                      │     │
│   │   Define:                                            │     │
│   │   • Estilo visual (UI style)                         │     │
│   │   • Paleta de colores                                │     │
│   │   • Pairing de tipografías (Google Fonts)            │     │
│   │   • Librería de iconos                               │     │
│   │   • Efectos y micro-animaciones                      │     │
│   │   • Anti-patrones a evitar                           │     │
│   │   • Checklist pre-delivery                           │     │
│   │   • Patrón de landing page                           │     │
│   └──────────────────────┬───────────────────────────────┘     │
│                          │ genera                              │
│                          ▼                                     │
│   ┌──────────────────────────────────────────────────────┐     │
│   │   CAPA 2: Design System Persistido                    │     │
│   │   (design-system/MASTER.md)                           │     │
│   │                                                      │     │
│   │   Contiene:                                          │     │
│   │   • Colores exactos (hex) del proyecto               │     │
│   │   • Tipografías elegidas con import de Google Fonts  │     │
│   │   • Tokens de spacing, border-radius, shadows        │     │
│   │   • Reglas de layout por tipo de página               │     │
│   │   • Overrides por página (si aplica)                 │     │
│   └──────────────────────┬───────────────────────────────┘     │
│                          │ se implementa con                   │
│                          ▼                                     │
│   ┌──────────────────────────────────────────────────────┐     │
│   │   CAPA 3: Implementación                              │     │
│   │                                                      │     │
│   │   shadcn/ui → Componentes primitivos (Button, Dialog, │     │
│   │               Table, Input, Toast, etc.)              │     │
│   │   Tailwind CSS → Utilidades de estilo                │     │
│   │   Radix UI → Accesibilidad y comportamiento          │     │
│   │   [Iconos] → Definidos en MASTER.md                  │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                │
│   REGLA: Nunca elegir un color, tipografía o estilo "a dedo".  │
│   Hoy la regla vive en DESIGN.md (raíz del repo);              │
│   MASTER.md está archivado y no se vuelve a crear.             │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Design System — Qué Contiene

### 2.1 Descripción

El design system de TurnoGol se persiste en `design-system/MASTER.md` y define:

| Recurso | Contenido |
|---|---|
| **UI Style** | Estilo visual del proyecto (ej: Minimalism, Dark Mode) |
| **Color Palette** | Colores primarios, secundarios, CTA, fondos, texto |
| **Font Pairing** | Tipografías con imports de Google Fonts |
| **UX Guidelines** | Best practices, anti-patrones, accesibilidad |
| **Chart Types** | Para dashboards y reportes |
| **Iconos** | Librería de iconos seleccionada (Lucide React, ver MASTER §2.6) |

### 2.2 Cómo se genera

Al inicio del desarrollo, el desarrollador (o AI assistant) crea `MASTER.md` definiendo:
- Estilo visual adecuado para SaaS de booking deportivo
- Paleta de colores alineada a la industria
- Pairing de tipografías con Google Fonts
- Efectos, transiciones, micro-animaciones
- Anti-patrones a evitar
- Checklist pre-delivery

### 2.3 Ubicación en el proyecto

```
TurnoGol/
└── design-system/                 # Persistido en el repo
    ├── MASTER.md                  # Fuente de verdad del diseño visual
    └── pages/                     # Overrides por página (opcional)
        ├── dashboard.md
        ├── grilla.md
        └── landing.md
```

---

## 3. Generación del Design System de TurnoGol

### 3.1 Creación inicial

Al iniciar el desarrollo, se crea `design-system/MASTER.md` definiendo las decisiones visuales del proyecto.

El `MASTER.md` debe contener:
- **Patrón de landing** recomendado
- **Estilo UI** seleccionado
- **Paleta de colores** completa (primary, secondary, CTA, background, text)
- **Pairing de tipografías** con import de Google Fonts
- **Efectos** (shadows, transitions, hover states)
- **Anti-patrones** a evitar para esta industria
- **Checklist pre-delivery**

### 3.2 Overrides por página

Si una página tiene necesidades específicas (ej: el dashboard tiene una densidad de información diferente a la landing), se crea `design-system/pages/[nombre].md` con overrides que toman prioridad sobre MASTER.md para esa página.

### 3.3 Aspectos a documentar en el design system

Cuando se necesita profundizar en un aspecto específico, agregar secciones al MASTER.md o crear overrides:

- **Estilo para el panel admin**: densidad de información, data tables, formularios
- **Colores para deportes**: paleta que transmita energía y dinamismo
- **UX para grillas de reservas**: scheduling UI, drag-and-drop, estados visuales de slots
- **Best practices de shadcn/ui**: composición de componentes, temas, variantes
- **Tipos de charts para reportes**: barras para revenue, líneas para trends, donas para distribución

---

## 4. Flujo de Trabajo para Crear UI

> [!CAUTION]
> Flujo superado el 2026-09-23. Hoy se lee [`DESIGN.md`](../../DESIGN.md) y se aplica; no se
> genera `MASTER.md` ni specs por página.

### 4.1 Al crear una página nueva

```
1. ¿Existe design-system/MASTER.md?
   → NO → Generarlo (§3.1)
   → SÍ → Continuar

2. ¿Existe design-system/pages/[nombre-pagina].md?
   → SÍ → Leer MASTER.md + override de la página
   → NO → Usar solo MASTER.md

3. Implementar usando:
   → Colores, tipografía y estilos de MASTER.md (o override)
   → Componentes de shadcn/ui como primitivos
   → Tailwind CSS para utilidades
   → Iconos de la librería definida en MASTER.md

4. Antes de entregar, verificar contra:
   → Checklist pre-delivery del MASTER.md
   → Anti-patrones listados en MASTER.md
```

### 4.2 Al modificar una página existente

```
1. Leer MASTER.md (y override de página si existe)
2. Verificar que los cambios respetan el design system
3. Si el cambio requiere una desviación → documentar en el override de la página
4. Nunca hardcodear colores/fuentes/espaciado "a dedo"
   → Usar los tokens definidos en MASTER.md o `globals.css` (Tailwind v4 no usa `tailwind.config.ts`)
```

### 4.3 Al hacer code review

```
□ ¿Los colores usados corresponden a tokens del design system?
□ ¿Los iconos son de la librería definida (no emojis, no otra librería)?
□ ¿La tipografía corresponde al pairing definido?
□ ¿Las animaciones/transitions respetan los tiempos definidos?
□ ¿Se evitan los anti-patrones listados en MASTER.md?
```

---

## 5. Colores Semánticos vs Colores del Design System

### 5.1 Colores del design system (estéticos)

Definidos en MASTER.md. Ejemplo de estructura:

```
Primary:    #XXXXXX  → Botones principales, links, highlights
Secondary:  #XXXXXX  → Elementos secundarios, badges
CTA:        #XXXXXX  → Botón de call-to-action, urgencia
Background: #XXXXXX  → Fondo principal
Surface:    #XXXXXX  → Cards, modales, dropdowns
Text:       #XXXXXX  → Texto principal
Muted:      #XXXXXX  → Texto secundario, subtítulos
```

### 5.2 Colores semánticos (funcionales)

Definidos en la documentación funcional (docs 4, 7, 8) y mapeados a tokens:

| Semántica | Uso en TurnoGol | Token Tailwind |
|---|---|---|
| **Success** (verde) | Slot libre, pago aprobado, tenant activo | `text-success`, `bg-success` |
| **Danger** (rojo) | Slot ocupado, error, tenant suspended, cobro fallido | `text-destructive`, `bg-destructive` |
| **Warning** (amarillo/naranja) | Trial, past_due, pago pendiente | `text-warning`, `bg-warning` |
| **Info** (azul) | Turno fijo de abonado, información neutral | `text-info`, `bg-info` |
| **Muted** (gris) | Slot fuera de horario, cancha inactiva, deshabilitado | `text-muted`, `bg-muted` |

> [!NOTE]
> Los **colores semánticos** (success, danger/destructive, warning, info) se definen dentro de
> `globals.css` (Tailwind v4 no usa `tailwind.config.ts`) con valores que armonicen con la paleta del design system.
> No son colores "genéricos" — se seleccionan para que sean consistentes con la paleta
> general definida en el design system.

---

## 6. Stacks de Implementación Soportados

El design system soporta las siguientes herramientas de implementación. Para TurnoGol usamos:

| Stack flag | Para qué |
|---|---|
| `--stack shadcn` | Guidelines de componentes shadcn/ui (cómo componer, customizar, temas) |
| `--stack nextjs` | Best practices de Next.js (SSR, Image, Font, layouts) |
| `--stack react` | Performance de React (memo, Suspense, render optimization) |

---

## 7. Pre-Delivery Checklist (del skill)

Antes de entregar cualquier pantalla, verificar:

### Visual Quality
- [ ] No se usan emojis como iconos (usar librería vector del design system)
- [ ] Todos los iconos vienen de la misma familia y estilo
- [ ] Los press states no modifican el layout
- [ ] Se usan tokens semánticos de tema, no colores ad-hoc hardcodeados

### Interaction
- [ ] Todos los elementos clickeables tienen `cursor-pointer`
- [ ] Hover states con transiciones suaves (150-300ms)
- [ ] Touch targets ≥ 44×44 en mobile
- [ ] Disabled states son visualmente claros y no interactivos
- [ ] Focus states visibles para navegación con teclado

### Light/Dark Mode
- [ ] Contraste de texto primario ≥ 4.5:1 en ambos modos
- [ ] Contraste de texto secundario ≥ 3:1 en ambos modos
- [ ] Borders/dividers visibles en ambos temas

### Layout
- [ ] Responsive verificado: 375px (mobile), 768px (tablet), 1024px, 1440px (desktop)
- [ ] Spacing rhythm consistente (sistema de 4/8px)
- [ ] Long-form text readable en pantallas grandes
- [ ] `prefers-reduced-motion` respetado

### Accesibilidad
- [ ] Todas las imágenes/iconos significativos tienen alt text
- [ ] Formularios tienen labels, hints y mensajes de error claros
- [ ] El color no es el único indicador (combinar con iconos/texto)

---

## 8. Relación con Otros Documentos

| Documento | Relación |
|---|---|
| **Doc 3** (Personas) | Define el usuario target → informa los keywords para el design system ("non-tech admin", "sports") |
| **Doc 5** (RNFs) | Define targets de performance (LCP < 2.5s, FCP < 1.5s) → el design system debe respetar |
| **Doc 7, 8** (Flujos, Stories) | Definen colores **semánticos** funcionales (verde=libre, rojo=ocupado) |
| **Doc 10** (Onboarding) | Define flujo UX del wizard → el design system aplica los estilos, no cambia el flujo |
| **Doc 14** (Tech Stack) | Define las herramientas de implementación (shadcn, Tailwind, Radix) |
| **Doc 16** (Testing) | Testing de UI: visual no se testea con automatización, se revisa con el checklist del skill |

---

## 9. Resumen

```
┌────────────────────────────────────────────────────────────────┐
│               DESIGN SYSTEM - TURNOGOL                         │
│                                                                │
│  FUENTE DE VERDAD: DESIGN.md (antes: design-system/MASTER.md)  │
│                                                                │
│  GENERA:                                                       │
│    • Estilo visual completo                                    │
│    • Paleta de colores alineada a la industria                │
│    • Pairing de tipografías (Google Fonts)                    │
│    • Librería de iconos (Lucide React)                       │
│    • Efectos, transiciones, micro-animaciones                │
│    • Anti-patrones a evitar                                   │
│    • Checklist pre-delivery                                   │
│                                                                │
│  SE PERSISTE EN:                                               │
│    design-system/MASTER.md (global)                           │
│    design-system/pages/*.md (overrides por página)            │
│                                                                │
│  SE IMPLEMENTA CON:                                            │
│    shadcn/ui (componentes primitivos)                         │
│    Tailwind CSS (utilidades de estilo)                        │
│    Radix UI (accesibilidad)                                   │
│    Next.js (framework, SSR, optimización)                     │
│                                                                │
│  REGLA CARDINAL:                                               │
│    Nunca inventar colores, fuentes o estilos "a dedo".         │
│    Hoy se consulta DESIGN.md (raíz del repo).                  │
│    MASTER.md está archivado: no se vuelve a crear.             │
└────────────────────────────────────────────────────────────────┘
```

> [!CAUTION]
> **Para Claude Code**: este flujo está superado. La autoridad de diseño es
> [`DESIGN.md`](../../DESIGN.md), en la raíz del repo. No crear `design-system/MASTER.md`: si
> falta una regla, se agrega a `DESIGN.md`.
