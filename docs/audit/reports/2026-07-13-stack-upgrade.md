# Modernización de stack — informe de cierre

**Fecha:** 2026-07-13
**Rama:** `main` (10 commits, `8134f02..49c7be1`, sin pushear)
**Objetivo:** pagar deuda técnica llevando todo el stack a versiones actuales.

---

## Versiones

| Paquete | Antes | Ahora |
|---|---|---|
| pnpm | 8.15.0 | 10.34.5 |
| eslint | 8.57.1 | 9.39.5 (flat config) |
| typescript-eslint | 7 | 8.64.0 |
| typescript | 5.9.3 | 6.0.3 |
| vitest | 1.6.1 | 3.2.7 |
| happy-dom | 14.12.3 | 20.10.6 |
| **next** | **14.2.35** | **16.2.10** |
| **react / react-dom** | **18.3.1** | **19.2.7** |
| @sentry/nextjs | 7.120.4 | 10.65.0 |
| **tailwindcss** | **3.4.19** | **4.3.2** |
| tailwind-merge | 2.6.1 | 3.6.0 |
| drizzle-orm / kit | 0.30.10 / 0.20.18 | 0.45.2 / 0.31.10 |
| **zod** | **3.25.76** | **4.4.3** |
| @testing-library/react | 14.3.1 | 16.3.2 |
| react-leaflet | 4.2.1 | 5.0.0 (leaflet queda 1.9.4) |
| @faker-js/faker | 8.4.1 | 10.5.0 |
| @playwright/test / playwright | 1.43 / 1.59.1 | 1.61.1 / 1.61.1 |
| prettier | 3.2 | 3.9.5 |
| lucide-react | 1.11.0 | 1.24.0 |
| recharts | 3.8.1 | 3.9.2 |

Excluidos a pedido: `pg-boss`, `mercadopago`, `leaflet`, y **TypeScript 7** (port
nativo a Go — es una migración aparte, no un major más).

## Gate final

```
typecheck    0 errores
lint         0 errores (27 warnings de React Compiler, baseline de la Fase 2)
unit         1530 / 1530
integration  566 / 566   (85 archivos, DB real)
isolation    111 / 111   (BLOQUEANTE en CI)
build        ✓
storybook    856 / 864
```

---

## Hallazgo principal: Tailwind 4 rompió WCAG AA (🔴, ARREGLADO)

Lo cazó la suite de a11y de Storybook. **Ningún typecheck, lint, unit test,
test de integración ni build lo veía**: los 1530 unit y los 566 de integración
pasaban en verde con esto adentro.

Tailwind 4 reescribió su paleta default en OKLCH. Los colores quedan un toque más
saturados, y el design system pasaba WCAG AA **al filo**, así que el corrimiento
lo tiró abajo del umbral. Medido contra el fondo real:

| Token | Uso | Tailwind 3 | Tailwind 4 | Umbral |
|---|---|---|---|---|
| `text-red-600` | 12/14px | `#dc2626` **4.55** ✅ | `#e7000b` **4.49** ❌ | 4.5 |
| `text-red-700` | 14px | `#b91c1c` **4.51** ✅ | `#c10007` **4.47** ❌ | 4.5 |
| `emerald-700` | 14px | `#047857` **4.57** ✅ | `#007a55` **4.47** ❌ | 4.5 |
| `emerald-600` | 96px bold | `#059669` **3.03** ✅ | `#009966` **2.94** ❌ | 3.0 |

Es texto que el usuario **tiene** que poder leer: los mensajes de error de
validación de caja, staff y auth, más los KPIs de métricas.

**Fix** (`ea9a6d7`): pinear las escalas COMPLETAS de las 3 familias semánticas
(emerald=marca, red=error, amber=warning) a los valores de Tailwind 3 en `@theme`.
Escalas completas y no solo los 4 tonos rotos: `emerald-500` (301 usos) y
`emerald-400` (246) son los más usados del repo, y dejarlos en OKLCH al lado de un
`emerald-600` pineado partiría la escala — los hovers 500→600 saltarían de una
paleta a la otra.

**Precio:** esas 3 familias quedan forkeadas de los defaults de Tailwind. Si algún
día se adopta la paleta OKLCH, hay que re-verificar contraste token por token.

Violaciones de axe: **19 → 0**.

---

## Trampas que el gate barato no habría cachado

Ninguna de estas rompe typecheck, lint ni build. Todas corrompen datos o
comportamiento en silencio.

### Drizzle 0.45 pisa los serializers de jsonb (`d6d3553`)

`drizzle(client)` sobreescribe los serializers de json (OID 114) y jsonb (3802)
del cliente postgres-js con una identidad. El repo comparte UNA instancia de
postgres-js entre drizzle (`getDb`) y el SQL crudo (`getSql`), así que la mutación
es global: todo `sql.json(obj)` crudo pasaba a mandar el objeto donde el driver
espera un string. **181 tests de integración en rojo** con typecheck, lint, unit y
build los cuatro en verde.

Fix: `restoreJsonSerializers()` en `client.ts`. Verificado contra Postgres real
(`scripts/_jsonb_probe.ts`) con `jsonb_typeof()`, porque **las lecturas vía drizzle
enmascaran el bug** — `fromDriver` hace `JSON.parse`, así que un test que escribe y
lee con drizzle pasa igual estando roto.

### Zod 4: `z.email()` valida ANTES de los transforms (`5f797b2`)

Reescribir `z.string().trim().toLowerCase().email()` como
`z.email().trim().toLowerCase()` — la traducción "obvia" — invierte el orden: el
formato se valida antes de trimear, así que **un email con un espacio de más
falla**. Rompía login, register, ingresar, forgot-password, reservar y el alta de
staff del super-admin. Los 6 sitios encadenados van con `.pipe(z.email())`.

