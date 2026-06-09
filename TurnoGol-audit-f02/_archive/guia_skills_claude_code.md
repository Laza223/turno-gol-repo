# 🔧 Guía de Skills para Claude Code — TurnoGol

## Resumen ejecutivo

| Skill | ⭐ Stars | Instalar | ¿Cuándo? | Veredicto |
|---|---|---|---|---|
| **Superpowers** | 165k | Día 1 | Desde el primer prompt | ✅ Obligatorio |
| **UI UX Pro Max** | 69.3k | Día 1 | En fases con UI (P5, P9, P15, P19) | ✅ Muy recomendado |
| **Caveman** | 43.7k | Semana 2+ | Después de sentirte cómodo | ⏳ Después |
| **Cavemem** | ~5k | Semana 2+ | Cuando tengas muchas sesiones | ⏳ Después |
| **Everything CC** | ~2k | Opcional | Si querés docs indexados | ⚪ Opcional |

---

## 1. Superpowers — `obra/superpowers`

### Qué hace
Superpowers transforma el flujo de Claude Code de "escribir código directo" a un proceso estructurado:

```
Tu pedido → Brainstorming → Plan detallado → Ejecución con subagentes → Code review
```

Cada tarea se descompone en subtareas de 2-5 minutos con paths exactos, código completo y pasos de verificación. Los subagentes ejecutan cada tarea con **revisión en dos etapas** (cumplimiento del spec + calidad de código).

### Cómo se integra con tu plan
Tu `plan_de_ataque.md` ya usa "Plan Mode" manualmente. Con Superpowers instalado, **el Plan Mode se activa automáticamente**. Esto significa que la instrucción "Entrá en Plan Mode" de cada prompt ya no es necesaria — Superpowers lo fuerza solo.

### Instalación

**Opción A — Marketplace oficial (más simple):**
```
/plugin install superpowers@claude-plugins-official
```

**Opción B — Marketplace de Superpowers:**
```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

### Verificación
Después de instalar, escribí `/help` en Claude Code. Deberías ver:
- `/superpowers:brainstorm`
- `/superpowers:write-plan`
- `/superpowers:execute-plan`

### Skills incluidos (14+)
- **brainstorming** — Refina ideas antes de escribir código
- **writing-plans** — Tareas de 2-5min con paths y código exacto
- **subagent-driven-development** — Subagentes con revisión en 2 etapas
- **test-driven-development** — RED-GREEN-REFACTOR obligatorio
- **requesting-code-review** — Review por severidad
- **systematic-debugging** — Debugging en 4 fases
- **using-git-worktrees** — Ramas aisladas por feature

---

## 2. UI UX Pro Max — `nextlevelbuilder/ui-ux-pro-max-skill`

### Qué hace
Motor de "inteligencia de diseño" que genera design systems completos basados en tu tipo de producto. Incluye:
- 161 categorías de producto con reglas específicas
- 67 estilos de UI (Glassmorphism, Minimalism, Bento Grid, etc.)
- 161 paletas de color por industria
- 57 combinaciones de tipografías
- Checklist de anti-patrones (ej: "no usar emojis como iconos")

### Para TurnoGol es relevante en:
- **P5** — Página pública del complejo (`/[slug]`)
- **P9** — Grilla admin con Realtime
- **P15** — App del jugador (mis reservas, perfil)
- **P19** — Dashboard admin completo
- **P20** — Reportes

### Instalación

**Opción A — CLI (recomendado):**
```powershell
npm install -g uipro-cli
cd c:\Users\User\OneDrive\Documentos\GitHub\turno-gol-repo
uipro init --ai claude
```

**Opción B — Plugin marketplace:**
```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

> [!NOTE]
> Requiere **Python 3.x** para el script de búsqueda del design system.
> En Windows: `winget install Python.Python.3.12`

### Generar Design System para TurnoGol
Una vez instalado, podés generar el design system base:
```
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "sports booking SaaS management" --design-system -p "TurnoGol"
```

Esto crea `design-system/MASTER.md` que Claude usará como fuente de verdad visual. Tu `doc20_design_system.md` ya tiene tokens definidos — el MASTER.md los complementa.

---

## 3. Caveman — `JuliusBrussee/caveman`

### Qué hace
Reduce ~75% de tokens de salida haciendo que Claude hable en forma ultra-concisa:

**Normal:** "The reason your React component is re-rendering is likely because you're creating a new object reference on each render cycle..."

**Caveman:** "New object ref each render. Inline object prop = new ref = re-render. Wrap in useMemo."

### ¿Por qué NO instalarlo día 1?

> [!WARNING]
> Estás arrancando Claude Code por primera vez. Caveman te va a quitar contexto explicativo que ahora necesitás leer para entender qué está haciendo el agente.

**Instalalo después de P2** (cuando los tests de aislamiento estén verdes y ya te sientas cómodo con el flujo).

### Instalación (para cuando estés listo)
```
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

Activación: `/caveman` o `/caveman lite|full|ultra`

---

## 4. Cavemem — `JuliusBrussee/cavemem`

### Qué hace
Memoria persistente entre sesiones de Claude Code. Guarda observaciones en SQLite y las inyecta automáticamente al inicio de cada sesión.

### ¿Por qué NO instalarlo día 1?
- Tu proyecto ya tiene `CLAUDE.md` + `/memory` como sistema de contexto
- Cavemem brilla cuando llevás **semanas** de desarrollo y necesitás que el agente recuerde decisiones anteriores
- Instalarlo ahora agrega complejidad sin beneficio

### Instalación (para después de Fase 5)
```powershell
npm install -g cavemem
cavemem install
```

---

## 5. Everything Claude Code — `affaan-m/everything-claude-code`

### Qué hace
Bundle que empaqueta documentación oficial de Claude Code + configuraciones predefinidas + memory management.

### Veredicto
**No lo necesitás.** Tu proyecto ya tiene su propia estructura de docs (20 documentos) y reglas (`CLAUDE.md`). ECC agrega ruido sin valor real para tu caso.

---

## 📋 Plan de instalación — Orden recomendado

### Día 1 (antes de P0):
```powershell
# 1. Instalar Claude Code (si no lo tenés)
irm https://claude.ai/install.ps1 | iex

# 2. Abrir Claude Code en tu repo
cd c:\Users\User\OneDrive\Documentos\GitHub\turno-gol-repo
claude

# 3. Instalar Superpowers
/plugin install superpowers@claude-plugins-official

# 4. Instalar UI UX Pro Max
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill

# 5. Verificar
/help
```

### Después de P2 (cuando te sientas cómodo):
```
# Instalar Caveman
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
# Usá /caveman lite al principio
```

### Después de Fase 5 (muchas sesiones acumuladas):
```powershell
npm install -g cavemem
cavemem install
```
