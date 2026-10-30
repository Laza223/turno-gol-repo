# Actualización de dependencias — ledger (2026-10-28)

Pedido de Lazar: llevar a la última versión **estable** todo lo que usa el repo (librerías, CI, runtime, plugins, skills, MCPs), incluidos los saltos mayores que tocan plata y datos. Una rama y un PR por tanda; juez verde entre tandas.

## Tandas

| #   | Alcance                                                                                              | Estado        |
| --- | ---------------------------------------------------------------------------------------------------- | ------------- |
| T1  | Patch/minor de npm, GitHub Actions, pnpm 10.34.9, skills de `skills-lock.json`, plugin sentry        | mergeado #515 |
| T2  | vitest 5 + @vitest/browser 5, vite 8, eslint 10, happy-dom 21, jest-dom 7, dotenv 18, @types/node 22 | mergeado #518 |
| T2b | pnpm 12 (sale de la T2: toca CI, Docker y el build de Vercel; va aislado)                            | mergeado #525 |
| T3  | React 19.3 (ver abajo), date-fns 4, motion 14, @anthropic-ai/sdk 1.x                                 | pendiente     |
| T4  | @sentry/nextjs 11                                                                                    | pendiente     |
| T5  | Supabase CLI 2.x + `supabase/setup-cli` v3 (incluye `db-migrate.yml`, que corre contra prod)         | pendiente     |
| T6  | mercadopago 3 — OK del dueño antes de prod                                                           | pendiente     |
| T7  | pg-boss 12 — migra el schema `pgboss` en prod; efecto sobre El Vagón + OK antes                      | pendiente     |
| T8  | Node 24 LTS (Docker, CI, Vercel, `engines`) — se adelanta a la T3 (ver notas)                        | en curso      |

## Bloqueado

- **TypeScript 7**: typescript-eslint 8.72.1 declara `typescript >=4.8.4 <6.1.0`. Se queda en 6.0.3 hasta que typescript-eslint lo soporte.

## T1 — notas

- **React se queda en 19.2.9 (`~`) a propósito.** Con React 19.3.1 caen 3 tests deterministas de la confirmación sola (`AutoConfirm.tsx`: `form.requestSubmit()` dentro de un `useEffect`): `tests/unit/checkout-flow.test.tsx` y `tests/unit/reservar-page-intent.test.tsx`, la action nunca se llama. Aislado: con happy-dom viejo sigue rojo, con React 19.2.7 pasa. El changelog de 19.3 no lo anuncia como breaking (candidatos: los cambios de efectos en StrictMode y "transitions render independently"). Es el camino de la reserva con vínculo firmado, así que va a la T3 con diagnóstico propio, no a ciegas. `@types/react(-dom)` también quedan en 19.2.
- `eslint-config-next` 16.4.3 trae la regla `no-location-assign-relative-destination`: 3 warnings nuevos (`FavoritesList.tsx:55`, `FavoriteButton.tsx:56`), 0 errores. No se tocan en esta tanda.
- **axe-core 4.12.1 → 4.14.0** (vía `@axe-core/playwright` y `@storybook/addon-a11y`) prendió por defecto `label-content-name-mismatch` (WCAG 2.5.3, nivel A): 154 stories rojas, 355 casos en 34 componentes, casi todos `aria-label` que no contienen el texto visible del botón. Es trabajo de UI propio, no de versiones: la regla se apagó explícitamente en `.storybook/preview.tsx` y `tests/e2e/a11y/_helpers.ts`, y el PR que arregle los 34 componentes la vuelve a prender.
- axe 4.14 también encontró un contraste real en `RatingStars` (`opacity-60` sobre el color heredado = 2.8:1): se sacó la opacidad en las dos variantes.
- `server-no-importa-valores-de-modulos-client.test.ts` dio timeout (10 s) en una corrida cargada; solo pasa en 5.8 s. Flake de carga, no de la actualización.

## T2 — notas

- **El `singleThread` de Vitest 3 es `maxWorkers: 1` + `isolate: false` + `tests/setup.ts`.** Con `maxWorkers: 1` solo (lo que dejó el implementador), cada archivo abre un thread nuevo: unit pasó de 193 s a 982 s, y los pools de Postgres en `globalThis` dejaron de sobrevivir entre archivos de integración. Con `isolate: false` solo caen 156 archivos, porque singleThread hacía tres cosas que ahora hace el setup:
  - reevaluar los módulos fuente en cada archivo (`vi.resetModules()`);
  - deshacer en `afterAll` los stubs del último test, que si no llegan al environment del archivo siguiente;
  - reponer `process.env`, objeto y contenido. `r2-storage.test.ts` hace `process.env = {...}`. El proxy de `vi.stubEnv` en Vitest 5 lee y escribe en el `process.env` vivo, pero no tiene trap de `delete`, así que `stubEnv(key, undefined)` borra del objeto original y desde ese archivo en adelante borrar una variable dejaba de tener efecto (`web-push.test.ts` lo agarró).

  Resultado: unit 7259 verdes en ~90 s.

