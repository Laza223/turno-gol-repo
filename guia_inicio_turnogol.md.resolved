# 🏟️ TurnoGol — Guía de Inicio

## ¿Dónde estás parado ahora?

Tu repo tiene **documentación completa** pero **casi cero código**. Concretamente:

| Lo que YA tenés | Lo que FALTA |
|---|---|
| 20 documentos de diseño (`docs/doc1` a `doc20`) | Todo el código de la aplicación |
| 3 auditorías de Opus 4.7 (`audit_opus4.7-*.md`) | `package.json` con dependencias reales |
| `CLAUDE.md` (reglas del proyecto) | Schema de base de datos |
| `DECISIONES_SISTEMA.md` | Módulos de negocio |
| `plan_de_ataque.md` (el plan de 22 prompts) | Frontend, backend, tests, deploy |

**En resumen**: tenés un blueprint arquitectónico impecable, pero la casa todavía no se empezó a construir.

---

## ¿Qué es el `plan_de_ataque.md`?

Es una **lista de 22 prompts (P0 a P21)** organizados en 14 fases. Cada prompt es una instrucción específica que le das a un asistente de IA (como yo o Claude Code) para que construya una parte del sistema.

### La idea es simple:
1. **Copiás un prompt** del plan → se lo das al asistente
2. El asistente **presenta un plan** (no escribe código todavía)
3. Vos **revisás y aprobás** el plan
4. El asistente **escribe el código**
5. Verificás que pasa los tests → **commit + avanzás al siguiente prompt**

### Analogía: es como un recetario
Cada "P-N" es una receta. No saltees pasos, no mezcles recetas, y si algo falla, no avances.

---

## ¿Qué herramienta usar?

El plan fue diseñado para **Claude Code** (extensión de VS Code de Anthropic), pero **yo puedo ejecutar exactamente los mismos pasos**. Las instrucciones de `/clear`, `/compact` y `/memory` son comandos específicos de Claude Code que no se aplican acá, pero el flujo de trabajo es el mismo:

| Concepto Claude Code | Equivalente conmigo |
|---|---|
| `/clear` | Empezamos una conversación nueva |
| `/compact` | Yo mantengo el contexto internamente |
| `/memory` | Yo leo `CLAUDE.md` cuando lo necesito |
| `@docs/docXX.md` | Yo leo los archivos directamente |
| Plan Mode | Yo te presento el plan antes de escribir código |

---

## 🗺️ Hoja de ruta: Las 3 grandes etapas

```
┌─────────────────────────────────────────────────┐
│  ETAPA 1: CIMIENTOS (P0-P2)                     │
│  ─ Setup del repo                                │
│  ─ Base de datos completa con RLS                │
│  ─ Tests de aislamiento                          │
│  ⏱️ ~2-4 sesiones                                │
│  🚧 PARADA OBLIGATORIA: tests isolation verdes   │
├─────────────────────────────────────────────────┤
│  ETAPA 2: CORE DE NEGOCIO (P3-P11)              │
│  ─ Auth + Middleware                             │
│  ─ Tenants + Courts                              │
│  ─ Bookings (state machine + API + grilla)       │
│  ─ Pagos MercadoPago + Webhooks                  │
│  ⏱️ ~6-10 sesiones                               │
│  🚧 PARADA OBLIGATORIA: webhook idempotente      │
├─────────────────────────────────────────────────┤
│  ETAPA 3: FEATURES + DEPLOY (P12-P21)           │
│  ─ Cancelaciones + CashFlow                      │
│  ─ Abonados + Player app + Bans                  │
│  ─ Notificaciones + Billing SaaS                 │
│  ─ Admin UI + Reportes + CI/CD                   │
│  ⏱️ ~8-12 sesiones                               │
│  🚧 PARADA OBLIGATORIA: lifecycle tenant completo│
└─────────────────────────────────────────────────┘
```

---

## 🚀 Primer paso concreto: P0

El **P0 (Inicialización del monorepo)** es lo más simple y lo primero que hay que hacer. Básicamente:

1. Configurar `package.json` con todas las dependencias (Next.js, Drizzle, Supabase, etc.)
2. Configurar TypeScript strict
3. Crear la estructura de carpetas del proyecto
4. Configurar ESLint, Prettier, Tailwind
5. Crear `.env.example`

**Resultado esperado**: `pnpm install && pnpm typecheck` pasa sin errores.

---

## ⚠️ Las 4 reglas de oro que mencionó Opus

### 1. Los 4 Pilares son sagrados
- **A**: RLS dual y relacional (seguridad de datos por tenant/jugador)
- **B**: Idempotencia de pagos (un webhook procesado una sola vez)
- **C**: State machine de bookings (transiciones atómicas)
- **D**: Correcciones de Fase 3 (valores correctos de ENUMs, etc.)

### 2. Las 3 paradas obligatorias
- Después de **P2**: tests de aislamiento de DB verdes
- Después de **P11**: webhook de MercadoPago idempotente verificado
- Después de **P18**: lifecycle completo del tenant

### 3. Plan Mode siempre
Nunca le digas al asistente "escribí el código directo". Siempre pedí el plan primero.

### 4. Contexto quirúrgico
No cargues todos los docs de una. Cada prompt indica exactamente cuáles cargar.

---

## ¿Qué necesitás para arrancar?

> [!IMPORTANT]
> Antes de empezar P0, asegurate de tener:
> - **Node.js 18+** instalado
> - **pnpm** instalado (`npm install -g pnpm`)
> - **Supabase CLI** instalado (para la DB local)
> - **Docker Desktop** corriendo (Supabase local lo necesita)
> - Una cuenta en **Supabase** (free tier alcanza para desarrollo)
> - Una cuenta en **MercadoPago** (credenciales sandbox)

---

## ¿Cómo seguimos?

Tenés dos opciones:

### Opción A: Arrancamos con P0 ahora mismo
Me decís "dale, hacé P0" y yo:
1. Te presento el plan de archivos a crear
2. Vos aprobás
3. Yo genero todo el scaffold

### Opción B: Me preguntás lo que no entiendas
Si algo del plan no te cierra, preguntame y te lo explico con más detalle.

> [!TIP]
> **Mi recomendación**: empezá con P0. Es la fase más sencilla, no tiene riesgo, y te va a dar confianza para las siguientes. Una vez que veas `pnpm typecheck` en verde, ya estás en camino.
