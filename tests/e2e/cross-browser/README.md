# Cross-browser smoke tests

Specs en este folder corren en 3 projects Playwright multi-browser:

- `webkit` — Safari macOS-like (Desktop Safari device profile)
- `firefox` — Firefox desktop
- `mobile-safari` — iPhone 14 device profile (Safari mobile-like)

## One-time setup

```sh
# Install WebKit and Firefox browsers (Chromium ya instalado por default)
pnpm playwright install webkit firefox
```

## Run

```sh
# All cross-browser specs in 3 projects
pnpm test:e2e:cross-browser

# Single project
pnpm playwright test --project webkit
pnpm playwright test --project firefox
pnpm playwright test --project mobile-safari

# Single spec
pnpm playwright test tests/e2e/cross-browser/public-smoke.spec.ts --project webkit
```

## Pre-requisites

- `pnpm dev` running on `http://localhost:3000` (Playwright `webServer` config maneja esto)
- NO requiere Supabase ni seed E2E completo (specs son public no-auth, renderizan skeleton/empty si DB vacía)

## Qué cubre

Cada spec corre 3 veces (una por project), efectivamente cubriendo:

| Spec | Coverage |
|------|----------|
| `public-smoke.spec.ts` | Landing `/`, `/explorar`, skip-to-content link |
| `login-smoke.spec.ts` | `/login` input attributes, HTML5 validation, no horizontal scroll |

Total: 6 tests × 3 projects = 18 test runs.

## Qué NO cubre (requiere humano)

- Magic link via email real (Safari Mail.app webview testing)
- Safari iOS PWA install flow (Add to Home Screen)
- Web Push real notification delivery
- MercadoPago Checkout full flow (sandbox real)
- Admin flows con auth (storage state es Chromium-specific por simplicidad F13; ampliar a webkit/firefox seed adicional es backlog)

## Storage state strategy

Cross-browser specs **NO usan storage state**. Razón: el seed F2 entrega `adminStorageState` via worker fixture que mintea Supabase session real en chromium context. Reusar a webkit/firefox requiere:
1. Mintear session real en cada browser context (complejo, requiere refactor de fixture)
2. O dispatch shared storage state JSON entre projects (Playwright soporta pero requiere paths cross-platform handling)

F13 prioriza coverage public path (donde 99% de errores cross-browser surgen). Auth flows cross-browser delegados a smoke manual humano (`docs/browser-support.md` §Smoke checklist).

## Referencias

- `playwright.config.ts:26-60` — projects definition
- `docs/browser-support.md` — matriz browsers + smoke checklist humano
- F2 report — `docs/audit/reports/fase-f02-auth-onboarding-report.md` (storage state pattern)
- F11 report — `docs/audit/reports/fase-f11-accessibility-report.md` (skip-to-content)
