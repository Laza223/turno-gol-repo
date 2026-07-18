# Recorrida browser real — TurnoGol (2026-07-15)

> Recorrida vista por vista en un navegador de verdad (Browser pane) contra `localhost:3000`,
> app seedeada (`pnpm e2e:seed`), modo **MP mock** (`MP_MOCK_MODE=1`, `NEXT_PUBLIC_E2E=1`).
> Sesión inyectada por cookie (helper `buildStorageState`, sin tipear passwords).
> Método por vista: navegar → probe JS al DOM vivo (h1, contenido esperado, interactivos,
> error boundary) → consola sin errores → happy-path a fondo en flujos de plata.

## Entorno
- Supabase local :54322 arriba, `/api/status` 200 (db, pg-boss, mercadopago mock, email, sentry: ok).
- Dev server config `turnogol-mock` (`.claude/launch.json`).
- Notas del pane: el árbol a11y (`read_page`) llega **stale**; los clicks por coordenada caen en SVG
  decorativos; hay **duplicados responsive ocultos** (`display:none`) → se usa query al DOM vivo
  filtrando `offsetParent!==null` + `.click()` directo. Screenshots colgaron 1 vez (render pesado).

## Resultados

### 🔴 P0
| Vista | URL | Resultado | Evidencia |
|---|---|---|---|
| Grilla | `/grilla` | ✅ PASA | h1 "Grilla", 12 slots visibles reservables (08–10h ocultos por ser pasados = correcto), 0 errores consola. Modal "Nueva reserva" abre y **crea reserva real** (toast "Reserva creada", fila `confirmed` en DB id 5aefd364). |
| Caja | `/caja` | ✅ PASA | h1 "Caja", acciones Agregar movimiento / Cerrar caja / Configurar productos, sin error boundary ni consola. |
| Reservas (listado) | `/reservas` | ✅ PASA | h1 "Reservas", estado vacío sano (sin reservas del día), sin errores. |
| Detalle reserva | `/reservas/[id]` | ✅ PASA | h1 "Detalle de la reserva", muestra jugador+cancha+estado, acciones Agregar cobro/Completada/Ausente/Cancelar. |
| Checkout reserva | `/[slug]/reservar` | ⏳ pendiente (flujo jugador) | |
| Post-pago éxito/pendiente/error | `/reserva/[id]/*` | ⏳ pendiente (flujo jugador) | |
| Login | `/login` | ⏳ pendiente (logout) | |
| Verify | `/verify` | ⏳ pendiente (logout) | |

### 🟠 P1 / 🟡 P2 — Admin (todas ✅ con sesión admin inyectada)
| Vista | URL | Resultado | Evidencia |
|---|---|---|---|
| Dashboard | `/dashboard` | ✅ PASA | h1 "Inicio", autenticado admin, render OK. |
| Canchas | `/canchas` | ✅ PASA | h1 "Canchas", Cancha E2E 1, acciones Nueva/Editar/Desactivar. |
| Abonados | `/abonados` | ✅ PASA | h1 "Abonados", estado vacío sano, sin error. |
| Jugadores | `/jugadores` | ✅ PASA | h1 "Jugadores", render sin error. |
| Reportes | `/reportes` | ✅ PASA | Julio 2026, Ingresos/Ajustes/Saldo $0, **Reservas: 1** (refleja la reserva creada), Exportar CSV. |
| Equipo (Staff) | `/staff` | ✅ PASA | "Equipo", 2 miembros activos, tabla completa, Agregar miembro. |
| Métricas | `/metricas` | ✅ PASA | Gráficos recharts (reservas/día, tasa ausencias, ingresos, top horarios). |
| Settings (redirect) | `/settings` | ✅ PASA | Redirige a `/settings/reservas`, h1 "Configuración". |
| Settings · Reservas | `/settings/reservas` | ✅ PASA | Render OK, tabs perfil/reservas/horarios/facturación. |
| Settings · Horarios | `/settings/horarios` | ✅ PASA | Días + inputs de hora + Guardar. |
| Settings · Facturación | `/settings/facturacion` | ✅ PASA | Card Suscripción ("sin suscripción activa") + Conectar MercadoPago. |
| Settings · Perfil | `/settings/perfil` | ✅ PASA | Perfil público: Logo/Portada (uploads). |
| Abonado nuevo | `/abonados/nuevo` | ✅ PASA | h1 "Nuevo abonado", 11 campos de formulario. |

**Nota:** `/settings/pin` ya no existe (PIN eliminado del producto — coherente con "Sin sistema de PIN" en CLAUDE.md). El inventario `vistas_inventario.md` lo lista como vista #25: **está desactualizado**.

### 🟢 Jugador (sesión jugador inyectada)
| Vista | URL | Resultado | Evidencia |
|---|---|---|---|
| Mis reservas | `/mis-reservas` | ✅ PASA | h1 "Mis reservas", tabs Próximas/Historial. |
| Mi perfil | `/perfil` | ✅ PASA | h1 "Mi perfil", email visible, campos editables. |
| Mi cuenta | `/configuracion` | ✅ PASA | Exportar datos (ARCO) + link eliminar cuenta. |
| Eliminar cuenta | `/eliminar-cuenta` | ✅ PASA (render, NO ejecuté baja) | h1, confirmación, menciona Ley 25.326 / retención 5 años. |

