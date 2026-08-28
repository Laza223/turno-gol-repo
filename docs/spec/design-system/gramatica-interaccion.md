# TurnoGol — Gramática del Sistema de Interacción · Fase 0

> **Qué es esto.** `MASTER.md` (doc20) es la fuente de verdad VISUAL (color, tipografía, densidad,
> las dos personalidades). Este documento es la fuente de verdad de **INTERACCIÓN**: cómo se pide
> plata, cómo se confirma o deshace una acción, y qué plantilla usa una pantalla vacía o rota.
> Nace de Fase 0 de `docs/planning/2026-08-01-decisiones-de-fase-v2.md` (visión v2 §6) aplicada
> sobre el producto actual — no es una reescritura visual, es la gramática transversal que faltaba.

**Versión:** 1.0 — 2026-08-01
**Precedencia:** ante un componente nuevo, este documento manda en interacción; `MASTER.md` manda
en color/tipografía/densidad. Si contradicen, gana el más específico a la pantalla que estés tocando.

---

## 1. Por qué existe esto

Antes de Fase 0, cada pantalla resolvía "¿confirmo esto?" y "¿cómo pido un monto?" por su cuenta:
15 sitios con el mismo botón de plata en 3 variantes de color distintas, un ban de jugador con dos
diálogos y dos Server Actions (una sin audit log), inputs `type="number"` que aceptan `$25` cuando
el usuario quiso decir `$25.000`, y confirmaciones que existían en una superficie (desktop) y no en
otra (mobile) para la MISMA acción.

La gramática no es estética: es **una única forma de hacer cada tipo de cosa**, para que el usuario
(Marcelo, Rodrigo — ver `MASTER.md` §1) construya un modelo mental que se transfiere entre pantallas
en vez de reaprender cada una.

---

## 2. Jerarquía única de acciones de plata

**Regla:** toda acción que mueve o cobra plata (confirmar reserva, cobrar cargo, guardar precio,
activar plan) usa `<Button>` (`src/components/ui/button.tsx`) o, si el layout no admite el
componente, el par de clases `bg-primary text-primary-foreground` — **nunca** un color Tailwind
crudo (`bg-emerald-600`, `bg-emerald-700`) con `text-white`.

**Por qué el color crudo está prohibido, no solo desaconsejado:** `--primary` en dark es
`emerald-500` + texto `slate-950` (7.9:1, AA). `bg-emerald-600 text-white` da ~3.6:1 en dark —
falla WCAG AA para texto normal. El bug no se ve en light (ahí sí pasa), así que sobrevive
code review hasta que alguien lo prueba en dark. Por eso la única forma de estar siempre bien es
depender del TOKEN, no de la primitiva.

**Guardado por ESLint** (`eslint.config.mjs`, regla `no-restricted-syntax`): cualquier literal o
template string con `bg-emerald-600` es error de lint, con el mensaje explicando el porqué. Si
necesitás ese verde para algo que NO es un CTA de plata (un ícono, un borde, un tinte de fondo),
usá una familia distinta de la escala (`emerald-50`, `border-emerald-500/40`) — el guard solo
mira el string exacto `bg-emerald-600`.

**Checklist para un botón de plata nuevo:**
1. ¿Es `<Button>` o `bg-primary text-primary-foreground`? Si no, es un bug.
2. ¿Tiene `isLoading`/estado pendiente visible? Un botón de plata sin feedback de "está
   procesando" invita al doble click.
3. ¿El label describe el efecto y, si aplica, el monto? ("Cobrar $12.500", no solo "Confirmar").

---

## 3. Matriz deshacer vs. confirmar

Toda acción destructiva o costosa entra en una de tres clases. **Cero excepciones "a mano" ni
`window.confirm()`/`alert()` nativos** — son inconsistentes entre navegadores y no se pueden
estilar ni testear igual que el resto del sistema.

### Clase A — reversible y barato → ejecutar YA + toast con "Deshacer"

Se ejecuta al click, sin diálogo previo. El toast queda 10 s (no los 4 s de un toast normal) y
ofrece "Deshacer", que re-invoca la acción inversa. **Solo aplica si existe una inversa de dominio
real** — no se inventa una acción de reversión que el negocio no tiene.

| Acción | Inversa usada |
|---|---|
| Marcar ausente (no-show) | `revertNoShowAction` (ventana 24 h) |
| Quitar día cerrado | re-invoca `addClosedDateAction` con la misma fecha |
| Sacar jugador del plantel de un equipo (torneos) | re-invoca `addTeamPlayerAction` |
| Borrar evento de acta (gol/tarjeta) | re-invoca `addEventAction` |
| Activar/Desactivar cancha | toggle del mismo endpoint (simétrico) |

### Clase B — costoso pero explicable → `ConfirmDialog` con consecuencias, SIN type-to-confirm

`src/components/ui/confirm-dialog.tsx`, prop `consequences?: string[]` → lista las consecuencias
reales (verificadas contra el código del service, nunca inventadas). `variant="destructive"` si
además de costoso es difícil de deshacer del todo.

