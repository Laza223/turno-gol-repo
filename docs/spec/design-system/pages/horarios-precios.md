# Configuración de horarios y precios — spec de rediseño

> Vistas: `/settings/horarios` (horarios del complejo) + `/canchas` → form de cancha (precios).
> Fuente visual: `MASTER.md` v2. Hermana de `pages/grilla.md` y `pages/dashboard.md`.
> Estado: implementada 2026-07-02.

## 0. Objetivo y anti-objetivo

**Objetivo**: que configurar horarios y precios cueste lo que cuesta el caso real, no el caso
general. La mayoría de los complejos tiene el mismo horario todos los días y uno o dos precios
(semana/finde o día/noche). Ese caso debe resolverse con **2–4 campos**, no con 14 inputs de hora
ni 105 celdas de matriz (Ley de Hick, MASTER §9).

**Anti-objetivo**: perder poder. El caso raro (martes cerrado, viernes hasta las 02:00, precio
distinto solo el domingo a la noche) sigue siendo posible — pero plegado detrás del caso común
(progressive disclosure), no delante.

## 1. Problemas del diseño anterior (screenshots `docs/audit/screenshots/desktop/admin/`)

| # | Problema | Evidencia |
|---|---|---|
| 1 | 7×2 inputs de hora idénticos | `settings_horarios.png`: todas las filas dicen 08:00–23:00 |
| 2 | **No se puede cerrar un día** desde settings | `OpeningHoursDay.closed` existe y TODA la cadena downstream lo respeta (booking.service, availability-search, public.service, coverage de precios, grilla, dashboard, SEO), pero el form no lo expone |
| 3 | **Bug de pérdida de datos**: `horariosSchema` despojaba `closed` al guardar | Domingo cerrado en el wizard de onboarding (que SÍ tiene el toggle) se perdía silenciosamente al tocar "Guardar horarios" en settings |
| 4 | Precios: matriz hora×día como ÚNICA entrada | `canchas_formulario_modal.png`: para "mismo precio siempre" hay que entender drag/shift+click |
| 5 | `DEFAULT_RULES` precargaba precios inventados ($8.000/$12.000/$15.000) | Una cancha creada sin tocar precios salía a producción con precios truchos reservables online |
| 6 | Sin "copiar de otra cancha" | El caso normal es N canchas idénticas: cada una obligaba a recargar toda la matriz |
| 7 | `formatArs` local en `pricing-grid.ts` ("$8.000" sin espacio) | Viola §8.2 (formato único "$ 8.000" vía Intl es-AR) |

## 2. Horarios (`/settings/horarios`) — general + excepciones

### 2.1 Modelo mental

```
Horario general        [Abre 08:00]  [Cierra 23:00]
                       "Vale para todos los días, salvo los que personalices."

Días
  ☑ Lunes      Horario general                    [Personalizar]
  ☑ Martes     Horario general                    [Personalizar]
  ...
  ☑ Sábado     [09:00] a [23:00]                  [Usar horario general]
  ☐ Domingo    Cerrado
☐ Cierra después de medianoche  (sin cambios)
[Guardar horarios]
```

Cada día está en uno de **3 estados**: `general` (default, hereda los 2 campos de arriba),
`custom` (par propio de open/close) o `closed` (checkbox destildado; finalmente expone el flag).
Caso común = 2 campos; caso "finde distinto" = 2+4; caso anterior completo sigue disponible.

### 2.2 Derivación al cargar (pura, `lib/schedule/schedule-view.ts`)

- `general` = el par `(open, close)` **más frecuente** entre los días abiertos; empate → el del
  primer día en orden lun..dom. Sin días abiertos/sin datos → default `08:00`/`23:00`.
- Día con par distinto al general → modo `custom`. `closed: true` → modo `closed`.
- Round-trip garantizado: derivar y volver a expandir reproduce el `OpeningHours` original
  (testeado en `tests/unit/horarios-lib.test.ts`, que ejercita `deriveScheduleView` de
  `schedule-view.ts` — el mismo módulo que reusa `StepSchedule` del wizard de onboarding).

### 2.3 Contrato de persistencia (sin migración)

- Mismo JSONB `tenants.opening_hours` `{open, close, closed}` por día. La UI expande
  general+excepciones a los 7 días en **hidden inputs** con los names existentes
  (`${day}_open`/`${day}_close`) + el nuevo `${day}_closed` (checkbox semántico: `'on'`).
- `horariosSchema`: cada día gana `closed: z.boolean().default(false)`; la validación
  cierre>apertura se **saltea** en días cerrados; nueva regla: **al menos un día abierto**
  ("Abrí al menos un día de la semana."). Fix del bug #3: `closed` ya no se despoja.
- `closes_next_day` intacto (checkbox global, misma explicación).

### 2.4 Guided UX

- Hint inline (info, §7.1) bajo el horario general cuando `close <= open` y el flag de madrugada
  está apagado: "¿Cerrás pasada la medianoche? Activá «Cierra después de medianoche»." — previene
  el error más común antes del submit.
- Días cerrados: fila con `opacity` reducida + texto "Cerrado" (color + texto, nunca color solo).
- Feedback de guardado: mismo contrato `aria-live` + `role="alert"`/`role="status"` que hoy
  (contrato de `tests/unit/horarios-forms.test.tsx`, pasa sin cambios).

## 3. Precios (`/canchas` → form) — plantilla + resumen + ajuste fino

### 3.1 Anatomía (reemplaza "matriz como única entrada")

