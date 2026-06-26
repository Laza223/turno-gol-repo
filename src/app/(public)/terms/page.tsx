import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description: 'Términos de uso de la plataforma TurnoGol.',
}

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Términos y Condiciones
        </h1>
        <p className="text-sm text-muted-foreground">Última actualización: 25 de mayo de 2026.</p>
      </header>

      <section className="space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">1. Objeto del servicio</h2>
        <p>
          TurnoGol es una plataforma SaaS de gestión de complejos deportivos de fútbol en Argentina.
          Funcionamos como <strong>intermediario tecnológico</strong> entre los complejos (canchas)
          y los jugadores que reservan turnos. <strong>TurnoGol no es la cancha</strong>: cada
          complejo es propietario y responsable de su predio, su infraestructura y la prestación del
          servicio físico de alquiler de cancha.
        </p>
        <p>
          TurnoGol tampoco procesa dinero. Los pagos (señas de reservas y suscripciones SaaS) se
          ejecutan a través de <strong>MercadoPago</strong>, que es el procesador de pagos
          autorizado y regulado por las normas argentinas correspondientes.
        </p>
        <p>
          Estos Términos y Condiciones regulan el uso de la plataforma por parte de jugadores
          (usuarios B2C) y complejos clientes (usuarios B2B).
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">2. Responsabilidad del complejo</h2>
        <p>El complejo deportivo, en su calidad de prestador del servicio físico, es responsable de:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Tener la cancha disponible en el horario reservado, en condiciones razonables de uso.
          </li>
          <li>
            Gestionar directamente con el jugador eventuales reembolsos, no-shows, disputas por
            estado de la cancha, clima, cancelaciones por fuerza mayor, etc.
          </li>
          <li>
            Cumplir con la normativa fiscal argentina aplicable: emisión de comprobantes y
            facturación AFIP. Conforme al ADR-011, <strong>la facturación está fuera del alcance de
            TurnoGol</strong> en la versión v1; cada complejo factura por sus propios medios.
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

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">3. Declaración jurada de mayoría de edad</h2>
        <p>
          Al crear una cuenta en TurnoGol como jugador, declarás bajo juramento ser mayor de 18
          años. Esta declaración se registra en tu perfil junto con la versión vigente de los
          Términos y Condiciones aceptados, conforme al ADR-012. Reservar una cancha sin tener la
          mayoría de edad es responsabilidad exclusiva del usuario y puede dar lugar a la suspensión
          de la cuenta.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">4. Pagos</h2>
        <p>
          Cuando reservás online, la <strong>seña</strong> se procesa a través de MercadoPago y va
          directamente a la cuenta de MercadoPago del complejo (conectada vía OAuth). TurnoGol{' '}
          <strong>no intermedia ese dinero</strong>: no recibe, no retiene y no remite los fondos.
        </p>
        <p>
          La <strong>suscripción mensual SaaS</strong> que paga el complejo a TurnoGol también se
          procesa por MercadoPago, mediante el sistema de suscripciones recurrentes.
        </p>
        <p>
          Cualquier disputa sobre un cobro debe iniciarse en primer lugar con el complejo
          correspondiente. Si la operación involucra una controversia sobre el procesamiento del
          pago, podés presentar la disputa en MercadoPago o, eventualmente, ante la Dirección
          Nacional de Defensa al Consumidor.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">5. Cancelaciones</h2>
        <p>
          La política de cancelación y reembolso de cada reserva la define{' '}
          <strong>el complejo</strong>, no TurnoGol. Generalmente existe una ventana mínima de
          cancelación (por ejemplo, 2 horas antes del turno) configurable por cada complejo. Fuera
          de esa ventana, la cancelación puede no generar reembolso de la seña.
        </p>
        <p>
          Si necesitás cancelar una reserva, hacelo desde tu panel de jugador o contactá al
          complejo. TurnoGol pone a disposición la herramienta técnica de cancelación, pero la
          decisión sobre el reembolso es del complejo.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">6. Suscripciones SaaS (clientes B2B)</h2>
        <p>
          TurnoGol ofrece tres planes de suscripción mensual para complejos, según la cantidad de
          canchas:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Predio</strong>: 1 a 3 canchas.
          </li>
          <li>
            <strong>Complejo</strong>: 4 a 6 canchas.
          </li>
          <li>
            <strong>Estadio</strong>: 7 o más canchas.
          </li>
        </ul>
        <p>
          El cobro es mensual y se debita por MercadoPago. Los complejos pueden cancelar su
          suscripción en cualquier momento; tras la cancelación, la cuenta sigue activa hasta el
          final del período facturado. Si hay un cobro fallido, la cuenta pasa por los estados{' '}
          <em>past_due</em> y <em>suspended</em> antes de la baja definitiva. Los detalles del
          lifecycle SaaS están en el documento de monetización (doc4).
        </p>
        <p>
          Los datos del complejo se conservan 90 días tras la baja (estado <em>churned</em>) para
          permitir reactivación, y luego se anonimizan o eliminan.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">7. Suspensión y baja de cuenta</h2>
        <p>
          TurnoGol puede suspender o dar de baja una cuenta de jugador en los siguientes casos:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Fraude o uso indebido de medios de pago.</li>
          <li>
            Ban global del jugador en el sistema (estado <em>banned</em>) ante conductas graves o
            reiteradas.
          </li>
          <li>
            Bans específicos aplicados por un complejo respecto de un jugador (no afectan la cuenta
            global, solo la posibilidad de reservar en ese complejo).
          </li>
          <li>Solicitud judicial o requerimiento legítimo de autoridad competente.</li>
        </ul>
        <p>
          Si considerás que una suspensión fue incorrecta, podés apelarla escribiendo a{' '}
          <a className="text-emerald-700 hover:underline" href="mailto:privacidad@turnogol.app">
            privacidad@turnogol.app
          </a>
          .
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">8. Limitación de responsabilidad</h2>
        <p>
          Sin perjuicio del derecho del consumidor aplicable conforme a la ley argentina, TurnoGol{' '}
          <strong>no responde por</strong>:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Disputas entre el jugador y el complejo respecto a la prestación física del servicio (no
            disponibilidad de la cancha, estado del campo, conflictos en el lugar).
          </li>
          <li>
            Inconvenientes con la API o el sistema de MercadoPago que estén fuera de nuestro control
            (intermitencias, demoras de acreditación, contracargos).
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
          actualizado, aplicando las medidas de seguridad correspondientes al nivel medio de la
          Disposición 11/2006 de la DNPDP.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">9. Ley aplicable y jurisdicción</h2>
        <p>
          Estos Términos se rigen por las leyes de la <strong>República Argentina</strong>.
          Cualquier controversia que no pueda resolverse de buena fe será sometida a los tribunales
          ordinarios de la <strong>Ciudad Autónoma de Buenos Aires</strong>, sin perjuicio de las
          jurisdicciones que correspondan en favor del consumidor conforme a la Ley 24.240 de
          Defensa del Consumidor.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">10. Cambios en estos términos</h2>
        <p>
          Si modificamos los Términos y Condiciones te lo informaremos por email (al menos 30 días
          antes para cambios sustanciales). La nueva versión tiene efecto a partir de la fecha de
          actualización indicada al inicio del documento y de tu próxima aceptación expresa al
          ingresar a tu cuenta. Si no estás de acuerdo, podés dar de baja la cuenta antes de la
          entrada en vigencia.
        </p>
        <p>
          La versión vigente está siempre disponible en{' '}
          <Link className="text-emerald-700 hover:underline" href="/terms">
            turnogol.app/terms
          </Link>
          . Para consultas, escribinos a{' '}
          <a className="text-emerald-700 hover:underline" href="mailto:privacidad@turnogol.app">
            privacidad@turnogol.app
          </a>
          .
        </p>
      </section>
    </article>
  )
}
