# Auditoría funcional TurnoGol — Índice

Auditoría vista por vista con Chrome DevTools MCP sobre el dev server local (`localhost:3000`, modo `NEXT_PUBLIC_E2E=1`, Supabase local seedeado).

- `AUDIT_01_public.md` — Vistas públicas (landing, explorar, perfil complejo, reservar, legales, resultado de reserva)
- `AUDIT_02_auth.md` — Login, register, verify
- `AUDIT_03_onboarding.md` — Wizard de onboarding
- `AUDIT_04_admin.md` — Panel de administración
- `AUDIT_05_player.md` — Panel del jugador
- `AUDIT_06_general.md` — Issues generales (performance, accesibilidad, consola global)

## Entorno de prueba
- Dev server: `pnpm dev` con `NEXT_PUBLIC_E2E=1`, `MP_MOCK_MODE=1`, Upstash vacío (rate-limit degradado).
- Supabase local (API `:54331`, Studio `:54323`, Inbucket `:54324`).
- Tenant demo seedeado: `e2e-complejo-demo` (slug), admin `e2e-admin@turnogol.test`, player `e2e-player@turnogol.test`, tenant con seña `e2e-complejo-sena`.
- Auth en browser vía magic-link real capturado en Inbucket.

## Leyenda de severidad
- 🔴 Crítico — rompe funcionalidad core
- 🟡 Medio — funciona pero con problemas
- 🟢 Menor — cosmético o edge case