| Acción | Consecuencia mostrada |
|---|---|
| Ban manual de jugador | Motivo + días de bloqueo (default 7, "Permanente" disponible sin ser el default) |
| Pausar abonado (turno fijo) | Borra las reservas futuras generadas por ese abonado |
| Liberar horas de torneo | Conteo real de horas que vuelven a estar libres para reserva online |
| Borrar fixture de torneo | Se pierden los resultados ya cargados |
| Borrar equipo de torneo | — |
| Walkover / borrar resultado de partido | La tabla de posiciones se recalcula |
| Impersonar un tenant (super-admin) | Qué puede ver/hacer mientras dura la impersonación |
| Cambiar plan / extender trial / resetear contraseña (super-admin) | Plan destino + precio, días de extensión, email del staff afectado |

### Clase C — irreversible con plata real → type-to-confirm

`ConfirmDialog` con `confirmationPhrase` (el usuario tipea una palabra exacta antes de poder
confirmar). Reservado para lo que de verdad no tiene vuelta atrás.

| Acción | Frase a tipear |
|---|---|
| Cancelar abonado | `CANCELAR` |
| Cerrar caja del día (inmutable) | `CERRAR` |
| Quitar staff | el email del staff |
| Super-admin: forzar estado / cancelar tenant | el nombre del tenant |

### Regla de decisión rápida

```
¿Hay una inversa de dominio real y barata?
  SÍ → Clase A (ejecutar + Deshacer)
  NO → ¿Es económicamente/operativamente grave o imposible de deshacer del todo?
         SÍ → Clase C (type-to-confirm)
         NO → Clase B (ConfirmDialog + consecuencias)
```

No inventar una Clase A con una inversa que el dominio no soporta (ej. no existe "revertir
cancelación de reserva" ni "reabrir un cierre de caja" — si no existe la acción inversa real, no
es Clase A aunque parezca barato deshacerlo).

---

## 4. Control de monto especializado

**Regla:** todo input que edita un monto en pesos ARS usa `<MoneyInput>`
(`src/components/ui/money-input.tsx`). Prohibido `type="number"` o un `<input>` de texto con
parseo manual (`Number(x)`, `parseFloat(x)`) para plata.

### Por qué

- `type="number"` con `step="0.01"` interpreta el punto como separador DECIMAL. El hábito
  argentino de tipear el punto de miles (`"25.000"`) da `Number("25.000") === 25`: un monto de
  $25.000 se guarda como $25 sin ningún error visible. Este fue un hallazgo real de auditoría
  (§4.4), no hipotético.
- El dominio es pesos ENTEROS (`CLAUDE.md`: "Montos en centavos de ARS, integer, nunca decimal").
  `MoneyInput` nunca permite tipear un decimal — no hay tecla que lo produzca.

### Contrato de la API (`src/components/ui/money-input.tsx` + `src/lib/money.ts`)

- Siempre trabaja en **centavos** (integer). Nunca pesos, nunca string sin parsear, en ningún
  punto de la cadena de datos hasta el server action.
- **Modo controlado** (el resto del componente necesita leer el valor en vivo — previews,
  validación antes de submit, hooks compartidos): `<MoneyInput valueCents={cents}
  onValueChange={setCents} />`. El estado de React pasa a ser `number | null` en centavos, nunca
  un `string` en pesos.
- **Modo no controlado** (form nativo leído por `FormData` en el submit, sin `onChange` de
  React): `<MoneyInput name="campo" defaultValueCents={...} />`. Renderiza un
  `<input type="hidden" name="campo" value={cents}>` — `fd.get('campo')` en el submit YA es el
  string de centavos. **No volver a multiplicar por 100.**
- Formatea con separador de miles es-AR mientras se tipea, y relee el monto en palabras arriba de
  $10.000 (`MONEY_WORDS_THRESHOLD_CENTS`) — hace imposible confundir $25 con $25.000 sin notarlo.
- Para MOSTRAR (no editar) un monto, usar `formatArs(cents)` de `src/lib/format.ts` — nunca un
  `Intl.NumberFormat` nuevo armado a mano en el componente.

### La regla dura: el parser dual muere en el mismo diff que el input

Cuando un campo migra a `MoneyInput`, **todo** `Number(x)` / `parseFloat(x)` /
`Math.round(x*100)` que tocaba ese mismo valor se elimina en el mismo cambio. Un residuo de
parseo viejo conviviendo con `MoneyInput` es la forma más fácil de duplicar o corromper un monto
(ej. mandar centavos×100 de más). Ningún test existente detecta esto solo — hay que leer la
cadena de datos hasta el punto donde sale hacia el server action.

**Qué NO es plata** (queda con `type="number"` normal): goles, tarjetas, cantidad de equipos,
stock/unidades, días, porcentajes, minutos. `MoneyInput` es específicamente para pesos ARS.

### Consolidación de verdad única relacionada

