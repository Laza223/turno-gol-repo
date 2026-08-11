import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Privacidad',
  description: 'Cómo TurnoGol recolecta, usa y protege tus datos personales (Ley 25.326).',
}

export default function PrivacidadPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Política de Privacidad
        </h1>
        <p className="text-sm text-muted-foreground">Última actualización: 25 de mayo de 2026.</p>
      </header>

      <section className="space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">1. Quiénes somos</h2>
        <p>
          TurnoGol es una plataforma SaaS que permite a complejos deportivos de fútbol en Argentina
          gestionar reservas, pagos y clientes. A los fines de la Ley 25.326 de Protección de Datos
          Personales, TurnoGol actúa como <strong>responsable del tratamiento</strong> de los datos
          de las cuentas de los complejos (dueños y staff) y de los jugadores registrados en la
          plataforma. Cuando un jugador reserva en un complejo específico, TurnoGol también opera
          como <strong>encargado del tratamiento</strong> por cuenta del complejo (tenant) para esos
          datos de reserva.
        </p>
        <p>
          Para consultas sobre privacidad, ejercicio de derechos o reclamos, podés contactarnos en{' '}
          <a
            className="text-emerald-700 dark:text-emerald-300 hover:underline"
            href="mailto:privacidad@turnogol.app"
          >
            privacidad@turnogol.app
          </a>
          . Respondemos en un plazo máximo de 10 días hábiles.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">2. Qué datos recolectamos</h2>
        <p>
          De los <strong>jugadores</strong> recolectamos:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Nombre y apellido (obligatorio para identificarte en las reservas).</li>
          <li>Email (obligatorio para autenticación vía magic link).</li>
          <li>Teléfono celular (opcional, lo usa el complejo para contactarte por la reserva).</li>
          <li>
            Historial de reservas y pagos (montos en centavos de pesos argentinos, fechas, estados).
          </li>
          <li>
            Dirección IP y datos del dispositivo (para seguridad, rate limiting y prevención de
            fraude).
          </li>
          <li>
            Declaración jurada de mayoría de edad (+18 años) y aceptación de los Términos y
            Condiciones, requerida para crear cuenta (ADR-012).
          </li>
        </ul>
        <p>
          De los <strong>dueños y staff de complejos</strong> recolectamos nombre, email, teléfono,
          datos del complejo (nombre, dirección, configuración) y datos de facturación SaaS.
        </p>
        <p>
          <strong>Nunca recolectamos</strong> números de tarjeta de crédito, CVV ni contraseñas. El
          procesamiento de pagos lo realiza íntegramente MercadoPago bajo estándares PCI DSS.
          Tampoco procesamos datos sensibles (salud, religión, orientación, biometría) según el
          artículo 2 de la Ley 25.326.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">3. Para qué usamos tus datos</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Operar la plataforma: crear cuenta, autenticar, mostrar y gestionar reservas.</li>
          <li>
            Enviar notificaciones operativas: confirmación de reserva, recordatorios, cancelaciones,
            magic links de acceso. Estas no son marketing y no se pueden deshabilitar mientras
            tengas reservas activas.
          </li>
          <li>
            Facturar la suscripción mensual a los complejos clientes (planes Predio, Complejo y
            Estadio).
          </li>
          <li>
            Cumplir con obligaciones legales y contables (retención de comprobantes, respuesta a
            requerimientos judiciales o administrativos).
          </li>
          <li>Prevenir fraude, abusos y proteger la integridad del servicio.</li>
        </ul>
        <p>
          En v1 <strong>no enviamos comunicaciones de marketing</strong>. Si en el futuro lo
          hiciéramos, requeriremos un consentimiento explícito separado y siempre incluiremos un
          link de baja en cada email.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          4. Con quién compartimos tus datos
        </h2>
        <p>
          TurnoGol no vende, alquila ni comercializa tus datos personales. Trabajamos con los
          siguientes sub-encargados del tratamiento, cada uno con su propia política de privacidad y
          cláusulas contractuales estándar:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Supabase</strong> (Estados Unidos / Unión Europea): hosting de base de datos,
            autenticación y storage. Cifrado en reposo AES-256. Cumple SOC 2 Type II.
          </li>
          <li>
            <strong>Resend</strong> (Estados Unidos): envío de emails transaccionales y magic links.
          </li>
          <li>
            <strong>MercadoPago</strong> (Argentina): procesamiento de pagos de señas y
            suscripciones SaaS. TurnoGol nunca ve ni almacena números de tarjeta.
          </li>
          <li>
            <strong>Sentry</strong> (Estados Unidos): captura de errores y monitoreo. Tenemos
            scrubbing de datos personales activo (no enviamos email, nombre ni teléfono al stack
            trace).
          </li>
          <li>
            <strong>Vercel</strong> (Estados Unidos): hosting de la aplicación web. Procesa logs de
            request (IP, user agent) por hasta 30 días.
          </li>
          <li>
            <strong>Upstash</strong> (Estados Unidos): rate limiting para prevenir abuso de
            endpoints.
          </li>
        </ul>
        <p>
          Cuando reservás en un complejo específico, ese complejo (tenant) accede a tu nombre,
          email, teléfono e historial de reservas <em>en ese complejo</em>. No tiene acceso a tu
          actividad en otros complejos.
        </p>
        <p>
          La transferencia internacional de datos a Estados Unidos y la Unión Europea está
          contemplada en el artículo 12 de la Ley 25.326. Operamos bajo cláusulas contractuales
          estándar con cada proveedor.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          5. Cuánto tiempo retenemos tus datos
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Cuenta del jugador</strong>: mientras esté activa. Tras 12 meses sin actividad,
            te enviamos un aviso de reactivación y, si no respondés en 30 días, anonimizamos tus
            datos personales (manteniendo estadísticas de reserva sin asociarlas a vos).
          </li>
          <li>
            <strong>Historial de reservas</strong>: 12 meses con datos personales, luego se
            anonimiza para fines estadísticos del complejo.
          </li>
          <li>
            <strong>Datos financieros</strong> (pagos, facturas): 5 años. Es una obligación contable
            del Código de Comercio argentino y normativa AFIP.
          </li>
          <li>
            <strong>Audit logs</strong>: 12 meses, luego se purgan automáticamente.
          </li>
          <li>
            <strong>Datos de tenants churned</strong>: 90 días tras la baja del complejo, luego se
            anonimizan o eliminan.
          </li>
          <li>
            <strong>Registro de consentimientos</strong> (ej. aceptación de TyC, +18): indefinida,
            es prueba legal de que el consentimiento existió.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          6. Tus derechos (ARCO — Ley 25.326)
        </h2>
        <p>
          La Ley 25.326 te garantiza los derechos de <strong>Acceso</strong>,{' '}
          <strong>Rectificación</strong>, <strong>Cancelación</strong> y <strong>Oposición</strong>{' '}
          sobre tus datos personales:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Acceso</strong>: podés solicitar copia de todos los datos que tenemos sobre vos.
            Plazo de respuesta: 10 días hábiles. Gratuito una vez cada 6 meses. Endpoint disponible:{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">/api/player/data-export</code>{' '}
            (autenticado) o por mail a privacidad@turnogol.app.
          </li>
          <li>
            <strong>Rectificación</strong>: podés corregir nombre, email y teléfono desde tu perfil
            (self-service). Para correcciones sobre datos históricos, contactanos. Plazo: 5 días
            hábiles.
          </li>
          <li>
            <strong>Cancelación</strong> (eliminación): podés solicitar el borrado de tu cuenta
            enviando un mail a privacidad@turnogol.app. Anonimizamos tus datos personales (no
            podemos eliminar registros financieros por obligación contable de 5 años). Plazo: 10
            días hábiles.
          </li>
          <li>
            <strong>Oposición</strong>: podés oponerte al tratamiento con fines de marketing en
            cualquier momento. En v1 no enviamos marketing, así que este derecho aplicará desde el
            momento en que lo activemos.
          </li>
        </ul>
        <p>
          Para ejercer cualquiera de estos derechos verificamos tu identidad enviando un magic link
          al email registrado en la cuenta.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">7. Cookies y seguridad</h2>
        <p>
          TurnoGol usa <strong>únicamente cookies esenciales</strong> para el funcionamiento del
          servicio: sesión de autenticación gestionada por Supabase Auth, y la cookie de PIN gate
          para zonas sensibles del panel del complejo. No utilizamos cookies de tracking
          publicitario ni de analytics de terceros (Google Analytics, Facebook Pixel, etc.).
        </p>
        <p>
          Por eso no mostramos un banner de cookies: solo usamos cookies funcionales estrictamente
          necesarias, exceptuadas del requisito de consentimiento.
        </p>
        <p>
          En cuanto a seguridad, aplicamos las medidas correspondientes al{' '}
          <strong>nivel medio</strong> de la Disposición 11/2006 de la DNPDP: HTTPS obligatorio,
          cifrado en reposo de los tokens de MercadoPago de cada complejo, Row Level Security para
          aislamiento multi-tenant, audit logs INSERT-only, y backups diarios con retención.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">8. Autoridad de aplicación (AAIP)</h2>
        <p>
          La autoridad de control en materia de protección de datos personales en Argentina es la{' '}
          <strong>Agencia de Acceso a la Información Pública (AAIP)</strong>. Si considerás que tus
          derechos no fueron respetados, podés presentar un reclamo en{' '}
          <a
            className="text-emerald-700 dark:text-emerald-300 hover:underline"
            href="https://www.argentina.gob.ar/aaip"
            target="_blank"
            rel="noopener noreferrer"
          >
            argentina.gob.ar/aaip
          </a>
          .
        </p>
        <p>
          La inscripción de nuestras bases de datos en el Registro Nacional de Bases de Datos
          (artículo 21 de la Ley 25.326) se encuentra en trámite previo al lanzamiento comercial.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-foreground">
        <h2 className="text-xl font-semibold text-foreground">9. Cambios en esta política</h2>
        <p>
          Si modificamos esta política te lo informaremos por email (al menos 30 días antes para
          cambios sustanciales) y publicaremos la fecha de actualización al inicio de este
          documento. La versión vigente está siempre disponible en{' '}
          <Link
            className="text-emerald-700 dark:text-emerald-300 hover:underline"
            href="/privacidad"
          >
            turnogol.app/privacidad
          </Link>
          .
        </p>
      </section>
    </article>
  )
}