### Zod 4: `z.uuid()` es más estricto que el de v3

Zod 4 valida RFC 9562 (nibbles de versión y variante); Zod 3 solo el formato hex.
Endurecerlo es seguro en prod (todas las PKs son `DEFAULT gen_random_uuid()` → v4)
pero divergía de `primitives.uuid`, que sigue siendo un regex laxo: el mismo
concepto de dominio validado con dos fuerzas distintas. Se usó **`z.guid()`**
(semántica exacta de v3) para que el upgrade sea neutro en comportamiento.

→ **Follow-up abierto:** endurecer todo a `z.uuid()` es una mejora real y barata,
pero es una decisión de validación, no de upgrade.

### Sentry 10: `samplingContext.transactionContext` se removió (`a551e04`)

El `tracesSampler` leía `samplingContext.transactionContext?.name`. En v8+ pasa a
`samplingContext.name`. Sin el fix, compila, corre, y el sampling por ruta
(webhooks 0.5, bookings 0.3, health 0) **colapsa en silencio a 0.1 uniforme**.

### React 19: las transiciones async se volvieron reales (`a551e04`)

`isPending` de `useTransition` ahora se mantiene en `true` durante todo el callback
async. 6 tests de UI asertaban justo un tick antes. El producto se recupera bien;
las assertions se movieron adentro de `waitFor`/`findByRole`.

---

---

## Bonus: time bomb pre-existente en integración (🟡, ARREGLADO)

`booking-time-validation.test.ts` → *"día operativo: no rechaza como past_date un
slot de «ayer operativo» que sigue físicamente en el futuro"*.

Apareció en el gate final, corriendo a las 23:29. **No es regresión de la
migración**: `git diff 8134f02..HEAD` sobre ese archivo es vacío — último cambio en
`9dc0731` (2026-07-10).

El test arma un slot sintético que arranca en `ahora + 10'` y dura 60'. Si
`ahora + 70'` cruza las 24:00, el `timeEnd` wrapea a `"00:xx"`, queda MENOR que el
`timeStart` y explota con `BookingValidationError: Los turnos son de 60 minutos`.

El guard que debía prevenirlo tenía la condición **al revés**:

```ts
if (nowGuard.getUTCHours() === 23 && nowGuard.getUTCMinutes() > 49) return
```

Saltea 23:50–23:59 — justo la franja donde NO hay wrap (ahí el start ya arranca
pasada la medianoche). Y deja correr **22:50–23:49**, que es exactamente donde el
wrap ocurre. O sea: el test venía roto ~1 hora por día desde que se escribió, y
solo se veía si la corrida caía en esa ventana. Pasó a las 22:05 (Fase 8) y falló
a las 23:29 (gate final).

Fix: guardar sobre la condición real de wrap (`startMins + 60 > 24 * 60`).

Se buscó la CLASE, no la instancia: es el único guard dependiente del reloj del
repo. El hermano (`if (now.getUTCHours() < 1) return`) sí está bien — con hora ≥ 1,
`pastHour + 1` llega como máximo a 23:00 y nunca wrapea.

---

## Abierto

### 🟡 7 stories rojas + 1 flaky rotativo (856/864)

`ForgotPasswordCard` (Enviado, Error), `InviteStaffDialog` (Exito, Error Del
Servidor), `IngresarForm` (Enviado), `StepSchedule` (Error Del Servidor),
`global-error` (Default). El flaky rota de corrida en corrida entre
`BookingCharges > Agregar Cargo` y `AbonadosList > Pausar Abonado`.

**NO son bugs de producto.** Verificado montando el `useActionState` real del
componente real en happy-dom, con y sin tipear antes del submit: pasa.

Baseline **medido**, no asumido: en `8134f02` (React 18 / Next 14 / TW3) la suite
daba **864/864**. O sea: son regresiones de esta migración.

Descartado:
- Timing — falla igual con un timeout de 15s.
- El spy `fn()` de `storybook/test` — falla igual con una función pelada.
- `nextConfigPath` colgado (`.storybook/main.ts` apuntaba a `next.config.js`, que
  la Fase 5 renombró a `.ts`). **Era un bug real, arreglado en `49c7be1`** — pero
  no era este.
- Doble copia de React (`@storybook/addon-docs` arrastraba react 18.3.1 y con él a
  `@storybook/react-dom-shim`, que es el que renderiza las stories). **También era
  un bug real, arreglado con `pnpm.overrides` en `49c7be1`** — tampoco era este.

Síntoma que queda: el update **sincrónico** pinta (el `pending` de `useFormStatus`,
que sigue viviendo en `react-dom`) y el **asíncrono** no (el estado que resuelve
`useActionState`, que en React 19 se mudó a `react`). Todas las stories que fallan
asertan estado post-resolución.

### 🟢 Prettier reporta drift en 611 archivos

Pre-existente, no regresión: prettier **3.2 ya reportaba 609**. El repo nunca
estuvo formateado con prettier (el CI corre eslint, no `prettier --check`). No se
corrió `pnpm format`: sería un diff de 611 archivos ajeno a la migración.

### 🟢 27 warnings de React Compiler

`react-hooks/set-state-in-effect` (19), `purity` (6), `use-memo` (2). Los trae
`eslint-plugin-react-hooks` v6, que entró con ESLint 9. Bajados a `warn` a
propósito en la Fase 2 para no bloquear el upgrade. Son hallazgos legítimos.

### e2e no corrido

`pnpm test:e2e` no se corrió en este esfuerzo. Dos gotchas conocidos de esta
máquina: **console-ninja contamina el e2e** (deshabilitarla antes) y el e2e **solo
es honesto con `--workers=1`**.
