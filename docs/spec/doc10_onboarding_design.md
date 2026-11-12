# DOC 10 — Onboarding Flow Design
## TurnoGol: El Flujo que Define la Retención

> **Propósito**: Diseñar el onboarding como un sistema de conversión, no como un formulario.
> El objetivo es que el dueño llegue al "Aha Moment" (primera reserva online) antes de las 24 horas.

> [!NOTE]
> **La lógica detallada está en Doc 7 (Flujo 1) y Doc 8 (Epic ONB-001 a 005).**
> Este documento se enfoca en la **estrategia de diseño** y las **decisiones de UX**.

> [!WARNING]
> **§2 (los mockups paso a paso) quedó SUPERSEDED dos veces.** Primero lo reemplazó el refactor del 2026-08-16.
> Después, el **alta por toques del 2026-11-08**, cuya spec es
> [`docs/superpowers/specs/2026-11-08-alta-por-toques-design.md`](../superpowers/specs/2026-11-08-alta-por-toques-design.md)
> y su decisión, [`docs/decisions/2026-11-08-alta-por-toques.md`](../decisions/2026-11-08-alta-por-toques.md).
>
> Hoy el alta funciona así:
> - **Una pregunta por pantalla, con valores por defecto.** Se tipean 7 datos: los 4 de la cuenta, el nombre del complejo, la dirección y un precio por formato.
> - **El mail no bloquea.** Se verifica después, con un aviso en el panel.
> - **Cierra en "Compartir mi link".** La primera reserva ya no es un paso del wizard: pasó a la checklist.
>
> La fuente de verdad de las pantallas es el código de `src/app/onboarding/`. Los mockups de §2 no se usan.
>
> **Siguen vigentes:**
> - §1 (el Aha Moment, ajustado abajo);
> - §3 (la checklist, ajustada abajo);
> - §4 (anti-patterns);
> - §6 (razonamiento de negocio, ajustado abajo).

---

## 1. El "Aha Moment" de TurnoGol

> "Cuando el dueño ve su primera reserva entrando online sin que él hiciera nada."

Todo el onboarding está diseñado para llegar a este momento lo más rápido posible.

### Cadena de valor del Aha Moment

```
Cuenta (1 min, sin esperar el mail)
  → Alta por toques (~2-3 min)
    → Complejo live con link público
      → "Compartir mi link": el dueño lo manda por WA ← cierre del alta (2026-11-08)
        → UN JUGADOR RESERVA ONLINE ← Aha Moment 🎯
          → Dueño recibe notificación por email: "Tenés una nueva reserva"
            → Dueño entiende el valor de TurnoGol
```

**Cambio del 2026-11-08 (founder).** El alta ya no obliga a cargar una "primera reserva" manual.
- **Termina en compartir el link.** Esa es la acción que el dueño puede hacer en el momento y la que lleva a que reserve un jugador.
- **El Aha Moment no cambia:** sigue siendo la primera reserva ONLINE, y la checklist del panel guía hacia ella.
- **Cargar turnos a mano** (el cuaderno, los equipos fijos) pasó a ser un ítem de la checklist, con un texto que depende de cómo dijo que toma los turnos hoy.

### Métricas de éxito del onboarding

| Métrica | Target | Cómo medimos |
|---|---|---|
| Tiempo de registro | < 1 minuto | Desde landing hasta account created |
| Tiempo del wizard | < 20 minutos | Desde login hasta wizard completado |
| % que completa el wizard | > 70% | wizard_completed / accounts_created |
| Tiempo hasta primera reserva | < 24 horas | Desde wizard completado hasta primer booking online |
| % que recibe primera reserva en 7 días | > 50% | tenants con booking / tenants con wizard |

---

## 2. Diseño del Wizard — Paso a Paso

### Paso 1: Datos del Complejo (2 minutos)

