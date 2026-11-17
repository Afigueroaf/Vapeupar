import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { buttonStyles } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";

/**
 * Nosotros: `/nosotros` (fase V8, `docs/design-reset-inventory.md` §5.6 y §6.3).
 *
 * COPY PROVISIONAL (2026-11-17): redactado a partir de
 * `docs/catalog-domain.md` §2 (autenticidad, entrega en Valledupar) y de los
 * datos que ya publica el pie (horario, cobertura). No hay texto aprobado por
 * el negocio; cuando lo haya, se sustituye aquí o pasa a `SiteContent` (A7).
 *
 * La advertencia legal de salud no se repite: va completa y palabra por
 * palabra en el pie de esta misma página (`footer.tsx`).
 */

const DESCRIPTION =
  "Vapeupar es una tienda de vapeo en Valledupar: productos originales verificables, entrega a domicilio el mismo día y atención por WhatsApp.";

export const metadata: Metadata = {
  title: "Nosotros | Vapeupar",
  description: DESCRIPTION,
  alternates: { canonical: "/nosotros" },
  openGraph: { title: "Nosotros | Vapeupar", description: DESCRIPTION },
};

const PILLARS = [
  {
    tag: "[ 01 ]",
    title: "Solo originales",
    body:
      "El mercado está lleno de copias sin certificar. Todo lo que vendemos llega de distribuidores autorizados, con su sello de seguridad y un código QR que puedes verificar con el fabricante antes de abrirlo.",
  },
  {
    tag: "[ 02 ]",
    title: "Entrega en Valledupar",
    body:
      "Cuando se acaba el equipo no quieres esperar una semana. Llevamos tu pedido a domicilio en Valledupar, normalmente el mismo día, y pagas al recibirlo.",
  },
  {
    tag: "[ 03 ]",
    title: "Te asesoramos",
    body:
      "¿Vienes del cigarrillo o quieres bajar la nicotina? Escríbenos por WhatsApp y te ayudamos a elegir equipo, sabor y concentración sin rodeos.",
  },
] as const;

export default function AboutPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-vp px-inline py-section">
        <header className="vp-glitch max-w-3xl">
          <PixelLabel variant="outline">[ NOSOTROS ]</PixelLabel>
          <h1 className="mt-4 text-[2rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[3rem]">
            Vapeo original, sin vueltas
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted sm:text-[1.0625rem]">{DESCRIPTION}</p>
        </header>

        <ul className="vp-glitch mt-block grid gap-block md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <li key={pillar.tag}>
              <Surface className="h-full p-6 sm:p-8">
                <PixelLabel variant="violet">{pillar.tag}</PixelLabel>
                <h2 className="mt-5 text-xl font-bold uppercase leading-tight">{pillar.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-muted">{pillar.body}</p>
              </Surface>
            </li>
          ))}
        </ul>

        <section aria-labelledby="mayores" className="vp-glitch mt-block max-w-3xl border-t-2 border-muted pt-block">
          <PixelLabel variant="lime">[ +18 ]</PixelLabel>
          <h2 id="mayores" className="mt-4 text-xl font-bold uppercase leading-tight">
            Solo para mayores de edad
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">
            No vendemos a menores de 18 años. Quien recibe el pedido debe mostrar su documento de identidad
            físico; sin él, no se entrega.
          </p>
          <Link href="/#catalogo" className={buttonStyles("primary", "mt-8")}>
            Ver la tienda
          </Link>
        </section>
      </div>
    </PublicShell>
  );
}
