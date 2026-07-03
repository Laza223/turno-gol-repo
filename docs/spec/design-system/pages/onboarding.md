# Onboarding wizard del admin — spec de rediseño

> Vistas: `/onboarding` (wizard 4 pasos) + `/onboarding/listo` (cierre peak-end).
> Fuente visual: `MASTER.md` v2 (§7 Guided UX, §9 goal gradient/Zeigarnik/peak-end).
> Hermana de `pages/horarios-precios.md` (reusa su modelo de horarios y su motor de precios).
> Estado: implementada 2026-07-02. Cierra deuda MASTER §13.7.

## 0. Objetivo y anti-objetivo

**Objetivo**: que el dueño salga del wizard con el complejo **operable de verdad**: canchas
creadas, horarios confirmados, precios cargados, decisión de seña tomada, y el link público en
la mano. Cero "andá a configurarlo en otro lado" (doc10 siempre pidió creación inline; el código
v1 desvió del spec).

**Anti-objetivo**: volver a meter el panel de configuración entero adentro del wizard. El wizard
carga el **caso común con el mínimo de campos**; el ajuste fino (precio por franja, fotos,
excepciones raras) vive en Configuración y el copy lo dice explícitamente.

## 1. Problemas del diseño anterior

| # | Problema | Evidencia |
|---|---|---|
| 1 | **Paso 2 no creaba canchas**: banner "podés agregarlas desde el panel" + Continuar | `StepCourts.tsx` v1 — rompe Zeigarnik: el wizard termina y el complejo NO puede recibir reservas (0 canchas) |
| 2 | Doble indicador de progreso (barra % + 4 segmentos) | `page.tsx` v1; MASTER §13.7 |
| 3 | Sin marca visual: card gris flotando en `bg-muted/40`, sin continuidad con register/login | Primera impresión del producto |
| 4 | **Validación de horarios rota**: `scheduleSchema` local trataba `close 00:00` como 0 min → los propios defaults de DB (lun–jue cierran 00:00) fallaban con "cierre debe ser posterior a apertura" | `actions.ts` v1 vs `opening-hours.schema.ts` (que ya resuelve medianoche, madrugada, días cerrados y ≥1 día abierto) |
| 5 | Paso horarios: tabla 7×2 cruda, sin madrugada (`closes_next_day`), duplicando una validación que settings ya tenía bien | `StepSchedule.tsx` v1 |
| 6 | `?error=mp_*` del callback OAuth se ignoraba: el dueño volvía al paso 4 sin ningún feedback | `page.tsx` v1 no lee searchParams |
| 7 | "Sí, cobrar seña" no activaba la seña: el callback conecta MP pero `requires_deposit` quedaba `false` → promesa vacía | `api/mp/callback` v1 |
| 8 | Final sin peak-end: `skipMpAction` → redirect mudo a /dashboard; el "compartí tu link" (la acción que dispara el Aha Moment, doc10 §6) no existía | `actions.ts` v1 |
| 9 | Placeholder de email truncaba (auditoría MASTER §6.3) y el preview de URL mentía (`turnogol.app/slug`; el link real es `/c/slug`) | `StepIdentity.tsx` v1 |

## 2. Estructura: orden nuevo de pasos

```
1. Tu complejo   → crea el tenant (igual que v1, retocado)
2. Horarios      → general + excepciones + madrugada (modelo de pages/horarios-precios.md §2)
3. Canchas       → creación inline: nombre, formato, superficie, techada, precio por turno
4. Señas         → ¿cobrás seña? 2 cards → MP OAuth o terminar
→ /onboarding/listo  (cierre peak-end: link + WhatsApp)
```

**Por qué Horarios antes que Canchas** (v1 tenía canchas→horarios): el precio de una cancha debe
**cubrir el horario de apertura** (`validatePricingRulesCoverage`). Crear canchas antes de
confirmar horarios obliga a validar contra horarios que el dueño todavía no vio → huecos de
cobertura o precios sobre horas inexistentes. Con horarios primero, el generador de precios del
paso 3 trabaja sobre datos confirmados. La dependencia manda el orden.

**Semántica de `onboarding_step`** (sin cambios de contrato): `settings.onboarding_step` = último
paso completado; la página muestra `step + 1`. Nuevo mapeo: 1 = identidad → muestra Horarios;
2 = horarios → Canchas; 3 = canchas → Señas. Tenants en vuelo con el mapeo viejo se re-mapean
solos (pre-launch, sin migración).