- **Método de pago → etiqueta**: `MethodKey`/`METHOD_LABELS`/`PAYMENT_METHOD_OPTIONS` viven en
  `src/lib/payment-method.ts` (no en `caja-lib.ts`, porque componentes reusables fuera de `@/app`
  — ej. `BookingPopover`— no pueden importar de la capa de rutas). `caja-lib.ts` re-exporta para
  no romper a sus consumidores existentes.
- **Formato de moneda de solo lectura**: `formatArs`/`formatArsContable` de `src/lib/format.ts`
  son los únicos formatters ARS del repo. Un `new Intl.NumberFormat('es-AR', {style:'currency',
  currency:'ARS', ...})` armado localmente en un componente es una señal de que hay que importar
  el de `lib/format.ts` en vez de escribir uno nuevo.

---

## 5. Plantillas de vacío y error

**Regla:** cero "Algo salió mal" a secas. Todo estado de error sigue la fórmula:
**[qué pasó] + [qué podés hacer] + [qué hace el sistema mientras tanto, si aplica]**.

Ejemplo real (`BookingErrorCard.tsx`): *"El pago no se procesó. El pago fue rechazado o
cancelado. Podés intentar de nuevo con otro medio."* — no *"Hubo un error"*.

**Regla:** todo estado vacío (una lista/tabla sin datos) usa `EmptyState`
(`src/components/ui/empty-state.tsx` o el que corresponda a la superficie) en vez de un `<p>`
armado a mano. Un vacío nunca contradice la UI que lo rodea — si hay un botón "Crear" visible en
otra parte de la pantalla, el copy del vacío invita a usarlo, no dice "Próximamente" al lado.

**Errores de validación (Zod)**: `installZodLocale()` (`z.config(z.locales.es())`,
`src/shared/validation/zod-locale.ts`) se llama desde `instrumentation.ts` y desde
`tests/setup.ts` — pero **NO alcanza los schemas de la app en runtime**: `instrumentation.ts`
se bundlea en un layer aparte y su copia de Zod no es la que usan los schemas del grafo de la
app (medido en runtime 2026-08-01, ver el comentario de `zod-locale.ts`). El locale global
queda solo como default de esa copia de instrumentación y de los tests. La defensa real es
**mensaje explícito en cada `.max()`/`.min()` cuyo error pueda llegar a pantalla** (ver
`boundedText` en `primitives.ts`) — un mensaje de validación en inglés en producción es un bug
de ese schema puntual (falta el mensaje explícito), no de infraestructura.

**`not-found`/`error` de cada route group** renderizan dentro del shell de esa sección — un
`notFound()` que expulsa al 404 raíz de Next.js (sin sidebar, sin logo) es peor que informativo:
hace pensar que la app entera se rompió. Implementado en `(admin)`
(`src/app/(admin)/not-found.tsx` + `error.tsx`, en la raíz del grupo) y también en `(super-admin)`
(`src/app/(super-admin)/super-admin/not-found.tsx` + `error.tsx` — un nivel más adentro porque ese
grupo tiene un solo segmento de ruta real, `super-admin/`, así que cubre lo mismo). Ambos archivos
citan explícitamente el mismo motivo (auditoría 2026-08-01 §7).

---

## 6. Checklist para agregar algo nuevo

Antes de mergear un componente que toca plata o una acción destructiva:

1. **¿El CTA de plata usa `<Button>`/`bg-primary`?** Si escribiste `bg-emerald-6xx`, el lint te va
   a parar — no lo silencies, cambiá el color.
2. **¿La acción es reversible y barata?** → Clase A (ejecutar + toast Deshacer), solo si existe
   una inversa real. **¿Es costosa pero explicable?** → Clase B (`ConfirmDialog` + consecuencias
   verificadas contra el código). **¿Es irreversible con plata real?** → Clase C
   (type-to-confirm).
3. **¿Hay un monto en pesos?** → `MoneyInput`, nunca `type="number"`. Verificá con Grep que no
   quede un `Number(x)`/`parseFloat(x)`/`Math.round(x*100)` tocando el mismo valor en el mismo
   archivo.
4. **¿Hay un estado vacío o de error?** → `EmptyState` / la fórmula de 3 partes. Nunca "Algo salió
   mal" ni un vacío que contradiga un botón "Crear" visible en la misma pantalla.
5. **¿Estás por duplicar una etiqueta/formatter que ya existe?** → `METHOD_LABELS` de
   `@/lib/payment-method`, `formatArs`/`formatArsContable` de `@/lib/format`. Grepear antes de
   escribir un objeto `Record<string,string>` nuevo con las mismas 4 claves de siempre.

---

## Historial

- **1.0 (2026-08-01)** — Fase 0 de `docs/planning/2026-08-01-decisiones-de-fase-v2.md`. Cierra
  los 🔴 §4.1 (CTA de plata), §4.4 (input de monto), §4.5 (fricción inconsistente), §4.6 (copy
  muerto de `/verify`), §4.11 (ban manual, parcial), §4.12 (vacío contradictorio de torneos),
  §4.15 (Zod en inglés) de la auditoría UX/UI/producto 2026-08-01. Ver `docs/audit/PROGRESS.md`
  (entradas T0–T6) para el detalle archivo por archivo de cada cambio.
