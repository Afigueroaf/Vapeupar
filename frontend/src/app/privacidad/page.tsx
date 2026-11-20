import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { PixelLabel } from "@/components/ui/pixel-label";
import { formatPhoneCO, waLink, whatsappNumber } from "@/lib/contact";
import { DATA_POLICY_VERSION, isDraftPolicy } from "@/lib/order-form";

/**
 * Política de tratamiento de datos personales: `/privacidad` (ADR-003 §4).
 *
 * BORRADOR PENDIENTE DE REVISIÓN LEGAL. Redactado sobre la Ley 1581 de 2012 y
 * el Decreto 1377 de 2013 (hoy en el Decreto 1074 de 2015) a partir de lo que
 * el sistema hace de verdad: qué guarda el pedido, para qué, quién lo ve y
 * cuándo se anonimiza (`backend/src/services/order.service.ts`, `RETENTION`).
 * Los datos del responsable que no constan en el repositorio van como
 * `[PENDIENTE: …]`: no se inventan.
 *
 * La versión es `DATA_POLICY_VERSION`, la misma que acepta el cliente en el
 * carrito y que el backend exige. **Cambiar este texto obliga a subirla en los
 * dos lados** (`lib/order-form.ts` y `backend/src/schemas/order.schema.ts`;
 * la prueba de paridad lo vigila). Mientras empiece por «borrador», la página
 * lo avisa arriba.
 */

const DESCRIPTION =
  "Cómo trata Vapeupar los datos personales de quienes hacen un pedido: qué datos, para qué, cuánto tiempo y cómo ejercer tus derechos.";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos | Vapeupar",
  description: DESCRIPTION,
  alternates: { canonical: "/privacidad" },
  openGraph: { title: "Política de tratamiento de datos | Vapeupar", description: DESCRIPTION },
};

/** Plazos de `RETENTION` en el backend (ADR-003 §4). */
const RETENTION_CLOSED_DAYS = 365;
const RETENTION_RECEIVED_DAYS = 30;