```
┌──────────────────────────────────────────────┐
│  Paso 1 de 4 — Tu Complejo          ████░░  │
│                                              │
│  Nombre del complejo *                       │
│  ┌──────────────────────────────────────┐    │
│  │ Ej: Complejo San Martín             │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Dirección *                                 │
│  ┌──────────────────────────────────────┐    │
│  │ Autocompletado con Google Places     │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Ciudad *        Provincia *                 │
│  ┌──────────┐    ┌──────────────────┐       │
│  │ Luján    │    │ Buenos Aires  ▼  │       │
│  └──────────┘    └──────────────────┘       │
│                                              │
│                     [Continuar →]            │
└──────────────────────────────────────────────┘
```

**Principios UX**:
- Solo 4 campos (nombre, dirección, ciudad, provincia)
- Autocompletado de dirección con Google Places API
- **Fallback de carga manual** (Decisión de auditoría 2026-07-21): si Google Places no encuentra el domicilio (frecuente en interior/zonas rurales), el dueño ingresa la dirección como texto libre + lat/lng opcional. El Paso 1 nunca queda bloqueado por depender de Places. (Implementación de código pendiente.)
- Provincia: selector pre-cargado (24 provincias argentinas)
- NO pedir: CUIT, teléfono del complejo, email del complejo, fotos (todo opcional, después)
- El slug se genera automáticamente del nombre (visible como preview: "turnogol.app/complejo-san-martin")

### Paso 2: Tus Canchas (5 minutos)

```
┌──────────────────────────────────────────────┐
│  Paso 2 de 4 — Tus Canchas          ████░░  │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 🏟️ Cancha 1                         │    │
│  │                                      │    │
│  │ Nombre: [Cancha 1        ]           │    │
│  │ Tipo:   [Fútbol 5  ▼]               │    │
│  │ Superficie: [Césped sintético ▼]     │    │
│  │ Cubierta:   ○ Sí  ● No              │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [+ Agregar otra cancha]                     │
│                                              │
│  💡 Podés agregar más canchas después        │
│     desde la configuración.                  │
│                                              │
│  [← Atrás]              [Continuar →]        │
└──────────────────────────────────────────────┘
```

**Principios UX**:
- Mínimo 1 cancha para continuar
- El Tipo auto-determina la capacidad (Fútbol 5 → 10, Fútbol 7 → 14, etc.)
- Solo 4 campos por cancha
- Botón de "+ Agregar otra cancha" para repetir (no formulario dinámico complejo)
- NO pedir: precios (se pre-cargan), medidas, fotos, horarios por cancha

### Paso 3: Horarios (2 minutos)

```
┌──────────────────────────────────────────────┐
│  Paso 3 de 4 — Horarios              ██████░ │
│                                              │
│  Tu complejo abre:                           │
│                                              │
│  │ Día       │ Apertura │ Cierre │ Estado │  │
│  │───────────│──────────│────────│────────│  │
│  │ Lunes     │  08:00   │ 00:00  │ ✅     │  │
│  │ Martes    │  08:00   │ 00:00  │ ✅     │  │
│  │ Miércoles │  08:00   │ 00:00  │ ✅     │  │
│  │ Jueves    │  08:00   │ 00:00  │ ✅     │  │
│  │ Viernes   │  08:00   │ 01:00  │ ✅     │  │
│  │ Sábado    │  09:00   │ 01:00  │ ✅     │  │
│  │ Domingo   │  09:00   │ 23:00  │ ✅     │  │
│                                              │
│  💡 Valores pre-cargados. Editá solo lo que  │
│     sea diferente para tu complejo.          │
│                                              │
│  [← Atrás]              [Continuar →]        │
└──────────────────────────────────────────────┘
```

**Principios UX**:
- TODO pre-cargado con valores razonables para Argentina
- El dueño solo edita lo que difiere (la mayoría no toca nada)
- Un solo toggle para marcar un día como "cerrado"
- NO pedir: horarios por cancha, horarios de pico/valle, feriados (todo después)

### Paso 4: ¿Cobrás Seña? (1-3 minutos)

