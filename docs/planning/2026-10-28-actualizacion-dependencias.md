# Actualización de dependencias — ledger (2026-10-28)

Pedido de Lazar: llevar a la última versión **estable** todo lo que usa el repo (librerías, CI, runtime, plugins, skills, MCPs), incluidos los saltos mayores que tocan plata y datos. Una rama y un PR por tanda; juez verde entre tandas.

## Tandas

| #   | Alcance                                                                                                       | Estado    |
| --- | ------------------------------------------------------------------------------------------------------------- | --------- |
| T1  | Patch/minor de npm, GitHub Actions, pnpm 10.34.9, skills de `skills-lock.json`, plugin sentry                 | en curso  |
| T2  | vitest 5 + @vitest/browser 5, vite 8, eslint 10, happy-dom 21, jest-dom 7, dotenv 18, @types/node 22, pnpm 12 | pendiente |
| T3  | React 19.3 (ver abajo), date-fns 4, motion 14, @anthropic-ai/sdk 1.x                                          | pendiente |
| T4  | @sentry/nextjs 11                                                                                             | pendiente |
| T5  | Supabase CLI 2.x + `supabase/setup-cli` v3 (incluye `db-migrate.yml`, que corre contra prod)                  | pendiente |
| T6  | mercadopago 3 — OK del dueño antes de prod                                                                    | pendiente |
| T7  | pg-boss 12 — migra el schema `pgboss` en prod; efecto sobre El Vagón + OK antes                               | pendiente |
| T8  | Node 24 LTS (Docker, CI, Vercel, `engines`) — opcional                                                        | pendiente |

## Bloqueado

- **TypeScript 7**: typescript-eslint 8.72.1 declara `typescript >=4.8.4 <6.1.0`. Se queda en 6.0.3 hasta que typescript-eslint lo soporte.

## T1 — notas

- **React se queda en 19.2.9 (`~`) a propósito.** Con React 19.3.1 caen 3 tests deterministas de la confirmación sola (`AutoConfirm.tsx`: `form.requestSubmit()` dentro de un `useEffect`): `tests/unit/checkout-flow.test.tsx` y `tests/unit/reservar-page-intent.test.tsx`, la action nunca se llama. Aislado: con happy-dom viejo sigue rojo, con React 19.2.7 pasa. El changelog de 19.3 no lo anuncia como breaking (candidatos: los cambios de efectos en StrictMode y "transitions render independently"). Es el camino de la reserva con vínculo firmado, así que va a la T3 con diagnóstico propio, no a ciegas. `@types/react(-dom)` también quedan en 19.2.
- `eslint-config-next` 16.4.3 trae la regla `no-location-assign-relative-destination`: 3 warnings nuevos (`FavoritesList.tsx:55`, `FavoriteButton.tsx:56`), 0 errores. No se tocan en esta tanda.
- **axe-core 4.12.1 → 4.14.0** (vía `@axe-core/playwright` y `@storybook/addon-a11y`) prendió por defecto `label-content-name-mismatch` (WCAG 2.5.3, nivel A): 154 stories rojas, 355 casos en 34 componentes, casi todos `aria-label` que no contienen el texto visible del botón. Es trabajo de UI propio, no de versiones: la regla se apagó explícitamente en `.storybook/preview.tsx` y `tests/e2e/a11y/_helpers.ts`, y el PR que arregle los 34 componentes la vuelve a prender.
- axe 4.14 también encontró un contraste real en `RatingStars` (`opacity-60` sobre el color heredado = 2.8:1): se sacó la opacidad en las dos variantes.
- `server-no-importa-valores-de-modulos-client.test.ts` dio timeout (10 s) en una corrida cargada; solo pasa en 5.8 s. Flake de carga, no de la actualización.

- `supabase/setup-cli` NO se tocó en T1: está en `db-migrate.yml`, que aplica migraciones a prod al mergear. Va con T5.
- `gitleaks-action@v2` corría en Node 20, que GitHub sacó de los runners el 2026-09-16; v3 solo cambia el runtime.
- `actions/checkout@v7` bloquea el checkout de forks en `pull_request_target`/`workflow_run`; el repo no usa ninguno de los dos.
- `.claude/skills/supabase` del árbol principal está gitignoreado y es una copia aparte de `.agents/skills/supabase`: después del merge hay que correr `pnpm dlx skills update -p -y` también en el árbol principal.

## Delegaciones

| Fecha      | Agente                      | Finalidad                                             | Costo aprox. | Resultado                                                                                                                                                                                         |
| ---------- | --------------------------- | ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-28 | sonnet-adversarial-reviewer | Verificación fresca del diff de T1 antes de commitear | ~80k tokens  | GO, sin 🔴. 🟡 `Dockerfile.worker` seguía en pnpm 10.34.5 → alineado. Supabase CLI: el lock ya tenía 1.226.4, solo subió el piso del rango. REQUIERE INPUT: jerarquía del conteo de `RatingStars` |