function Pending({ children }: { children: React.ReactNode }) {
  return <mark className="bg-transparent font-semibold text-action">[PENDIENTE: {children}]</mark>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t-2 border-muted pt-8">
      <h2 id={id} className="text-xl font-bold uppercase leading-tight">
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-base leading-relaxed text-muted [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  const draft = isDraftPolicy(DATA_POLICY_VERSION);
  const whatsappHref = waLink("Hola Vapeupar! Quiero ejercer mis derechos sobre mis datos personales.");
  const whatsappLabel = whatsappNumber ? formatPhoneCO(`+${whatsappNumber}`) : null;

  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-inline py-section">
        <header className="vp-glitch">
          <PixelLabel variant="outline">[ DATOS ]</PixelLabel>
          <h1 className="mt-4 text-[2rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[2.75rem]">
            Política de tratamiento de datos personales
          </h1>
          <p className="mt-4 text-sm text-muted">
            Versión <span className="font-semibold text-foreground">{DATA_POLICY_VERSION}</span>
          </p>
        </header>

        {draft ? (
          <div role="note" className="mt-8 border-2 border-action p-4 sm:p-5">
            <p className="font-bold uppercase text-action">Borrador pendiente de revisión legal</p>
            <p className="mt-2 text-sm leading-relaxed">
              Este texto aún no ha sido revisado por un abogado y puede cambiar. Los apartados
              marcados [PENDIENTE] faltan por completar. Mientras sea un borrador, la web no
              registra pedidos con datos personales.
            </p>
          </div>
        ) : null}

        <div className="mt-10 space-y-8">
          <Section id="responsable" title="1. Responsable del tratamiento">
            <p>
              <strong>Vapeupar</strong>, tienda de vapeo en Valledupar, Colombia.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Razón social o nombre del titular: <Pending>razón social o nombre del comerciante</Pending>
              </li>
              <li>
                NIT o cédula: <Pending>NIT</Pending>
              </li>
              <li>
                Domicilio: <Pending>dirección</Pending>, Valledupar, Cesar
              </li>
              <li>
                Correo para datos personales: <Pending>correo de contacto para habeas data</Pending>
              </li>
              <li>
                WhatsApp:{" "}
                {whatsappLabel ? (
                  <span className="text-foreground">{whatsappLabel}</span>
                ) : (
                  <Pending>número de WhatsApp de la tienda</Pending>
                )}
              </li>
            </ul>
          </Section>

          <Section id="datos" title="2. Qué datos tratamos">
            <p>Cuando haces un pedido en la web y lo autorizas, guardamos solo:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Nombre</strong>, para saber a quién atendemos.
              </li>
              <li>
                <strong>Celular</strong> colombiano, para confirmar el pedido por WhatsApp.
              </li>
              <li>
                <strong>Barrio</strong> de Valledupar, para calcular el domicilio.
              </li>
            </ul>
            <p>
              Junto al pedido quedan los productos, las cantidades, los precios y las fechas de cada
              paso, y la prueba de tu autorización (la versión de esta política y la fecha en que la
              aceptaste).
            </p>
            <p>
              <strong>No guardamos</strong> tu dirección exacta (la acordamos por WhatsApp), tu número
              de cédula (la revisamos al entregar para comprobar que eres mayor de edad, pero no la
              anotamos) ni tu dirección IP. No tratamos datos sensibles ni datos de menores de edad:
              solo vendemos a mayores de 18 años.
            </p>
          </Section>

          <Section id="finalidad" title="3. Para qué los usamos">
            <ul className="list-disc space-y-1 pl-5">
              <li>Gestionar tu pedido: confirmar disponibilidad, el valor del domicilio y la entrega.</li>
              <li>Reconocerte cuando vuelvas a pedir, para atenderte más rápido.</li>
            </ul>
            <p>
              <strong>No</strong> los usamos para publicidad ni los vendemos o cedemos a terceros.
              Si un día quisiéramos usarlos para otra finalidad, te pediríamos una autorización nueva.
            </p>
          </Section>

          <Section id="autorizacion" title="4. Tu autorización">
            <p>
              Antes de enviar el pedido, el carrito te pide marcar una casilla que viene desmarcada.
              Sin esa autorización no registramos el pedido en la web; puedes seguir pidiendo
              directamente por WhatsApp. Guardamos la versión de esta política que aceptaste y la
              fecha, como prueba de la autorización (artículo 9 de la Ley 1581 de 2012).
            </p>
          </Section>

          <Section id="acceso" title="5. Quién accede y dónde se guardan">
            <p>
              Solo el personal de Vapeupar que gestiona los pedidos, desde una consola privada con
              verificación en dos pasos. La web pública nunca muestra datos de un pedido.
            </p>
            <p>
              Los datos se alojan, cifrados, en servidores de Amazon Web Services en Estados Unidos,
              que actúa como encargado del tratamiento por cuenta de Vapeupar.{" "}
              <Pending>revisión legal de la transmisión internacional de datos y del contrato con el encargado</Pending>
            </p>
            <p>
              La conversación por WhatsApp ocurre en un servicio de un tercero (Meta), con su propia
              política de privacidad.
            </p>
          </Section>

          <Section id="conservacion" title="6. Cuánto tiempo los conservamos">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Pedidos entregados o cancelados: anonimizamos tu nombre, celular y barrio a los{" "}
                <strong>{RETENTION_CLOSED_DAYS} días</strong> de cerrarse.
              </li>
              <li>
                Pedidos que nunca se confirmaron: se cancelan y se anonimizan a los{" "}
                <strong>{RETENTION_RECEIVED_DAYS} días</strong>.
              </li>
              <li>
                Si nos pides suprimir tus datos, los anonimizamos en cuanto el pedido esté cerrado
                (entregado o cancelado).
              </li>
            </ul>
            <p>
              Anonimizar es borrar los datos personales del pedido. Los productos, las cantidades y
              los precios se conservan porque son registros contables, pero ya no se pueden asociar a
              ti. Las copias de seguridad automáticas caducan solas en pocos días.
            </p>
          </Section>

          <Section id="derechos" title="7. Tus derechos">
            <p>Como titular de los datos (artículo 8 de la Ley 1581 de 2012) puedes:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Conocer, actualizar y rectificar tus datos.</li>
              <li>Pedir prueba de la autorización que nos diste.</li>
              <li>Saber qué uso les hemos dado.</li>
              <li>Revocar la autorización y pedir que suprimamos tus datos.</li>
              <li>Acceder gratis a tus datos.</li>
              <li>
                Presentar quejas ante la Superintendencia de Industria y Comercio, después de haber
                hecho la consulta o el reclamo ante nosotros.
              </li>
            </ul>
          </Section>

          <Section id="como" title="8. Cómo ejercerlos">
            <p>
              Escríbenos por WhatsApp
              {whatsappHref ? (
                <>
                  {" "}
                  (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-action underline underline-offset-4"
                  >
                    abrir conversación
                  </a>
                  )
                </>
              ) : null}{" "}
              o al correo <Pending>correo de contacto para habeas data</Pending>, con tu nombre, el
              celular con el que hiciste el pedido y lo que pides. Si tienes la referencia del pedido
              (VP-XXXXXX), inclúyela.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Consultas</strong> (qué datos tenemos y cómo los usamos): respondemos en un
                máximo de 10 días hábiles, prorrogables 5 más avisándote el motivo (artículo 14).
              </li>
              <li>
                <strong>Reclamos</strong> (corregir, actualizar, suprimir o revocar): respondemos en un
                máximo de 15 días hábiles, prorrogables 8 más avisándote el motivo (artículo 15).
              </li>
            </ul>
            <p>
              Para proteger tus datos, podemos pedirte que confirmes que eres el titular, por ejemplo
              escribiéndonos desde el mismo celular del pedido.
            </p>
          </Section>

          <Section id="vigencia" title="9. Vigencia y cambios">
            <p>
              Esta política rige desde <Pending>fecha de entrada en vigor</Pending>. Si cambia de forma
              importante, lo publicaremos aquí con una versión nueva y, para pedidos nuevos, te
              pediremos aceptarla otra vez.
            </p>
            <p>
              <Pending>confirmar si aplica la inscripción de la base de datos en el Registro Nacional de Bases de Datos (RNBD)</Pending>
            </p>
          </Section>
        </div>
      </article>
    </PublicShell>
  );
}
