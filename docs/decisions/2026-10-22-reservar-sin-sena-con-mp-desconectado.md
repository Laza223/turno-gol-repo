# Decisión: con MercadoPago desconectado, la reserva online entra sin seña

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder) · **Spec:** [`docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md`](../superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md) (decisión 1)

## Problema

Desde la migración 100, TurnoGol sabe cuándo un complejo revocó el permiso de cobro en su cuenta de MercadoPago (`tenants.mp_disconnected_at`). El token sigue guardado, pero MP ya no lo acepta. Si el complejo pide seña, la reserva online arma una preferencia que falla. El jugador termina en una página de error y el turno queda en `pending_payment` hasta que vence el hold.

## Decisión

**Mientras dure la marca, la reserva online se confirma sin seña**, como si `requires_deposit` estuviera apagado. El complejo cobra en el mostrador.

Es el mismo criterio que se fijó para F-003 el 2026-08-18: *el complejo se queda con el turno y cobra en el mostrador, que es estrictamente mejor que perder al cliente en silencio*. Ese caso, sin token, ya andaba así (`depositUnpayable`). Esta decisión lo extiende al caso "hay token, pero está marcado".

- **Dónde se aplica:**
  - `createBookingAndCheckout` (`reservar/actions.ts`) y `createWhatsappBooking` (`booking.whatsapp.ts`) toman `depositUnpayable = requires_deposit && (sin token || marcado)`.
  - `retryDepositPaymentAction` no arma la preferencia con la marca puesta.
  - `getPublicTenant.requiresDeposit` da `false`, para que el portal y el bot no anuncien una seña que no se va a cobrar.
- **Qué no se reporta a Sentry:** el caso marcado. El `captureMessage` sigue solo para el estado inconsistente de F-003 (seña sin token). El dueño ya tiene el aviso en Hoy, así que reportarlo cada reserva sería ruido.
- **Qué no cambia:**
  - la configuración del complejo: `requires_deposit` y `deposit_percentage` quedan como estaban;
  - al reconectar, la seña vuelve sola;
  - las reservas ya creadas con seña.

## Alternativa descartada

**Solo avisar** (el default del contrato): el dueño se entera por Hoy, pero el jugador sigue chocando con el error de pago hasta que alguien reconecte, y el turno se libera solo al vencer el hold. Es exactamente el agujero que motivó el ítem de deuda: el que descubre la desconexión es el cliente del cliente.

## Consecuencias aceptadas

- Mientras el dueño no reconecta, las reservas online no traen seña: si el jugador falta, no hay seña que retener. Corre el softban por ausencias de siempre.
- El aviso sale aunque el complejo tenga la seña apagada. Igual hay que reconectar antes de volver a pedirla.
- Reversible: es una condición en tres puntos de lectura, sin datos persistidos más allá de la marca.