- **Deuda, no regresión: los archivos de happy-dom comparten el `window`.** Ya pasaba con singleThread (`in-app-browser-notice.test.tsx:18`, `auto-confirm.test.tsx:20`). El orden por defecto da verde. Con `--sequence.shuffle.files --sequence.seed=4242` fallan 6 tests en 2 archivos (`court-list-photo-gaps.test.tsx`: `data-tour-id` filtrado en el `<body>`; `rival-voy-leave-component.test.tsx`: `location` ajena). Los dos pasan solos y con `--isolate`. Si aparece un rojo en CI que no se reproduce aislado, empezar por ahí. Arreglo posible: reponer `document.body`, storages y `history` en el `afterAll` del setup.
- jest-dom 7 aumenta `Assertion<T>` y Vitest 5 usa `Assertion<R, T>`: el shim `tests/vitest-jest-dom.d.ts` cubre el overload de `toHaveTextContent` hasta que jest-dom lo corrija.
- happy-dom 21 ya no trae `window.prompt`: `story-share-dialog.test.tsx` lo stubea.
- `engines.node` sigue en `>=20.9`, aunque vitest 5 exige Node `^22.12` (vite 8 y eslint 10 piden `^20.19`). Afecta solo al tooling de dev: CI ya corre en Node 22. No se toca acá porque Vercel elige la versión de Node leyendo `engines`, así que se alinea en la T8.

## T2b — notas

- **pnpm 11+ ignora el campo `"pnpm"` de `package.json`.** overrides, `packageExtensions` y `publicHoistPattern` (antes en `.npmrc`) pasan a `pnpm-workspace.yaml`, y `onlyBuiltDependencies` pasa a `allowBuilds`. Con `strictDepBuilds`, que ahora viene prendido, un build no listado hace fallar el install.
- **Vercel usa pnpm 9/10 con `lockfileVersion: 9.0` salvo que esté prendido `ENABLE_EXPERIMENTAL_COREPACK=1`.** Desde el 2026-10-29 está prendido en Production: plain, id `aUjETLvitTUP1oI7`, lo cargó el orquestador con el OK de Lazar. Sin esa variable, pnpm 10 no lee el yaml y el build pierde los overrides. Preview no se tocó, porque los deploys de preview están apagados.
- **`minimumReleaseAge` queda en el default de 1 día** (decisión de Lazar). pnpm 11+ también la aplica al lock en el install: el lock de main, armado por pnpm 10 el 2026-10-28, tenía 31 entradas de menos de 24 h y el install falló hasta que vencieron. No es estructural, porque pnpm 12 respeta la política al resolver y un lock suyo nunca trae versiones tan nuevas.
- **`verifyDepsBeforeRun: false`**, como en pnpm 10. Con el default de pnpm 11+ cada `pnpm run` y cada `pnpm exec` vuelve a revisar el lock contra la política (1604 entradas, 4 a 7 s) y falla si la revisión falla. Cualquier `pnpm run` pasaría por ese chequeo, incluido `pnpm jobs:start` en local. La protección se mantiene donde importa: en el install, que en frío (Docker, sin cache) tarda ~54 s en revisar las 1604 entradas.
- pnpm 12 es un binario nativo con un wrapper de Node que declara `engines: node >=18`. El piso de Node 22 era de pnpm 11. Lo que sí exige es corepack ≥0.34.5 (2025-11-24, "fix bin path for v11"): desde la 11 el paquete trae solo `bin/pnpm.mjs`, y una corepack anterior busca `bin/pnpm.cjs` y no arranca. Node 24.14.1 trae la 0.34.6 y `node:22-slim` (Node 22.23.4) la 0.36.0: la imagen del worker buildea e instala con pnpm 12.16.1. La de Vercel se ve recién en el primer build de prod, que si falla deja el deploy anterior. `engines` sigue en `>=20.9` y se alinea en la T8.
- **El worker arranca con `node --import tsx src/shared/jobs/run-workers.ts`, no con `pnpm jobs:start`** (`railway.toml` y `CMD` de `Dockerfile.worker`). Railway corre el start command como PID 1. Prueba en Docker del 2026-10-29: un script que imprime al recibir SIGTERM, `docker stop -t 15`.
  - `pnpm jobs:start` con pnpm 12: la señal no llega, el stop tarda 15,5 s y termina en SIGKILL (exit 137).
  - Con pnpm 10, que es prod hasta este cambio: pnpm se cierra en 0,4 s (`ELIFECYCLE`) y el contenedor se lleva puesto al hijo antes de que maneje la señal.
  - Con `node --import tsx`: llega en 0,3 s, exit 0.
  - O sea que el `stopBoss()` de `run-workers.ts` nunca corría en prod: el arreglo corrige un bug previo, no solo el de pnpm 12.
  - Los alias `@/` resuelven igual: sin env, el arranque llega hasta el `ECONNREFUSED` de la base.
  - Que llegue la señal no alcanza: Railway espera 0 s por defecto entre SIGTERM y SIGKILL, y `stopBoss()` espera hasta 5 s. Por eso `railway.toml` agrega `drainingSeconds = 10` (el schema de Railway lo tipa como número). Railway misma recomienda arrancar Node directo: docs.railway.com/deployments/troubleshooting/nodejs-sigterm-handling.
  - Después del merge, en el log del deploy viejo de Railway tiene que aparecer `received signal, stopping...`.