```
┌──────────────────────────────────────────────┐
│  Paso 4 de 4 — Cobro de Seña         ██████ │
│                                              │
│  ¿Querés cobrar seña online a tus jugadores? │
│                                              │
│  ┌────────────────────────────────────┐      │
│  │  ✅ Sí, cobrar seña               │ ←─── │
│  │  Los jugadores pagan un % al      │  La  │
│  │  reservar con MercadoPago.        │  más │
│  │  El dinero va directo a tu cuenta.│  común│
│  └────────────────────────────────────┘      │
│                                              │
│  ┌────────────────────────────────────┐      │
│  │  ⬜ No, solo reservar sin pago    │      │
│  │  Los jugadores reservan y pagan   │      │
│  │  al llegar al complejo.           │      │
│  └────────────────────────────────────┘      │
│                                              │
│  [← Atrás]       [Configurar MercadoPago →]  │
│            o     [Terminar sin seña]          │
└──────────────────────────────────────────────┘
```

**Principios UX**:
- Opción por defecto: "Sí, cobrar seña" (la recomendada)
- Si elige "Sí": redirect a OAuth de MercadoPago (flujo estándar, 2 minutos)
- Si elige "No": wizard termina inmediatamente
- Si el OAuth de MP falla: wizard termina sin MP, se puede configurar después
- NO pedir: porcentaje de seña (default 30%), política de cancelación (default 12hs)

> [!NOTE]
> **Los "2 minutos" son solo la conexión OAuth, no la habilitación de cobros de MP** (Decisión de auditoría 2026-07-21).
> En cuentas nuevas de MercadoPago pueden aplicar la verificación de identidad (KYC/CUIT) y
> períodos de "dinero a liberar" antes de que el dueño pueda efectivamente **retirar** la plata de las señas.
> Esto depende de MercadoPago, no de TurnoGol. El copy del paso debe aclararlo para no prometer
> retiros inmediatos y evitar frustración cuando el dinero de la primera seña queda retenido.

---

## 3. Post-Wizard: Dashboard + Checklist

```
┌──────────────────────────────────────────────────────────┐
│  🎉 ¡Tu complejo está online!                           │
│                                                          │
│  Tu link público: turnogol.app/complejo-san-martin    │
│  [📋 Copiar link]  [📤 Compartir por WhatsApp]           │
│                                                          │
│  ────────────────────────────────────────────────────     │
│                                                          │
│  Progreso de configuración: ████████░░ 75%               │
│                                                          │
│  ✅ Cuenta creada                                        │
│  ✅ Canchas configuradas (3)                             │
│  ✅ Horarios definidos                                   │
│  ⬜ Link compartido                                      │
│  ⬜ Cargá tus turnos en la grilla (o tus equipos fijos)  │
│  ⬜ MercadoPago conectado (opcional)                     │
│  ⬜ Primera reserva online recibida ← 🎯 ¡Tu objetivo!  │
│                                                          │
│  ────────────────────────────────────────────────────     │
│                                                          │
│  📊 Hoy: 0 reservas | $0 facturado                      │
│  📅 Mañana: 0 reservas                                   │
│                                                          │
│  [Ver grilla →]                                          │
└──────────────────────────────────────────────────────────┘
```

**Lo más importante**: El botón de "Compartir por WhatsApp" genera un mensaje pre-armado:

```
¡Hola! Ya podés reservar tu turno en [Complejo San Martín] online:
👉 turnogol.app/complejo-san-martin
Elegí día, hora y cancha. ¡Sin llamar!
```

---

## 4. Anti-Patterns que Evitamos

| Anti-Pattern | Por qué es malo | Nuestra solución |
|---|---|---|
| Pedir TODO antes de dejar usar el sistema | El 60% abandona formularios de más de 5 minutos | Solo 4 campos obligatorios en el paso 1 |
| No guardar progreso | Si cierra el browser, pierde todo y no vuelve | Guardado automático en DB por paso |
| Onboarding genérico sin "aha moment" | El usuario no entiende para qué sirve el sistema | El checklist guía hacia la primera reserva |
| Wizard largo sin opción de saltear | Genera ansiedad ("¿cuántos pasos más?") | 4 pasos, progress bar, hints de "hacelo después" |
| No ofrecer valores default | El usuario tiene que inventar precios y horarios | Todo pre-cargado con valores razonables |
| No explicar el valor de cada paso | "¿Por qué me piden esto?" | Copy claro en cada paso explicando el beneficio |
| Email de bienvenida genérico | No guía a la acción | Email con 1 CTA claro: "Compartí tu link para recibir reservas" |

