# 🧠 Qué modelo usar en cada prompt — TurnoGol

## Respuesta corta

**NO, no necesitás Opus para todo.** Sonnet es más que suficiente para el 80% de los prompts, y en muchos benchmarks de código **Sonnet rinde igual o mejor que Opus** pero es significativamente más rápido y consume menos tokens.

---

## Cómo cambiar de modelo en Claude Code

### Opción 1: En medio de la sesión (la más rápida)
```
/model sonnet     ← cambia a Sonnet
/model opus       ← cambia a Opus
/model haiku      ← cambia a Haiku (el más rápido y barato)
/model default    ← vuelve al default de tu plan
```

### Opción 2: Al iniciar Claude Code
```powershell
claude --model sonnet    # arranca con Sonnet
claude --model opus      # arranca con Opus
```

### Opción 3: Default permanente (settings.json)
En `~/.claude/settings.json`:
```json
{
  "model": "claude-sonnet-4-6"
}
```

> [!TIP]
> **Workflow ideal**: Arrancá siempre con `/model sonnet`. Cuando llegues a un prompt que necesite Opus, escribí `/model opus` antes del prompt. Cuando termines, volvé con `/model sonnet`.

---

## Cuándo usar cada modelo

### Sonnet (80% de los prompts) — El "daily driver"
✅ Escribir código nuevo (services, routes, schemas)
✅ CRUD, endpoints REST, Server Actions
✅ Tests unitarios y de integración
✅ Componentes de UI (React, shadcn)
✅ Configuración (ESLint, Tailwind, Drizzle, etc.)
✅ Debugging y refactoring
✅ Todo lo que sea "implementar algo bien definido en los docs"

### Opus (20% de los prompts) — El "arquitecto"
🧠 Diseño de state machines complejas (Booking)
🧠 RLS policies con lógica dual/relacional cruzada
🧠 Concurrencia y race conditions (transitionFromPendingPayment)
🧠 Trigger functions de PostgreSQL complejas
🧠 Integración de webhooks con idempotencia
🧠 Decisiones arquitectónicas que cruzan múltiples módulos
🧠 Debugging de bugs sutiles que Sonnet no resuelve

### Haiku — Solo para consultas rápidas
⚡ "¿Cómo se escribe X en Drizzle?"
⚡ "¿Qué hace esta query?"
⚡ Generar boilerplate trivial

---

## 📋 Modelo recomendado por prompt

| Prompt | Fase | Modelo | ¿Por qué? |
|---|---|---|---|
| **Pre-P0** | Setup skills | Sonnet | Solo instalar plugins, no necesita razonamiento |
| **P0** | Setup repo | Sonnet | Configuración estándar de proyecto |
| **P1** | Schema + RLS | **🧠 OPUS** | **El prompt más crítico. 21 hallazgos, RLS dual, triggers, 8 archivos SQL interconectados. Si esto sale mal, todo lo demás falla.** |
| **P2** | Tests isolation | Sonnet | Tests bien definidos en doc16, solo implementar |
| **P3** | Auth + Middleware | **🧠 OPUS** | SET LOCAL, JWT claims, resolución multi-tenant, OAuth callback — lógica cruzada delicada |
| **P4** | Tenants + Wizard | Sonnet | CRUD + wizard de UI, bien definido |
| **P5** | Página pública | Sonnet | Server Component + queries simples |
| **P6** | Courts | Sonnet | CRUD + `calculatePrice` (lógica clara) |
| **P7** | Bookings core | **🧠 OPUS** | **State machine + concurrencia + `transitionFromPendingPayment` + exclusion constraint. El corazón del sistema.** |
| **P8** | API Bookings | Sonnet | Endpoints que delegan al service de P7 |
| **P9** | Grilla + Realtime | Sonnet | Componentes React + Supabase Realtime |
| **P10** | Payments gateway | **🧠 OPUS** | **Idempotencia, `in_process`, refunds, consistency checks — Pilar B completo** |
| **P11** | Webhook MP | **🧠 OPUS** | **Webhooks fuera de orden, race conditions, audit de pagos tardíos** |
| **P12** | Cancelaciones | Sonnet | 4 variantes claras en doc7, lógica derivada de P7+P10 |
| **P13** | CashFlow | Sonnet | Reglas claras post-auditoría, sin complejidad concurrente |
| **P14** | Abonados + PTR | Sonnet | Generación rolling + PTR idempotente |
| **P15** | Player app | Sonnet | UI mobile + queries cross-tenant simples |
| **P16** | Bans | Sonnet | Verificación de bans, lógica directa |
| **P17** | Notifications | Sonnet | pg-boss workers + templates, bien definido |
| **P18** | Billing SaaS | **🧠 OPUS** | **Dunning state machine de 8 estados + prorrateo + data retention — lógica de negocio compleja** |
| **P19** | Dashboard admin | Sonnet | UI + banners de estado |
| **P20** | Reportes | Sonnet | Queries de agregación + CSV export |
| **P21** | CI/CD + Deploy | Sonnet | GitHub Actions + Sentry config |

### Resumen visual:
```
Sonnet: P0, P2, P4, P5, P6, P8, P9, P12-P17, P19-P21  (15 prompts = 68%)
Opus:   P1, P3, P7, P10, P11, P18                       (6 prompts  = 27%)
Haiku:  Pre-P0                                           (1 prompt   = 5%)
```

---

## 💰 Impacto en tu consumo de tokens

Con plan **Pro ($20/mes)** tenés ~44k tokens por ventana de 5 horas.

| Modelo | Consumo relativo | Velocidad |
|---|---|---|
| Haiku | 1x (baseline) | Muy rápido |
| Sonnet | ~3-5x vs Haiku | Rápido |
| Opus | ~10-15x vs Haiku | Lento |

> [!WARNING]
> **Opus consume tokens MUCHO más rápido.** Un prompt complejo en Opus puede consumir 3-5x más que el mismo prompt en Sonnet. Por eso es clave usarlo solo donde realmente importa.

### Estrategia práctica:
1. Arrancá SIEMPRE con Sonnet
2. Antes de P1 (schema), P3 (auth), P7 (bookings), P10-P11 (payments), P18 (billing): `/model opus`
3. Después de cada prompt Opus: `/model sonnet`
4. Si Sonnet no puede con algo → escalá a Opus en ese momento

---

## Cómo cambiarlo en la práctica (flujo de un prompt)

```
# Estás en Sonnet (default)
> Llegás a P7 (Bookings core)

/model opus
# Esperás confirmación: "Switched to claude-opus-4-7"

# Pegás el prompt de P7...
# Opus genera el plan → aprobás → genera código → tests pasan

/model sonnet
# Volvés al daily driver para P8
```

> [!TIP]
> Si tenés el plan **Max 5x o 20x**, podés ser más liberal con Opus. Con **Pro**, sé estratégico y reservá Opus para los 6 prompts críticos listados arriba.