- `pnpm/action-setup@v6` flotante apunta a un commit anterior a v6.1.0, que es la primera con pnpm 12. Por eso se pineó `@v6.1.0`.
- La sintaxis `"$react"` de overrides tira un warning de deprecación. Lo que propone pnpm es un `catalog:`, que cambia `package.json`: queda para cuando se toque React (T3).

- **Después del merge (2026-10-29):**
  - Vercel: "Detected ENABLE_EXPERIMENTAL_COREPACK=1 and pnpm@12.16.1", install verde y supply-chain en 3,7 s. `dpl_CCjfwxUB5SRK5m4CWPKmfz1M8YxA` quedó READY en turnogol.app.
  - Railway: el worker nuevo registró las 24 colas, levantó el health server y dio `health.ping.ok`.
  - Al worker anterior, que todavía arrancaba con `pnpm jobs:start`, le llegó "sending signal SIGTERM to container" y 0,1 s después cortó con `ELIFECYCLE Command failed`, sin `received signal, stopping...`. Es el bug medido en Docker, confirmado en prod.
  - El apagado limpio se ve recién en el próximo deploy del worker.

## T8 — notas

- **Se adelanta a la T3.** El build de prod de #525 avisó: `Due to "engines": { "node": ">=20.9" } ... the Node.js Version defined in your Project Settings ("24.x") will not apply, Node.js Version "26.x" will be used instead`. O sea que la web corría en Node 26, que es la versión Current y no LTS, mientras el desarrollo local, el CI y los tests corrían en 22 o 24.
- `engines.node: "24.x"`. Es el formato que Vercel documenta para fijar una mayor y coincide con el setting del proyecto. **pnpm no lo hace cumplir**: sin `engineStrict`, pnpm 12.16.1 instala con otro Node sin avisar (lo midió el verificador con `engines: 26.x` y Node 24). Docker y CI quedan en 24 porque lo fijan a mano. No se prende `engineStrict`: también falla el install por el `engines` de cualquier dependencia futura, y para el riesgo real, que es prod, ya alcanza con Vercel.
- `@types/node` 22 → 24, para que los tipos sean los del runtime.
- Docs que decían Node 20 o 22 como requisito: `CONTRIBUTING.md`, `docs/operations/self-hosted-runner.md` (el runner no existe, es un plan) y `doc16`.

## T1 — notas de CI

- `supabase/setup-cli` NO se tocó en T1: está en `db-migrate.yml`, que aplica migraciones a prod al mergear. Va con T5.
- `gitleaks-action@v2` corría en Node 20, que GitHub sacó de los runners el 2026-09-16; v3 solo cambia el runtime.
- `actions/checkout@v7` bloquea el checkout de forks en `pull_request_target`/`workflow_run`; el repo no usa ninguno de los dos.
- `.claude/skills/supabase` del árbol principal está gitignoreado y es una copia aparte de `.agents/skills/supabase`: después del merge hay que correr `pnpm dlx skills update -p -y` también en el árbol principal.

## Delegaciones