**Volver**: pasos 3 y 4 tienen "Volver" (ghost) → `advanceStepAction(paso−2)`, ahora restringido
a `1..3`. El paso 1 no tiene Volver: el tenant ya existe; renombrar es Configuración.

## 3. Shell: marca + progreso único

### 3.1 Desktop (lg+): split con rail de marca

Continuidad con el journey `/register` → `/login` (split oscuro + form): el wizard es la pantalla
siguiente y habla el mismo idioma visual.

```
┌─ rail (w-[380px], always-dark) ─┬─ contenido (bg-background, theme-adaptive) ─┐
│ [Logo]                          │                                             │
│                                 │        ┌ card-premium ──────────┐           │
│ Paso 2 de 4 · 50%               │        │ (Volver)               │           │
│ ✓ Tu complejo                   │        │ h2 del paso            │           │
│ ● Horarios      ← actual        │        │ …form…                 │           │
│ ○ Canchas                       │        │ [Continuar]            │           │
│ ○ Señas                         │        └────────────────────────┘           │
│                                 │                                             │
│ "Menos de 5 minutos. Todo se    │                                             │
│  puede cambiar después."        │                                             │
└─────────────────────────────────┴─────────────────────────────────────────────┘
```

- Rail: gradiente `slate-950 → emerald-950` (mismo lenguaje que el pane de register, sin foto —
  evita el problema de stock con marcas de §13 P2.9). Always-dark deliberado: es superficie de
  marca (como `para-complejos`), no vista de tarea.
- **La lista de pasos ES el indicador de progreso** (check verde = hecho, punto lleno = actual,
  círculo numerado = pendiente) + línea de texto "Paso N de 4 · N %" (goal gradient §9: el paso 1
  ya muestra 25 % — la cuenta arranca regalada porque la cuenta ya está creada). Un solo sistema
  gráfico → cierra §13.7.
- Pie del rail: "⏱ Menos de 5 minutos · Todo se puede cambiar después desde Configuración" —
  mata la ansiedad de "¿cuántos pasos más?" (doc10 §4).

### 3.2 Mobile: barra única

Rail oculto. Header compacto: Logo + "Paso N de 4 · N %" + **una** barra segmentada (4 segmentos,
hechos+actual en emerald, resto `muted`). Un indicador por viewport, nunca dos.

### 3.3 Contenido

- Columna `max-w-lg` (pasos 1, 2 y 4) / `max-w-2xl` (paso 3, canchas necesita aire).
- Card `card-premium rounded-2xl p-6 md:p-8`. h2 = título del paso (`text-2xl font-bold`),
  subtítulo `text-sm text-muted-foreground`.
- Primitives `ui/` tal cual están (Button/SubmitButton con `isLoading` §6.2). **No** se tokenizan
  acá: P0.1 de MASTER §13 sigue abierta y es tarea propia (blast radius app-wide); los campos de
  form usan las clases token-safe que el wizard ya tenía (`border-border bg-card text-foreground`).

## 4. Paso 2 — Horarios (reuso, no reinvención)