```
Precios
┌ Plantilla rápida ──────────────────────────────────────────┐
│ (radio) Un precio · Lun a Jue / Vie a Dom · Día y noche    │
│ [inputs $ según modo]     [Aplicar a toda la semana]       │
│ "Pisa los precios cargados; después ajustá lo que quieras."│
└────────────────────────────────────────────────────────────┘
Copiar precios de otra cancha: [select ▾] [Copiar]   ← solo si existen otras
Resumen: "Lun a Jue · 08:00–18:00 · $ 8.000" (una fila por regla)
⚠ "Faltan N horarios sin precio" (si aplica)
▸ Ajustar por hora   ← disclosure plegada → PricingGrid intacta
```

### 3.2 Los 3 modos de plantilla (y por qué solo 3)

| Modo | Campos | Cubre |
|---|---|---|
| **Un precio** (default) | 1 | El complejo chico típico |
| **Lun a Jue / Vie a Dom** | 2 | El split argentino real (el viernes se cobra como finde) |
| **Día y noche** | 2 + hora de corte (default 18:00) | Tarifa nocturna con luz |

Más de 3 opciones de igual jerarquía viola Hick (§9). El combo (finde × noche = 4 precios) y
cualquier otro caso se arma aplicando una plantilla y retocando en "Ajustar por hora". La
plantilla es un **generador** (pisa la grilla al aplicar), no un editor bidireccional: al editar
una cancha existente no se intenta adivinar qué modo "es" — el estado real vive en el resumen.

### 3.3 Decisiones

- **`DEFAULT_RULES` muere**: cancha nueva arranca **sin precios**. Precios inventados yendo a
  producción es peor que un paso más. El guardado se bloquea client-side con mensaje claro
  ("Faltan N horarios sin precio…") y `validatePricingRulesCoverage` sigue de backstop server-side.
- **Copiar de otra cancha**: `expandRulesToGrid(otraCancha.pricing.rules)` client-side, cero
  round-trips. El caso "5 canchas iguales" pasa de 5 matrices a 1 plantilla + 4 copias.
- **Resumen legible** (`describeRules`): la compresión a reglas ya existía para persistir; ahora
  también se muestra — verificación instantánea sin leer la matriz. Días colapsados
  ("Lun a Jue", "Sáb y Dom"), rango con en-dash (§8.3), plata con `formatArs` de `lib/format` (§8.2).
- **PricingGrid queda** (heat map, drag, selección en bloque, edición por celda) como herramienta
  de poder, plegada. Pasa a **controlada** (`grid` + `onGridChange`); la compresión a reglas sube
  al contenedor (`PricingSection`), único dueño del estado.
- **P0.2**: muere el `formatArs` local de `pricing-grid.ts`; toda la vista usa `lib/format`.

## 4. Copy (§8)

- "Horario general" · "Personalizar" · "Usar horario general" · "Cerrado" · "Abierto".
- "Plantilla rápida" · "Aplicar a toda la semana" · "Copiar precios de otra cancha" ·
  "Ajustar por hora" · "Falta(n) N horario(s) sin precio".
- Voseo, sentence case, sin anglicismos. Montos "$ 8.000" (§8.2), rangos "08:00–18:00" (§8.3).

## 5. Accesibilidad

- Modos de plantilla = `fieldset` + `legend` sr-only + radios reales (sr-only) con labels-chip;
  focus visible con `ring-ring`.
- Checkbox por día con label accesible ("Lunes abierto"). Hidden inputs no interactivos.
- El estado "Cerrado"/"Horario general" es texto, no solo estilo.
- Inputs de plata: `inputMode="numeric"`, label visible, placeholder "Ej: 20.000" (§6.3).
- Disclosure "Ajustar por hora": `aria-expanded` + chevron rotado.

## 6. Responsive

- Horarios: filas de día en una columna; inputs de hora nativos (44px touch).
- Plantilla: chips envuelven (`flex-wrap`); inputs $ en fila que colapsa a columna en mobile.
- La matriz conserva su `overflow-x-auto`.

## 7. Contratos de test

- `tests/unit/horarios-forms.test.tsx`: pasa sin cambios (alert/status + `hours={{}}` tolerado).
- `tests/unit/opening-hours-validation.test.ts`: extendido — días cerrados salteados, todo cerrado rechazado.
- `tests/unit/pricing-grid.test.ts`: extendido — `buildTemplateGrid` (3 modos, respeta ventanas y
  días cerrados), `describeRules`, `formatDayList`. Tests del `formatArs` local eliminados con él.
- `tests/unit/pricing-grid-render.test.tsx`: adaptado a la API controlada vía harness con estado.
- `tests/unit/horarios-lib.test.ts` (nuevo): derivación general/excepciones round-trip.
- `tests/e2e/canchas-crud.spec.ts`: #1 usa la plantilla (Un precio → Aplicar) en lugar de los
  DEFAULT_RULES muertos; #3 aplica plantilla → expande "Ajustar por hora" → vacía una celda →
  espera el gate client-side ("sin precio") con el form abierto.

## 8. Deuda declarada (no pedida — no ejecutar sin pedido)

- El shell de `/settings/*` (h1 + tabs propios) no usa `PageHeader` (§6.4); cambiarlo solo en
  horarios rompería la coherencia entre tabs — migrar los 3 tabs juntos.
- "Capacidad: N jugadores" en el form de cancha es el bridge legacy de `format` (migr. 032, UI
  real deferida) — fuera de scope acá.
- El split Lun a Jue / Vie a Dom es fijo (matchea el default histórico); si algún complejo pide
  otro corte, se hace con plantilla + ajuste fino. Evaluar días configurables solo con demanda real.
- La grilla admin muestra slots en días `closed` (el staff puede cargar manual igual); el público
  no los ve. Decidir si el admin merece el mismo empty state "Cerrado" del dashboard.