| Fecha      | Agente                      | Finalidad                                                                                        | Costo aprox.                                           | Resultado                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-28 | sonnet-adversarial-reviewer | Verificación fresca del diff de T1 antes de commitear                                            | ~80k tokens                                            | GO, sin 🔴. 🟡 `Dockerfile.worker` seguía en pnpm 10.34.5 → alineado. Supabase CLI: el lock ya tenía 1.226.4, solo subió el piso del rango. REQUIERE INPUT: jerarquía del conteo de `RatingStars` (Lazar: queda así)                                                                                                                                        |
| 2026-10-28 | sonnet-implementer          | T2: migrar vitest 5, vite 8, eslint 10, happy-dom 21, jest-dom 7, dotenv 18, @types/node 22      | ~156k tokens (cortado una vez por ENOTFOUND, retomado) | Verde: lint 0 errores, unit 7259, storybook 1494/1494, build ok. Sacó el plugin de worktree anidado (probado sin él). No leyó las guías de vite 7/8, jest-dom 7, happy-dom 21 ni dotenv 17/18                                                                                                                                                               |
| 2026-10-28 | sonnet-adversarial-reviewer | Verificación fresca del diff de T2 + las guías que el implementador no leyó                      | ~214k tokens                                           | GO con reservas, sin 🔴. 🟡 `maxWorkers: 1` sin `isolate: false` = un thread nuevo por archivo: unit 193 s → 982 s y los pools en `globalThis` de integración ya no sobreviven entre archivos. eslint 10 con paridad de reglas exacta contra eslint 9. Shim de tipos legítimo (5 errores reales de tipos sin él). `build-storybook` y storybook dark verdes |
| 2026-10-29 | sonnet-adversarial-reviewer | Verificación fresca del delta `isolate: false` + `tests/setup.ts` (lo implementó el orquestador) | ~89k tokens                                            | GO con reservas, sin 🔴. Unit 7259 en 91 s. Orden de hooks `stack`: el `afterAll` del setup corre después del teardown de cada archivo; pools en `globalThis` sin agotamiento. 🟡 `window` de happy-dom compartido (preexistente, anotado como deuda). Corrigió la causa descrita del bug de `stubEnv`                                                      |
| 2026-10-29 | sonnet-reconnaissance       | T2b: superficies de pnpm 12 (config, CI, Docker, Vercel) y probe de install con pnpm 12          | ~74k tokens                                            | Mapa completo. Vercel necesita corepack para leer `packageManager`; `pnpm/action-setup` soporta pnpm 12 desde v6.1.0                                                                                                                                                                                                                                        |
| 2026-10-29 | sonnet-implementer          | T2b: migrar a pnpm 12.16.1                                                                       | ~80k tokens (hasta la fase A)                          | Paró en el install por la regla de corte: 31 entradas del lock de menos de 24 h. Fase A con override efímero por env: juez, unit 7259 y build verdes; lock sin cambios de versión. Encontró el costo de `verifyDepsBeforeRun`                                                                                                                               |
| 2026-10-29 | sonnet-adversarial-reviewer | Verificación fresca del diff de T2b (config, lock, CI, Docker, Vercel) + storybook               | ~109k tokens                                           | GO con reservas, sin 🔴. Storybook 1496/1496, lock solo aditivo, claves reconocidas por pnpm 12. 🟡 el wrapper `bin/pnpm.mjs` hace `spawnSync` y no maneja SIGTERM: el worker podría no recibirlo en Railway (se prueba en la fase B). 🟡 corepack de Vercel sin verificar y la variable sin documentar (→ playbook). 🟢 skill con `pnpm.overrides`         |
| 2026-10-29 | sonnet-implementer          | T2b fase B: install sin override, Docker y prueba de SIGTERM                                     | ~0 (lo cortó el fin de sesión antes de arrancar)       | Sin trabajo. La fase B la corrió el orquestador: install frozen OK, juez y unit 7259 verdes, imagen con pnpm 12.16.1 y corepack 0.36.0, SIGTERM perdido con pnpm 10 y 12 → start command con Node directo                                                                                                                                                   |
| 2026-10-29 | sonnet-adversarial-reviewer | Verificación fresca del start command del worker (`railway.toml`, `Dockerfile.worker`, docs)     | ~78k tokens                                            | GO con reservas, sin 🔴. `node --import tsx` usa el mismo loader que la CLI; probó en la imagen los alias de los `import()` dinámicos. Railway corre el start command en exec form con builder Dockerfile. 🟡 draining de 0 s por defecto → `drainingSeconds = 10`. 🟢 dos docs que mandaban a deployar con pnpm → corregidos                               |
| 2026-10-29 | sonnet-adversarial-reviewer | T8: verificación fresca del pase a Node 24 (engines, Docker, CI, Vercel)                         | ~72k tokens                                            | GO con reservas, sin 🔴. Imagen `node:24-slim` con corepack 0.36.0 y pnpm 12.16.1; sin env muere en `ECONNREFUSED`; SIGTERM en 0,8 s con `node --import tsx`. Ninguna dependencia excluye Node 24. 🟡 "pnpm hace cumplir `engines`" era falso → corregido. 🟡 tres docs con Node 20/22 → corregidas                                                         |