---

## 5. Secuencia de Adopción Ideal (Primeros 7 Días)

```
DÍA 1
  ├── Registro + Wizard (20 min)
  ├── Compartir link por WA a contactos/clientes (1 min)
  └── Recibir primera reserva online (objetivo)

DÍA 2-3
  ├── Cargar 2-3 reservas manuales para "probar" la grilla
  ├── Conectar MercadoPago (si no lo hizo en el wizard)
  └── Invitar al recepcionista (si tiene)

DÍA 4-7
  ├── Recibir feedback: "¿Cómo fue tu primera semana?"
  ├── Publicar el link en Instagram/Google Maps
  └── Configurar abonados (turnos fijos)

DÍA 7
  └── Email proactivo: "¿Necesitás ayuda con algo?"
```

---

## 6. Decisiones de Diseño Clave

### ¿Por qué contraseña para Staff y Magic Link para Jugadores?
- **Para el Staff (Marcelo/Rodrigo)**: Usamos email + contraseña por seguridad, control de accesos por roles (admin/manager) y estabilidad de sesión en la administración del complejo. Al ser su herramienta diaria, la memorización de la contraseña no representa una fricción en el funnel.
- **Para los Jugadores (Tomás/Agustín)**: Usamos magic link por email y OAuth (Google) para minimizar la fricción en la reserva. Apple Sign-In no está implementado (ver ADR-002, doc11): fue una opción evaluada, no la decisión tomada. En compras espontáneas, obligar a recordar contraseñas es la causa #1 de abandono. Magic link permite reservar en menos de 1 minuto sin fricción de registro.

### ¿Por qué más pantallas y no menos? (2026-11-08)
- El modelo de "4 pasos" medía **formularios**: lo que se cae es el tipeo y la duda, no el toque.
- El alta por toques tiene más pantallas, pero cada una es una sola pregunta con un valor por defecto. La mayoría se resuelve con "Siguiente".
- Del alta de Canchería (la referencia) se toma esto: 11 pantallas en unos 2 minutos, y se tipea solo el precio.
- La regla que manda ahora es **cuántos datos se tipean** (7 contra 13) y **que nada bloquee** (el mail).

### ¿Por qué no pedir fotos del complejo en el wizard?
- Las fotos requieren que el dueño las tenga en el celular (muchos no las tienen).
- Agregan 3-5 minutos al wizard.
- No son necesarias para el Aha Moment.
- Se pueden agregar después desde Settings sin fricción.

### ¿Por qué se pide un precio por formato? (2026-11-08)
- Un precio inventado por nosotros sale publicado en el portal: es peor que preguntar.
- Se pide UNO por formato, con eco en vivo ("Un turno de 60 minutos: $X").
- Opcionalmente se pregunta "¿a la noche cobrás distinto?", que entra en el modelo de precio por franja.
- El resto (precio por día, por cancha) se ajusta después en `/canchas`.

### ¿Por qué el botón de "Compartir por WhatsApp" es tan prominente?
- Es la acción que cierra la cadena de valor: sin jugadores reservando, no hay Aha Moment.
- WhatsApp es el canal natural del dueño (ya tiene todos sus contactos ahí).
- El mensaje pre-armado elimina la fricción de "¿qué les digo?".

---

> [!IMPORTANT]
> **El onboarding NO es un formulario. Es un funnel de conversión.**
> Cada campo que no sea estrictamente necesario para llegar al Aha Moment
> es un campo que reduce la probabilidad de activación.
> La regla: si no contribuye a que el dueño reciba su primera reserva online,
> no va en el wizard.
