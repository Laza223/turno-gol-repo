# TurnoGol — Browsers soportados

**Versión doc:** 1.0
**Fecha:** 2026-05-29
**Audiencia:** equipo de producto + soporte. Define qué browsers se prueban y qué hacer si un usuario reporta un problema en un browser fuera de la matriz.

## Matriz de browsers soportados

| Browser | Min version | Notas |
|---------|-------------|-------|
| Chrome desktop (Windows / macOS / Linux) | 108+ | Target principal — full support |
| Chrome Android | 108+ | Mobile target principal. PWA install via beforeinstallprompt opcional |
| Firefox desktop | 115 ESR / latest 2 | Web Push VAPID estándar W3C. `env(safe-area-inset-*)` no soportado → degrade gracefully a 0px ✓ |
| Safari macOS | 15.4+ | `svh`/`lvh`/`dvh` desde 15.4. BroadcastChannel desde 15.4. Web Push desde 16.1 |
| Safari iOS | 15.4+ navegación, **16.4+ para Web Push** | Push requiere PWA installed (Add to Home Screen). `svh`/`lvh`/`dvh` desde 15.4 |
| Edge desktop | 108+ | Chromium-based, mismo soporte que Chrome |

## Out-of-scope (NO soportados)

- **IE 11** — EOL Microsoft 2022, no testeado, layout puede romper silenciosamente
- **Chrome <108** (released 2022-11) — pre-`focus-visible:` cascade reliable
- **Safari <15** — sin `svh`/`lvh`/`dvh`; layouts mobile pueden no llenar viewport
- **Firefox <115** — pre-ESR base actual
- **Opera Mini** — proxy browser, sin JS dinámico
- **Samsung Internet <22** — no testeado, ChromiumWebView mayoría debería funcionar

## Features con caveats per-browser

### Web Push (admin notifications)
- Chrome desktop / Android: full ✓
- Firefox desktop / Android: full ✓ (VAPID estándar)
- Safari macOS 16.1+: full ✓
- Safari iOS 16.4+: **requiere PWA installed** (Add to Home Screen) ANTES de poder solicitar permiso. Sin install → `Notification.permission` permanece `default` o el `PushManager` ni existe
- Safari iOS <16.4: no soportado → manager F9 muestra status `'unsupported'` (UI degrada gracefully)

### `env(safe-area-inset-*)` (notch / dynamic island)
- Safari iOS / iPadOS 11.1+: full ✓ (requiere viewport-fit=cover, ya configurado en `src/app/layout.tsx:58`)
- Chrome Android 69+: full ✓
- Firefox: NO soporta → resuelve a `0px` (no rompe layout, solo no respeta safe area en devices con notch)
- Chrome desktop: no relevante (sin notch)

### Viewport units `svh` / `lvh` / `dvh` (modal heights)
- Safari iOS / macOS 15.4+: ✓
- Chrome 108+: ✓
- Firefox 101+: ✓
- Browsers viejos: caen a default `vh` (puede causar modal cortado por toolbar mobile; aceptable degradación)

### BroadcastChannel (multi-tab dedupe push notifications)
- Chrome / Edge: ✓
- Firefox: ✓
- Safari macOS / iOS 15.4+: ✓
- Browsers viejos: PushNotificationManager feature-detect en cliente → fallback a notificación nativa SW

### MercadoPago Checkout
- Flujo: top-level redirect a `*.mercadopago.com` (NO iframe). Funciona en cualquier browser que soporte redirect HTTP.
- Safari iOS: ITP no afecta (es navegación top-level, no fetch cross-site)
- Safari Mail.app webview: caveat documentado — magic link en mail puede abrir en webview sandbox. Si el usuario reporta "no me deja loguear desde el mail", pedirle abrir el link en Safari principal

### Realtime grilla (WebSocket Supabase)
- Todos los browsers modernos: ✓ (Safari iOS aggressive tab suspension > 30s background reconecta con catch-up ✓ F3)

### Clipboard API (copy public link)
- Chrome / Edge / Firefox: ✓
- Safari macOS 13.1+ / iOS 13.4+ (HTTPS): ✓
- HTTP context o Safari Private Mode: degrade gracefully a `window.prompt()` fallback (T4 F13)

## Criterios de "soportado"

Un browser está "soportado" si:
1. Todos los flujos críticos completan (login, navegar grilla, crear booking admin, ver tenant portal público, completar checkout MP)
2. UI renderiza sin texto cortado, scroll horizontal accidental, ni elementos invisibles
3. Si una feature no está disponible (ej. Web Push en Safari iOS sin PWA install), la UI lo detecta y degrade gracefully (no muestra opción que falla)

NO requiere:
- Pixel-perfect match (variación menor de fonts, focus rings, sombras entre browsers es aceptable)
- Web Push en Safari iOS sin PWA install (gracefully detected unsupported)
- `env(safe-area-inset-*)` en browsers desktop sin notch

