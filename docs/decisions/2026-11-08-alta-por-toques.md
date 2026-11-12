# Decisión: alta del complejo por toques

**Fecha:** 2026-11-08 · **Decide:** Lazar (founder), por select en el chat y aprobando la spec.
**Spec:** [`docs/superpowers/specs/2026-11-08-alta-por-toques-design.md`](../superpowers/specs/2026-11-08-alta-por-toques-design.md)
**Análisis:** [`docs/planning/2026-11-08-onboarding-referencia-cancheria.md`](../planning/2026-11-08-onboarding-referencia-cancheria.md)

## Por qué

El dueño que llega desde anuncios o desde la bio de Instagram se caía en el alta. Pasaban tres cosas:
- el alta pedía 13 campos obligatorios;
- el mail bloqueaba;
- había que cargar una primera reserva antes de ver nada.

La referencia es el alta mobile de Canchería: una pregunta por pantalla, valores por defecto y casi nada que tipear.

## Decisiones

1. **El mail no bloquea el alta.** El dueño entra directo al panel y ve el aviso "Confirmá tu mail", con dos opciones: "Reenviar mail" y "¿Está mal? Cambialo".
   - Hasta confirmar el mail solo quedan limitados dos cosas: **activar el plan pago** e **invitar al equipo**.
   - La verificación es propia de TurnoGol: una columna `staff_users.email_verified_at` y un token de un uso. La confirmación de Supabase del proyecto no se toca, así que el jugador sigue igual.
2. **El alta termina en "Compartir mi link".** La primera reserva sale del wizard y pasa a la checklist. El Aha Moment de doc10 sigue siendo la primera reserva online.
3. **Se oculta lo que el complejo dice que no usa.** Si dice que no tiene buffet o kiosco (`settings.canteen_enabled = false`), no se muestran Vender ni Productos. Se puede activar después desde Ajustes.
4. **La prueba sigue en 30 días desde el alta** (`TRIAL_DAYS`). El lifecycle no cambia.
5. **Cuenta:** se piden nombre, mail, celular y contraseña. Sale el apellido (se guarda vacío) y sale repetir la contraseña. El celular queda porque es el WhatsApp del complejo y el canal de seguimiento comercial.
6. **Ubicación:** es un paso de búsqueda de dirección (Georef). Ciudad y provincia salen del candidato elegido, así el complejo aparece en el buscador desde el día 1.
7. **Precio:** se pide uno por formato. "¿A la noche cobrás distinto?" arma dos franjas con un corte (por defecto, 18 hs). No hay seña ni Mercado Pago en el alta (D9). El turno es de 60 min fijo.

## Riesgos aceptados

- **Ocupar un mail ajeno.** El dueño real del mail recupera la cuenta con "Olvidé mi contraseña", porque el link le llega a su casilla.
- **Ocupar un mail ajeno: dos casos, mitigados.** (1) Invitar a ese mail: `inviteStaffAction` y `resendInviteAction` no vinculan una cuenta de `staff_users` con `email_verified_at` vacío ("Esa cuenta todavía no confirmó su mail…"); una fila creada por la propia invitación nace verificada. (2) Recuperar la cuenta: tras `updateUser({ password })`, el reset de contraseña hace `signOut({ scope: 'others' })` y echa a quien la ocupó.
- **Altas automatizadas.** Sin captcha, porque rompería el navegador interno de Instagram. Las frena el rate limit por IP que ya existe.