- Mismo modelo mental que `/settings/horarios` (pages/horarios-precios.md §2): **horario general
  (2 campos) + Personalizar/Cerrado por día + checkbox madrugada**. Reusa `horarios-lib.ts`
  (`deriveScheduleView`/`effectiveDay`/`needsNextDayHint`) y valida con el `horariosSchema`
  canónico — muere el `scheduleSchema` local roto (problema #4).
- El parseo FormData→input se extrae a `horariosFormDataToInput()` en `opening-hours.schema.ts`,
  compartido con la action de settings (una sola fuente para el contrato `${day}_open/_close/_closed`
  + `closes_next_day`).
- **Normalización de defaults** (`sanitizeWizardHours`): el default de DB trae vie/sáb cierre
  `01:00` con `closes_next_day=false` — estado inválido para el schema y, peor, **invisible para el
  motor de precios** (una madrugada sin flag = 0 celdas activas → viernes sin precio silencioso).
  Al iniciar el paso, todo cierre `close <= open` distinto de `00:00` con el flag apagado se
  normaliza a `00:00`. Es un default que nadie eligió → se corrige a un default seguro. Quien
  cierra de madrugada lo elige explícitamente (toggle) y el generador de precios del paso 3 lo
  soporta (§5).
- Hint de madrugada (`needsNextDayHint`) idéntico a settings (§7.1: info, no warning).

## 5. Paso 3 — Canchas y precios inline (el corazón)

### 5.1 Anatomía

```
Tus canchas
┌ Cancha 1 ──────────────────────────────── [×] ┐
│ Nombre   [Cancha 1        ]                    │
│ Formato  (F5) (F7) (F8) (F9) (F11)   ← chips  │
│ Superficie [Césped sintético ▾]  ☐ Techada     │
│ Precio por turno  [$ Ej: 20.000]               │
│   "Por turno de 1 hora, igual toda la semana.  │
│    Después podés poner precio por franja."     │
└────────────────────────────────────────────────┘
[+ Agregar otra cancha]   ← copia formato/superficie/precio de la anterior
[Continuar →]
```

- Mínimo 1 cancha para continuar (doc10). Máximo 20 por envío (backstop server).
- **"+ Agregar otra cancha" duplica la anterior** con nombre autoincremental ("Cancha 2"): el
  caso real es N canchas idénticas — la lección de "copiar precios de otra cancha" de
  horarios-precios, aplicada automáticamente. Microcopy: "Copiamos los datos de la anterior".
- Formato en chips (Hick: 5 opciones, mismas que el form de `/canchas`); "Fútbol N"; capacidad
  derivada server-side (`format × 2`, migr. 032). Quitar cancha = icon-only con `aria-label` +
  `Tooltip` (§7.4), solo si hay más de un draft.
- **Un solo precio por cancha** en el wizard (modo `uniform` de la plantilla). Día/noche o finde
  se ajustan después en `/canchas` — el wizard resuelve el caso común, no el general (mismo
  principio que horarios-precios §0). `DEFAULT_RULES` sigue muerto: acá el precio lo pone el
  dueño (1 campo), no un default inventado.
- Revisita (Volver desde Señas): las canchas ya creadas se listan como filas guardadas
  (check + "Cancha 1 · Fútbol 5 · $ 20.000") con hint "Podés editarlas después desde Canchas";
  los drafts nuevos se agregan debajo. Continuar con 0 drafts es válido si ya existen canchas.

### 5.2 Generador de reglas: `uniformRulesFromOpeningHours`

Nuevo helper puro en `pricing-grid.ts`: `(openingHours, closesNextDay, priceCents) → PricingRule[]`.

- Día abierto normal → regla `{days:[d], from: open, to: close}` (con `00:00` = medianoche,
  minutos exactos — no trunca a hora entera como la grilla).
- **Madrugada** (`closesNextDay && close <= open && close ≠ 00:00`): dos reglas — `[d] open→00:00`
  y `[día siguiente] 00:00→close`. `calculatePrice` busca por día **calendario**, así que el turno
  de la 01:00 del sábado (noche del viernes) lo cubre la regla del sábado 00:00→02:00. Esto hace
  que el wizard sea el ÚNICO camino hoy que precia madrugadas correctamente (ver §8).
- Reglas con mismo `(from, to, price)` se fusionan por días (mismo criterio que
  `compressGridToRules`). Cerrados se saltean. Sin días abiertos → `[]` (la action lo rechaza).
- `validatePricingRulesCoverage` queda de backstop server-side (no falla en madrugada: la saltea).

### 5.3 Action `createWizardCourtsAction`

Patrón de auth del wizard (extractAuthUser + getStaffTenant — el claim de tenant en el JWT puede
no estar todavía; mismo trade-off que las actions v1). Zod: drafts 0–20 de
`{name, format, surfaceType, isCovered, priceCents>0}`. Todo en **una** transacción
`withTenantContext`: límite de plan (`getCourtCountAndLimit`; en trial no hay suscripción →
sin límite), `createCourt` por draft, luego `updateOnboardingStep(3)`.

## 6. Paso 4 — Señas (decisión honesta) y cierre

### 6.1 Cards de decisión

Dos cards radio (roving por teclado, `role="radiogroup"`), default "Sí" (doc10):

- **"Cobrar seña online"** + badge "Recomendado": "El jugador paga un porcentaje al reservar,
  por MercadoPago. La plata va directo a tu cuenta y la reserva llega confirmada." CTA primario:
  **Conectar MercadoPago** (→ `/api/mp/oauth-start`) + microcopy de confianza "Te llevamos a
  MercadoPago para autorizar los cobros. Tarda 2 minutos."
- **"Sin seña por ahora"**: "Los jugadores reservan online y pagan al llegar. Activás la seña
  cuando quieras desde Configuración." CTA primario: **Terminar y ver mi complejo**.

Un solo CTA primario visible a la vez (§6.2): el CTA cambia con la selección.

### 6.2 Errores de OAuth (problema #6)

`?error=mp_*` → banner warning con copy accionable: fallas transitorias ("No pudimos conectar
MercadoPago. Probá de nuevo o terminá sin seña — lo conectás después desde Configuración") vs
config faltante ("La conexión con MercadoPago no está disponible ahora…"). Nunca el código crudo.

### 6.3 El callback ahora cumple la promesa (problema #7)

En `api/mp/callback`, si el onboarding NO está completo (= flujo wizard, elección explícita
"Sí, cobrar seña"): `requires_deposit: true` + `completeOnboarding` + redirect a
`/onboarding/listo`. Si ya estaba completo (reconexión desde settings): NO toca
`requires_deposit` (respeta lo que el admin haya configurado) y redirige a
`/settings/facturacion`. El porcentaje no se pregunta (default 30 %, doc10).

### 6.4 `/onboarding/listo` — peak-end (problema #8)

Guard: staff con tenant y `onboarding_completed` (si no → `/onboarding`). Mismo shell, rail con
los 4 pasos tildados (pago del goal gradient). Contenido:

- Check grande con una entrada animada única (fade+scale 300 ms, sin loop — presupuesto admin §5.2).
- "¡Tu complejo está online!" + link público real (`buildPublicLinkUrl` → `/c/slug`).
- CTA primario: **Compartir por WhatsApp** (`wa.me` con el mensaje pre-armado de doc10 §3 — la
  acción que dispara el Aha Moment). Secundario outline: **Copiar link**. Terciario ghost:
  **Ir a mi panel**. Compartir/copiar marcan `public_link_shared` (la checklist del dashboard
  arranca más llena — Zeigarnik encadenado).

## 7. Copy (§8)

- Rail: "Tu complejo" · "Horarios" · "Canchas" · "Señas" · "Paso N de 4 · N %".
- Voseo operativo: "Contanos de tu complejo", "Confirmá tus horarios", "Cargá tus canchas",
  "¿Cobrás seña?". Plata `formatArs` ("$ 20.000"), rangos "08:00–00:00" (§8.3).
- Preview de URL del paso 1 dice la verdad: `turnogol.app/c/<slug>` (problema #9). Placeholder
  de email corto que cabe: "Ej: hola@tucomplejo.com".

## 8. Deuda declarada / REQUIERE INPUT (no ejecutar sin pedido)

- **Madrugada × precios, sistémico**: `pricing-grid` (celdas), `PricingGrid` UI y
  `validatePricingRulesCoverage` ignoran `closes_next_day` — un día 18:00→02:00 tiene 0 celdas
  activas: no se puede preciar desde `/canchas` y la cobertura no valida esas horas. Peor: editar
  en `/canchas` una cancha creada por el wizard con reglas de madrugada las **pierde** (la grilla
  no representa 00:00–02:00 del día siguiente). El wizard genera reglas correctas (§5.2), pero el
  fix de fondo (extender el modelo de celdas más allá de la medianoche) es tarea propia.
- Primitives `button`/`input` siguen light-hardcodeados (MASTER §13 P0.1) — el wizard los consume
  tal cual; cuando P0.1 cierre, hereda gratis.
- `createTenantWithTrial` sigue sembrando el default JSONB de DB (vie/sáb 01:00 sin flag); el
  wizard lo normaliza al mostrar (§4), pero un tenant que abandona antes del paso 2 conserva ese
  default inválido para el motor de precios. Decidir si se corrige el default de DB (migración).
- Paso 1 sin autocompletado Google Places (doc10 lo pedía; requiere API key — decisión de negocio).

## 9. Contratos de test

- `tests/unit/pricing-grid.test.ts`: + `uniformRulesFromOpeningHours` (normal, medianoche,
  cerrado, madrugada→regla día siguiente, fusión de días, sin días abiertos).
- `tests/unit/horarios-lib.test.ts`: sin cambios (lib reusada tal cual).
- `tests/e2e/onboarding.spec.ts`: flujo completo nuevo — identidad → horarios (Continuar con
  defaults normalizados) → canchas (nombre+precio, Continuar) → señas (Terminar) →
  `/onboarding/listo` → "Ir a mi panel" → `/dashboard`. "Paso N de 4" via `.first()` (existe en
  rail y en header mobile, uno visible por viewport).
