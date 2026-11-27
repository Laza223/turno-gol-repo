import type { Metadata } from 'next'
import Link from 'next/link'
import { REFERRAL_REWARD_CAP, TRIAL_DAYS } from '@/shared/constants'
import '@/components/site/article.css'

export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description: 'Términos de uso de la plataforma TurnoGol.',
}

export default function TerminosPage() {
  return (
    <div className="portal-ambient">
      <article className="ar-page ar-page--solid">
        <div className="ar-col">
          <header>
            <h1 className="ar-h1">Términos y Condiciones</h1>
            <p className="ar-sub">Última actualización: 8 de noviembre de 2026.</p>
          </header>
          <div className="ar-prose glass-painted">
            <section className="grid gap-4">
              <h2>1. Objeto del servicio</h2>
              <p>
                TurnoGol es una plataforma SaaS de gestión de complejos deportivos de fútbol en
                Argentina. Funcionamos como <strong>intermediario tecnológico</strong> entre los
                complejos (canchas) y los jugadores que reservan turnos.{' '}
                <strong>TurnoGol no es la cancha</strong>: cada complejo es propietario y
                responsable de su predio, su infraestructura y la prestación del servicio físico de
                alquiler de cancha.
              </p>
              <p>
                TurnoGol tampoco procesa dinero. Los pagos (señas de reservas y suscripciones SaaS)
                se ejecutan a través de <strong>Mercado Pago</strong>, que es el procesador de pagos
                autorizado y regulado por las normas argentinas correspondientes.
              </p>
              <p>
                Estos Términos y Condiciones regulan el uso de la plataforma por parte de jugadores
                (usuarios B2C) y complejos clientes (usuarios B2B).
              </p>
            </section>

            <section className="grid gap-4">
              <h2>2. Responsabilidad del complejo</h2>
              <p>
                El complejo deportivo, en su calidad de prestador del servicio físico, es
                responsable de:
              </p>
              <ul>
                <li>
                  Tener la cancha disponible en el horario reservado, en condiciones razonables de
                  uso.
                </li>
                <li>
                  Gestionar directamente con el jugador eventuales reembolsos, no-shows, disputas
                  por estado de la cancha, clima, cancelaciones por fuerza mayor, etc.
                </li>
                <li>
                  Cumplir con la normativa fiscal argentina aplicable: emisión de comprobantes y
                  facturación ante ARCA (ex AFIP). Conforme al ADR-011,{' '}
                  <strong>la facturación está fuera del alcance de TurnoGol</strong> en la versión
                  v1; cada complejo factura por sus propios medios.
                </li>
                <li>
                  Mantener actualizada la configuración de su predio en la plataforma (precios,
                  disponibilidad, política de cancelación).
                </li>
                <li>
                  Cumplir con los derechos ARCO de los jugadores respecto de los datos que TurnoGol
                  procesa por cuenta del complejo.
                </li>
              </ul>
            </section>

            <section className="grid gap-4">
              <h2>3. Declaración jurada de mayoría de edad</h2>
              <p>
                Al crear una cuenta en TurnoGol como jugador, declarás bajo juramento ser mayor de
                18 años. Esta declaración se registra en tu perfil junto con la versión vigente de
                los Términos y Condiciones aceptados, conforme al ADR-012. Reservar una cancha sin
                tener la mayoría de edad es responsabilidad exclusiva del usuario y puede dar lugar
                a la suspensión de la cuenta.
              </p>
            </section>

            <section className="grid gap-4">
              <h2>4. Pagos</h2>
              <p>
                Cuando reservás online, la <strong>seña</strong> se procesa a través de Mercado Pago
                y va directamente a la cuenta de Mercado Pago del complejo (conectada vía OAuth).
                TurnoGol <strong>no intermedia ese dinero</strong>: no recibe, no retiene y no
                remite los fondos.
              </p>
              <p>
                La <strong>suscripción SaaS</strong> que paga el complejo a TurnoGol (mensual o
                anual, ver punto 6) también se procesa por Mercado Pago, mediante el sistema de
                suscripciones recurrentes.
              </p>
              <p>
                Cualquier disputa sobre un cobro debe iniciarse en primer lugar con el complejo
                correspondiente. Si la operación involucra una controversia sobre el procesamiento
                del pago, podés presentar la disputa en Mercado Pago o, eventualmente, ante la
                Dirección Nacional de Defensa al Consumidor.
              </p>
            </section>

            <section className="grid gap-4">
              <h2>5. Cancelaciones</h2>
              <p>
                La política de cancelación y reembolso de cada reserva la define{' '}
                <strong>el complejo</strong>, no TurnoGol. Generalmente existe una ventana mínima de
                cancelación (por ejemplo, 2 horas antes del turno) configurable por cada complejo.
                Fuera de esa ventana, la cancelación puede no generar reembolso de la seña.
              </p>
              <p>
                Si necesitás cancelar una reserva, hacelo desde tu panel de jugador o contactá al
                complejo. TurnoGol pone a disposición la herramienta técnica de cancelación, pero la
                decisión sobre el reembolso es del complejo.
              </p>
            </section>

            <section className="grid gap-4">
              <h2>6. Suscripciones SaaS (clientes B2B)</h2>
              <p>
                TurnoGol se contrata con una suscripción paga.{' '}
                <strong>El importe depende de la cantidad de canchas</strong> y de la tarifa
                confirmada al contratar. El asistente de WhatsApp, cuando está disponible, se
                contrata por separado.
              </p>
              <p>
                <strong>Prueba.</strong> Al darse de alta, el complejo usa TurnoGol sin cargo
                durante {TRIAL_DAYS} días. Para empezar no se pide ningún dato de pago.
              </p>
              <p>
                <strong>Plan no activo.</strong> El complejo que no tiene una suscripción paga
                vigente (al terminar la prueba, al vencer lo pagado tras una baja o al terminar el
                período de cobro fallido) queda con el plan no activo. Su página pública sigue
                visible, sin horarios y sin reserva online, con los datos de contacto del complejo.
                El panel queda en modo lectura, salvo operar los turnos ya confirmados. El asistente
                de WhatsApp deja de responder. Los datos del complejo se conservan y todo vuelve a
                estar disponible al activar la suscripción.
              </p>
              <p>
                El complejo elige el ciclo de facturación, <strong>mensual o anual</strong>; el
                ciclo anual se cobra por adelantado con un descuento sobre el importe mensual. Los
                importes vigentes se muestran siempre en el panel del complejo antes de confirmar la
                suscripción, con el detalle de cómo se componen.
              </p>
              <p>
                <strong>
                  Cambiar la cantidad de canchas facturadas nunca genera un cargo proporcional a
                  mitad de período.
                </strong>{' '}
                Vale en los dos sentidos: lo que resta del período en curso no se modifica y el
                importe nuevo rige a partir del cobro siguiente. Mientras una cancha esté habilitada
                para recibir reservas, debe estar incluida en la facturación: no es posible reducir
                la cantidad de canchas facturadas por debajo de las canchas activas sin
                desactivarlas primero.
              </p>
              <p>
                El cobro se debita por Mercado Pago. Los complejos pueden cancelar su suscripción en
                cualquier momento; tras la cancelación, la cuenta sigue activa hasta el final del
                período facturado y después queda con el plan no activo. Si hay un cobro fallido, la
                cuenta pasa por los estados <em>past_due</em> y <em>suspended</em> y después queda
                con el plan no activo. Para eliminar la cuenta y sus datos, el complejo lo pide por
                email a privacidad@turnogol.app.
              </p>
              {/* retention-matches-legal-promise.test.ts busca la frase de abajo en el fuente. */}
              <p>
                Las cuentas dadas de baja definitivamente (estado <em>churned</em>) conservan sus
                datos 90 días tras la baja para permitir reactivación, y luego se anonimizan o
                eliminan.
              </p>
            </section>

            {/* `id="referidos"`: el aviso de referidos de Hoy enlaza acá (`/terminos#referidos`).
          Reglas: docs/decisions/2026-09-26-referidos.md. */}
            <section id="referidos" className="grid scroll-mt-24 gap-4">
              <h2>7. Programa de referidos (clientes B2B)</h2>
              <p>
                Los complejos clientes pueden recomendar TurnoGol a otros complejos y obtener{' '}
                <strong>hasta {REFERRAL_REWARD_CAP} meses de suscripción bonificados</strong>. Este
                punto explica cómo funciona.
              </p>
              <ul>
                <li>
                  <strong>Quién participa.</strong> Todos los complejos con cuenta en TurnoGol
                  tienen su link de referidos (turnogol.app/r/…). El complejo que comparte el link
                  es el <em>referidor</em>; el complejo nuevo que llega por ese link es el{' '}
                  <em>referido</em>.
                </li>
                <li>
                  <strong>Cómo se registra un referido.</strong> El referido tiene que crear su
                  cuenta desde el link del referidor o, si nos contacta directamente, indicar en ese
                  primer contacto de parte de qué complejo viene. Un complejo no puede referirse a
                  sí mismo. Si el titular de un complejo abre otro complejo con su propio link, ese
                  complejo cuenta como referido siempre que pague su propia suscripción.
                </li>
                <li>
                  <strong>Beneficio.</strong> Por cada complejo referido que{' '}
                  <strong>pague su primera mensualidad</strong> a través de Mercado Pago, el
                  referidor obtiene <strong>un mes de su suscripción bonificado</strong>, con un
                  máximo de {REFERRAL_REWARD_CAP} meses por referidor. Los referidos que se sumen
                  después de alcanzado ese máximo se dan de alta normalmente, pero ya no generan
                  meses para el referidor.
                </li>
                <li>
                  <strong>Cuándo se acredita.</strong> El mes se acredita una vez que el pago de la
                  primera mensualidad del referido queda aprobado. Registrarse, usar el período de
                  prueba o tener la cuenta activada sin un pago no genera el beneficio.
                </li>
                <li>
                  <strong>Cómo se aplica.</strong> Si el referidor todavía está en su período de
                  prueba, el mes se suma a esa prueba. Si ya paga su suscripción, se bonifica el
                  importe de una mensualidad sobre sus próximos cobros; TurnoGol le informa cómo y
                  cuándo se aplica en cada caso.
                </li>
                <li>
                  <strong>Vigencia.</strong> El programa no tiene fecha de cierre: participan los
                  complejos referidos que creen su cuenta mientras el programa esté vigente. El pago
                  de la primera mensualidad puede ocurrir después.
                </li>
                <li>
                  <strong>El referido.</strong> El complejo referido arranca con el mismo período de
                  prueba gratuito que cualquier complejo nuevo y paga el mismo importe de
                  suscripción.
                </li>
                <li>
                  <strong>Verificación.</strong> TurnoGol revisa cada referido antes de acreditar el
                  beneficio y puede rechazarlo si detecta cuentas duplicadas, complejos
                  inexistentes, pagos revertidos o cualquier uso abusivo del programa.
                </li>
                <li>
                  <strong>Carácter del beneficio.</strong> Los meses bonificados no tienen valor en
                  dinero, no se pueden canjear ni transferir a otra cuenta, y solo se aplican
                  mientras la cuenta del referidor esté vigente.
                </li>
                <li>
                  <strong>Cambios.</strong> TurnoGol puede modificar o finalizar el programa en
                  cualquier momento. Los meses ya ganados antes del cambio o del cierre se respetan.
                </li>
              </ul>
            </section>

            <section className="grid gap-4">
              <h2>8. Suspensión y baja de cuenta</h2>
              <p>
                TurnoGol puede suspender o dar de baja una cuenta de jugador en los siguientes
                casos:
              </p>
              <ul>
                <li>Fraude o uso indebido de medios de pago.</li>
                <li>
                  Ban global del jugador en el sistema (estado <em>banned</em>) ante conductas
                  graves o reiteradas.
                </li>
                <li>
                  Bans específicos aplicados por un complejo respecto de un jugador (no afectan la
                  cuenta global, solo la posibilidad de reservar en ese complejo).
                </li>
                <li>Solicitud judicial o requerimiento legítimo de autoridad competente.</li>
              </ul>
              <p>
                Si considerás que una suspensión fue incorrecta, podés apelarla escribiendo a{' '}
                <a href="mailto:privacidad@turnogol.app">privacidad@turnogol.app</a>.
              </p>
            </section>

            <section className="grid gap-4">
              <h2>9. Limitación de responsabilidad</h2>
              <p>
                Sin perjuicio del derecho del consumidor aplicable conforme a la ley argentina,
                TurnoGol <strong>no responde por</strong>:
              </p>
              <ul>
                <li>
                  Disputas entre el jugador y el complejo respecto a la prestación física del
                  servicio (no disponibilidad de la cancha, estado del campo, conflictos en el
                  lugar).
                </li>
                <li>
                  Inconvenientes con la API o el sistema de Mercado Pago que estén fuera de nuestro
                  control (intermitencias, demoras de acreditación, contracargos).
                </li>
                <li>
                  Interrupciones del servicio menores o iguales al SLA del 0,5% mensual previsto en
                  nuestros requisitos no funcionales (doc5).
                </li>
                <li>
                  Daños indirectos, lucro cesante o pérdida de oportunidad derivados del uso o
                  imposibilidad de uso de la plataforma.
                </li>
              </ul>
              <p>
                Hacemos nuestros mejores esfuerzos para mantener el servicio disponible, seguro y
                actualizado, aplicando las medidas de seguridad correspondientes al nivel medio de
                la Disposición 11/2006 de la DNPDP.
              </p>
            </section>

            <section className="grid gap-4">
              <h2>10. Ley aplicable y jurisdicción</h2>
              <p>
                Estos Términos se rigen por las leyes de la <strong>República Argentina</strong>.
                Cualquier controversia que no pueda resolverse de buena fe será sometida a los
                tribunales ordinarios de la <strong>Ciudad Autónoma de Buenos Aires</strong>, sin
                perjuicio de las jurisdicciones que correspondan en favor del consumidor conforme a
                la Ley 24.240 de Defensa del Consumidor.
              </p>
            </section>

            <section className="grid gap-4">
              <h2>11. Cambios en estos términos</h2>
              <p>
                Si modificamos los Términos y Condiciones te lo informaremos por email (al menos 30
                días antes para cambios sustanciales). La nueva versión tiene efecto a partir de la
                fecha de actualización indicada al inicio del documento y de tu próxima aceptación
                expresa al ingresar a tu cuenta. Si no estás de acuerdo, podés dar de baja la cuenta
                antes de la entrada en vigencia.
              </p>
              <p>
                La versión vigente está siempre disponible en{' '}
                <Link href="/terminos">turnogol.app/terminos</Link>. Para consultas, escribinos a{' '}
                <a href="mailto:privacidad@turnogol.app">privacidad@turnogol.app</a>.
              </p>
            </section>
          </div>
        </div>
      </article>
    </div>
  )
}