## Smoke checklist humano (post-deploy / pre-launch)

Ejecutar este checklist en cada uno de los 5 browsers target la primera vez antes de launch v1.0, y luego cuando haya un release mayor.

### Chrome desktop (Windows / macOS)
1. Navegar a `https://turnogol.app` → landing carga, hero visible
2. Click "Iniciar sesión" → `/login` carga
3. Ingresar email admin de prueba → "Te enviamos un email" mostrado
4. Abrir email en Gmail web → click magic link → redirige a `/dashboard` o `/onboarding`
5. (Admin onboarded) Navegar `/grilla` → grilla visible con canchas + horarios
6. Click slot libre → modal "Crear reserva" abre, fit en viewport
7. Cerrar modal (Esc o X) → vuelve a grilla
8. (En otro tab) DevTools → Application → Service Workers → confirmar `sw.js` activo con scope `/`
9. Click botón "Habilitar notificaciones" → prompt browser nativo → Permitir → toast "Notificaciones habilitadas"
10. Logout → vuelve a `/login`

### Safari macOS
1-10. Mismo flow Chrome desktop
11. (Adicional) Verificar focus-visible: Tab por la página → ring visible solo con Tab, no con click. F11 cascade.
12. (Adicional) Verificar gap entre flex items en cards admin (gap support Safari 14.1+, OK).

### Safari iOS (iPhone real)
1. Abrir `https://turnogol.app` en Safari
2. Navegar `/explorar` → search funcional, no horizontal scroll
3. Tap complejo de prueba → portal `/c/{slug}` carga
4. Tap "Ver disponibilidad" → `/[slug]/disponibilidad` carga con grid
5. Tap slot → form de reserva visible, keyboard tel correcto en celular
6. **PWA install** (para test push):
   - Tap Compartir (icono cuadrado con flecha)
   - "Añadir a inicio"
   - Confirmar
   - Abrir desde icono home (NO desde Safari)
   - Login como admin
   - Tap "Habilitar notificaciones"
   - Permitir
   - **Verificar:** llega push notification de test desde panel
7. Logout

### Chrome Android (real device)
1. Abrir Chrome → `https://turnogol.app`
2. Mismo flow Safari iOS (sin paso PWA — Chrome Android prompt install opcional, push funciona sin instalar)
3. Verificar `inputMode="tel"` abre keyboard numérico tel
4. Verificar `inputMode="decimal"` abre keyboard numérico con coma decimal (locale es-AR)
5. (Si Add to Home prompt aparece) Aceptar → verificar install y abre standalone

### Firefox desktop
1. Mismo flow Chrome desktop
2. (Adicional) Verificar `env(safe-area-inset-*)` NO rompe layout (Firefox no soporta, debe resolver a 0px). Header admin debe verse normal sin gap raro
3. Verificar push notification: Firefox usa autopush, prompt nativo debería aparecer

## Qué hacer si un usuario reporta un problema en un browser fuera de la matriz

1. Pedirle browser + versión exacta (`chrome://version`, `about:support`, etc.)
2. Si está fuera de la matriz: explicar que ese browser no está soportado oficialmente, ofrecer alternativa (Chrome / Safari latest)
3. Si está dentro pero falla: abrir issue en repo con `browser: <name version>` label + reproducción
4. Si es un bug que afecta a Safari iOS (mayor user base potencial argentino), priorizar P1

## Cómo correr smoke automatizado (Playwright)

```sh
# One-time install
pnpm playwright install webkit firefox

# Run cross-browser smoke (NO requiere auth, public flows only)
pnpm test:e2e:cross-browser

# Run mobile-specific (Chrome Pixel 5)
pnpm playwright test --project mobile-chrome

# Run a11y suite (axe-core, Desktop Chrome)
pnpm playwright test --project axe-audit
```

Los tests automatizados cubren:
- Public landing + search + portal smoke en 3 projects (`webkit`, `firefox`, `mobile-safari` — `tests/e2e/cross-browser/`; `chromium` los excluye explícitamente vía `testIgnore` y `mobile-chrome` no los matchea, ver `playwright.config.ts`)
- No horizontal scroll en cada viewport
- Skip-to-content link visible en focus

NO cubren (requieren humano):
- Magic link via email real (Safari Mail.app webview testing)
- Safari iOS PWA install flow (Add to Home Screen)
- Web Push real notification delivery
- MP Checkout completo con sandbox real

## Referencias

- F9 Notificaciones (Web Push) — `docs/audit/reports/fase-f09-notificaciones-report.md`
- F10 Responsive/Mobile — `docs/audit/reports/fase-f10-responsive-mobile-report.md`
- F11 Accessibility — `docs/audit/reports/fase-f11-accessibility-report.md`
- F12 Performance — `docs/audit/reports/fase-f12-performance-report.md`
- MASTER_PLAN líneas 234-237 — done-criteria F13