### 🌐 Público + funnel de reserva con PAGO (modo mock)
| Vista / paso | URL | Resultado | Evidencia |
|---|---|---|---|
| Home | `/` | ✅ PASA | h1 "Reservá tu cancha al instante", buscador + secciones. |
| Explorar | `/explorar` | ✅ PASA | h1 "Encontrá tu cancha ideal", 14 filtros, 5 resultados (muestra el Demo). |
| Perfil público | `/e2e-complejo-sena` | ✅ PASA | h1 "E2E Complejo Seña", links de reserva reales. |
| Disponibilidad | `/e2e-complejo-sena/disponibilidad` | ✅ PASA | h1 "Disponibilidad semanal", 12 slots. |
| Checkout reserva | `/e2e-complejo-sena/reservar?...` | ✅ PASA | Precio $100, **Seña $50**, Resto $50, botón "Pagar seña y reservar". |
| Mock MP checkout | `/mock-mp/checkout` | ✅ PASA | Simulador MP, seña $50, botones aprobado/rechazado/cancelar. Al pagar creó booking `5748e336` en pending_payment. |
| **Éxito post-pago** | `/reserva/[id]/exito` | ✅ PASA | "¡Reserva confirmada!", seña pagada $50, QR + comprobante. **DB: `confirmed` + `deposit_status=paid` + 1 payment `approved`.** |

**⚠ Hallazgo (NO es bug de producto) — cash_flow de la seña no se creó en el ensayo:**
tras el pago aprobado, la cadena quedó `confirmed / paid / 1 payment approved` pero **0 `cash_flows`**.
Causa raíz verificada: el tenant seña del seed (`...030`) **no tiene ningún staff** (`tenant_staff_members` vacío);
`recordDepositCashFlow` (`payment.service.ts:463`) requiere un admin activo para atribuir la fila
(`cash_flows.registered_by` es NOT NULL) y, al no haberlo, se saltea con warning **por diseño** —
nunca sacrifica la confirmación ya pagada por un tema de atribución contable. En producción todo complejo
nace con su dueño-admin, así que este fallback no dispara. **Acción: ninguna en el producto**; opcional
agregar un admin al tenant seña en `scripts/seed-e2e.ts` para que el ensayo ejerza también esta rama.

| **Error post-pago** | `/reserva/[id]/error` | ✅ PASA | Rechacé el pago en el mock → "El pago no se procesó… rechazado o cancelado" + "Reintentar pago". |
| **Pendiente post-pago** | `/reserva/[id]/pendiente` | ✅ PASA | "Confirmando tu pago…" (PaymentStatusWatcher polling), sin error. |
| Login | `/login` | ✅ PASA | h1 "Iniciá sesión", email + password + submit (staff email+password). No tipeé password. |
| Verify (error) | `/verify?error=expired` | ✅ PASA | "Este enlace expiró. Generá uno nuevo…" + Volver a intentar. |
| Register | `/register` | ✅ PASA | h1 "Creá tu cuenta", form + submit. |
| Onboarding | `/onboarding` | ✅ PASA | (admin fresh) "Paso 1 de 4 · 25% — Tu complejo", 6 campos, barra de progreso. |
| Para complejos | `/para-complejos` | ✅ PASA | h1 "Tu complejo, siempre lleno", CTA a /register. |
| Privacidad | `/privacidad` | ✅ PASA | h1 "Política de Privacidad", contenido completo (7.4k). |
| Términos | `/terminos` | ✅ PASA | h1 "Términos y Condiciones", sin "cancelled". |
| Suspended | `/suspended` | ✅ PASA | h1 "Tu cuenta está temporalmente suspendida". |
| Mock MP | `/mock-mp/checkout` | ✅ PASA | Simulador con aprobar/rechazar/cancelar (ver funnel arriba). |

## Resumen

**36/36 vistas cargan y renderizan lo correcto, sin errores de consola ni error boundaries.**
Flujos de negocio ejercidos a fondo en browser real:
- **Crear reserva** (grilla admin → modal → DB `confirmed`). ✅
- **Reserva online con seña + pago aprobado** (funnel público completo → `/exito` → DB `confirmed`/`paid`/payment `approved`). ✅
- **Pago rechazado** (→ `/error`). ✅
- Detalle de reserva con acciones, reportes reflejando la reserva creada, equipo, métricas, settings, onboarding wizard. ✅

### Hallazgos (ninguno es bug de producto)
1. **`cash_flow` de la seña no se creó en el ensayo** — el tenant seña del seed no tiene admin;
   `recordDepositCashFlow` se saltea por diseño cuando no hay a quién atribuir la fila. En prod
   todo complejo tiene dueño-admin. Hueco del **seed**, no del código. (Detalle arriba.)
2. **`vistas_inventario.md` desactualizado**: lista `/settings/pin` (PIN eliminado del producto),
   `/privacy` y `/terms` (las rutas reales son `/privacidad` y `/terminos`; todos los links del
   código apuntan bien a las españolas). El inventario tiene URLs viejas; la app es consistente.

### Salvedades honestas (qué NO prueba esto)
- Es un **smoke funcional en local con MP mock**, no producción. La pata de **MercadoPago real**
  (OAuth del complejo, checkout, refund, webhook firmado, preapprovals SaaS) fue el ensayo aparte
  (`ENSAYO_GENERAL.md`), no se re-ejerció acá.
- No probé exhaustivamente cada validación de formulario, cada permiso RLS cruzado, ni performance.
  Para eso está la suite automática (unit/integration/isolation/e2e).
- "Renderiza sin error" ≠ "sin ningún bug". Es evidencia de que **ninguna vista está rota** y de que
  **los flujos de plata principales andan end-to-end**, vistos en un navegador de verdad.
