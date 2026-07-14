# E2E post stack-upgrade — informe de cierre

**Fecha:** 2026-07-14
**Contexto:** primera corrida real de `pnpm test:e2e` después de la modernización del stack
(Next 16 / React 19 / Tailwind 4 / Zod 4, ver `2026-07-13-stack-upgrade.md`).
**Suite:** 132 tests, 6 projects, `--workers=1` (el e2e solo es honesto en serial).

---

## El reporte inicial estaba contaminado

El primer conteo (103 pass / 23 fail) se midió contra un **dev server levantado a mano**.
`playwright.config.ts` tiene `reuseExistingServer: !process.env.CI`, así que Playwright
reusó ese proceso en vez de levantar el suyo — y ese proceso **no tenía `MP_MOCK_MODE=1`
ni `NEXT_PUBLIC_E2E=1`**. De ahí salían casi todas las fallas de pago y el ruido de Sentry
en WebKit, que **no reprodujeron** en una corrida limpia.

Matando ese server, el `webServer` de Playwright **no arrancaba** (ver 🔴 #1) y la suite
real daba **6 fallas**, no 23. Ninguna de las tres hipótesis del reporte inicial sobrevivió
al diagnóstico:

| Hipótesis inicial | Qué era en realidad |
|---|---|
| Sentry tira CORS en WebKit → desactivar en E2E | Sentry se inicializaba **en dev** y posteaba al DSN dummy. No es de WebKit: cross-browser pasó entero. |
| Modales offscreen en mobile por TW4/Radix | El modal **fitea** (`x:16, width:361` en Pixel 5). El test medía a mitad de la animación de entrada. |
| Regresión en el deposit happy path | El test moría en la primera aserción, antes del pago: `getByText` matcheaba el `<title>`. |

---

## Hallazgos

### 🔴 1. `instrumentation.ts` nunca corrió en Next 14 → el webServer no arranca (ARREGLADO)

```
Invalid environment: UPSTASH_REDIS_REST_URL: Invalid URL;
UPSTASH_REDIS_REST_TOKEN: Too small: expected string to have >=20 characters
```

Next 14 exigía `experimental.instrumentationHook: true` para ejecutar `instrumentation.ts`,
y el repo **no lo tenía**: `validateServerEnv` era código muerto en runtime. Next 16 lo hizo
estable y ahora corre en cada arranque.

`playwright.config.ts` pisa `UPSTASH_*` con `''` para apagar el rate limiting. Todo el
runtime lee esa var como *no configurada* (`!process.env.UPSTASH_REDIS_REST_URL` en
`rate-limit/client.ts`, `slots-cache.ts`, `api/status`); el schema de `env.ts` era el único
lugar que la trataba como *presente pero inválida*.

**Fix:** `validateServerEnv` normaliza `''` → ausente. Las requeridas siguen fallando igual
(pasan de "min 1 char" a "required").

**Esto habría roto el e2e en CI también**, donde `reuseExistingServer` es `false` y no hay
un dev server a mano que tape el problema.

### 🔴 2. Next 16 streamea el `<title>` dentro del `<body>` (ARREGLADO — en los tests)

Verificado sobre el HTML servido: el `<title>` sale **después** de `</head>`.

```
</head>
<body class="font-sans antialiased">
<title>E2E Complejo Demo · TurnoGol</title>
```

Es el *streaming metadata* de Next 16 (React lo hoistea al head en cliente; para bots sin JS
Next bloquea el streaming por user-agent). **No es bug de producto** — pero convierte al
título en un nodo de texto más del documento, así que `getByText('E2E Complejo Demo')` pasó
a resolver a 2 elementos (el `h1` y el `<title>`) → *strict mode violation*.

Rompía `availability.spec.ts` y `booking-flow.spec.ts` (S1). **Fix:** apuntar al
`getByRole('heading')`, que es lo que los tests querían verificar. Solo aplica donde el
título de la página **es** el nombre del complejo (`portal-search` no se ve afectado).

### 🔴 3. Carrera de hidratación en la grilla (ARREGLADO — en el test)

`admin-create-booking-ui`: el click en el slot no abría el modal. **Medido**:

```
click a 0ms    -> 0 dialogs
click a 3000ms -> 1 dialog
```

El `<button>` del slot viene del SSR; Playwright lo ve visible y lo clickea antes de que
React le enganche el `onClick`, y el chunk de `BookingFormModal` (`dynamic`, `ssr:false`)
nunca se pide. **Sin error de consola, sin request fallida** — el click es un no-op mudo.

Descartado que fuera falta de hidratación del árbol: el fiber, el `onClick` y el
`data-testid` estaban todos presentes cuando se medía 3s después.

**Fix:** `goto(..., { waitUntil: 'networkidle' })`, el mismo waitUntil que ya usa el resto
de los specs de admin. El test hacía `goto()` pelado (`waitUntil: 'load'`).

### 🟡 4. Sentry se inicializaba en dev y posteaba al DSN dummy (ARREGLADO — producto)

```
Access to fetch at 'https://dummy.ingest.sentry.io/api/123/envelope/...'
has been blocked by CORS policy
```

`beforeSend` **ya descartaba todo evento fuera de producción** (`NODE_ENV !== 'production'`
→ `null`), así que en dev el SDK no reportaba nada — pero igual abría el transporte y mandaba
envelopes de sesión/tracing. Resultado: un error de CORS en **cada carga de página en dev**,
y el fallo de todo smoke test que exige 0 errores de consola.

**Fix:** `instrumentation-client.ts` solo inicializa si `NODE_ENV === 'production'`. Los
preview de Vercel corren con `NODE_ENV=production`, así que siguen reportando.

### 🟡 5. `capture-screenshots` se pisaba a sí mismo entre projects (ARREGLADO — test)

Dos bugs encadenados:

1. El spec matchea **dos projects** (chromium por descarte, mobile-chrome por su `testMatch`),
   o sea corre dos veces por suite. Completa el wizard del fresh admin — y el `afterAll` que
   lo restaura **no corre entre una pasada y la otra**. La segunda arrancaba con el tenant
   que dejó la primera, el wizard la mandaba al paso 2, y el `expect` del paso 1 moría por
   timeout. **Fix:** limpiar también en el `beforeAll` (idempotencia, no depender del orden).
2. Ya en el paso 2: `WizardShell` pinta el label del paso **dos veces** — en el `<aside>`
   (`hidden … lg:flex`) y en el `<header>` (`lg:hidden`). En DOM order el primero es el del
   aside, **oculto en mobile**, así que `.first()` resolvía a un elemento hidden.
   **Fix:** `.filter({ visible: true })`.

### 🟢 6. El modal mobile NO desborda — el test medía la animación (ARREGLADO — test)

`RegisterMovementModal` reportaba `x: -117.63`. Medido con la animación terminada:

```
width: 361px   maxWidth: 448px   rectX: 16   innerWidth: 393
```

**Fitea perfecto.** `slide-in-from-left-1/2` lo anima desde un `translateX(-50%)` EXTRA sobre
el centrado, así que medirlo apenas es visible lo agarra a mitad de vuelo. **Fix:**
`expect.poll`, el mismo patrón que el test de cantina de ese archivo ya usaba por este motivo.

### 🟢 7. S3 (polling out-of-band): tolerancia menor que el backoff del watcher (ARREGLADO — test)

Falló una vez en la suite completa, pasó aislado en 7,3s. **No es regresión.**

`PaymentStatusWatcher` hace backoff **exponencial** ante un fetch fallido (3s → 6s → 12s →
24s, corta a los 5 fallos). En dev, el primer request a `/api/player/bookings/[id]/status`
compila la ruta on-demand; si ese intento no entra a tiempo, el watcher ya saltó al segundo
escalón: **3+6+12 = 21s > los 15s** que toleraba el test — que fallaba aunque la UI SÍ
flipeara sola. **Fix:** 30s, para que la tolerancia cubra un ciclo de backoff. Si no, el test
mide la velocidad de compilación del dev server, no el polling.

---

## Console Ninja

La extensión estaba inyectando un build-hook en `node_modules/next/dist/server/lib/start-server.js`
(condicionado a `TURBOPACK`, que Next 16 activa por default en dev). **No era la causa de
ninguna de las 7 fallas** — verificado corriendo el dev server con `--webpack`: el hook se
inyecta igual y el síntoma no cambia.

El usuario desinstaló la extensión y se purgó `node_modules` (`rm -rf` + `pnpm install`).
Verificado post-install: **0 ocurrencias** del hook, y el store global de pnpm **no** estaba
contaminado (la escritura in-place no siguió el hardlink).

---

## Qué cambió, y dónde

**Producto (2 archivos):**
- `src/shared/env.ts` — `''` se normaliza a ausente en `validateServerEnv`.
- `instrumentation-client.ts` — Sentry solo se inicializa en producción.

**Tests (5 archivos):** `availability.spec.ts`, `booking-flow.spec.ts`,
`critical-flows/admin-create-booking-ui.spec.ts`, `mobile/admin-mobile-smoke.spec.ts`,
`capture-screenshots.spec.ts`.

**Revertido:** el `*.sentry.io` que se había agregado al `connect-src` del CSP de dev en
`next.config.ts` — innecesario con Sentry apagado fuera de producción.

Ningún cambio debilita una aserción: los 5 fixes de test corrigen **selectores, waits y
aislamiento**, no el contrato que verifican.
