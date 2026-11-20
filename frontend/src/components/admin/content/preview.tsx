"use client";

import { ContactView } from "@/components/contact-view";
import { FAQ } from "@/components/faq";
import { HeroView } from "@/components/hero-view";
import { TrustBandCards } from "@/components/trust-band-view";
import { CardField } from "@/components/ui/card-field";
import { Surface } from "@/components/ui/surface";
import { withPartnerBrands } from "@/lib/content";
import { truncateForPreview } from "@/lib/content-form";
import { siteUrl } from "@/lib/site-url";
import type {
  ContactContent,
  ContentKey,
  ContentValue,
  FaqContent,
  HeroContent,
  SeoContent,
  TrustBandContent,
} from "@/lib/content/schemas";

/**
 * Vista previa de `/admin/content` (A5.4).
 *
 * Intro, banda, FAQ y pie usan los mismos componentes que la portada
 * (`HeroView`, `TrustBandCards`, `FAQ`, `ContactView`), así que lo que se ve
 * aquí es lo que se publicará, salvo el contexto: aquí no hay vaporizador 3D
 * ni vitrina alrededor. En la FAQ, `{marcas}` se sustituye con las marcas
 * aliadas reales, como hace `app/page.tsx`, y la pregunta legal la inserta
 * el propio `FAQ`.
 *
 * El SEO no tiene componente en la página: se enseña como lo pintaría un
 * buscador y como la tarjeta de un enlace compartido.
 */

/** Lo que muestra Google sin cortar, más o menos. */
const SEARCH_TITLE_CHARS = 60;
const SEARCH_DESCRIPTION_CHARS = 155;

function SeoPreview({ value }: { value: SeoContent }) {
  const host = siteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <div className="space-y-4">
      <div>
        <p className="vp-label mb-2 text-muted">Buscador</p>
        <Surface border="muted" className="space-y-1 p-4">
          <p className="truncate text-xs text-muted">{host}</p>
          <p className="font-display text-lg text-action">{truncateForPreview(value.title, SEARCH_TITLE_CHARS)}</p>
          <p className="text-sm text-muted">{truncateForPreview(value.description, SEARCH_DESCRIPTION_CHARS)}</p>
        </Surface>
      </div>
      {(
        [
          ["openGraph", "WhatsApp / Facebook"],
          ["twitter", "X"],
        ] as const
      ).map(([network, label]) => (
        <div key={network}>
          <p className="vp-label mb-2 text-muted">{label}</p>
          <Surface border="muted" className="overflow-hidden">
            <div className="flex aspect-[1.91/1] items-center justify-center border-b-2 border-muted bg-background text-xs text-muted">
              Imagen del sitio
            </div>
            <div className="space-y-1 p-3">
              <p className="text-xs uppercase text-muted">{host}</p>
              <p className="font-display font-bold">{truncateForPreview(value[network].title, 70)}</p>
              <p className="text-sm text-muted">{truncateForPreview(value[network].description, 120)}</p>
            </div>
          </Surface>
        </div>
      ))}
      {value.keywords.length > 0 && (
        <p className="text-xs text-muted">Palabras clave: {value.keywords.join(", ")}</p>
      )}
    </div>
  );
}

export function ContentPreview<K extends ContentKey>({
  contentKey,
  value,
  partners,
}: {
  contentKey: K;
  value: ContentValue<K>;
  /** Marcas aliadas activas; `null` si no se pudieron leer (se usa la fórmula genérica). */
  partners: string[] | null;
}) {
  switch (contentKey) {
    case "hero":
      return (
        <div className="px-4 py-8">
          <HeroView content={value as HeroContent} />
        </div>
      );
    case "trust-band":
      return (
        <CardField className="grid gap-3 p-4">
          <TrustBandCards items={(value as TrustBandContent).items} />
        </CardField>
      );
    case "faq": {
      const faq = value as FaqContent;
      const brands = (text: string) => withPartnerBrands(text, partners);
      return (
        <FAQ
          content={{
            title: brands(faq.title),
            intro: brands(faq.intro),
            items: faq.items.map((item) => ({ question: brands(item.question), answer: brands(item.answer) })),
          }}
        />
      );
    }
    case "seo":
      return (
        <div className="p-4">
          <SeoPreview value={value as SeoContent} />
        </div>
      );
    case "contact":
      return (
        <div className="pb-4">
          <ContactView contact={value as ContactContent} />
        </div>
      );
    default:
      return null;
  }
}
