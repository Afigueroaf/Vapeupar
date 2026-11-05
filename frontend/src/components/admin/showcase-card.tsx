"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { cdnImageUrl } from "@/lib/cdn";
import type { AdminProductRow } from "@/types/admin";

/**
 * Tarjeta de una línea en la pantalla «Vitrina».
 *
 * Con foto, porque la pregunta que responde la pantalla es visual: qué se ve
 * girando en la portada. Una tabla de nombres no la contesta.
 */

/** Por qué una línea elegida no llegaría a verse en el prisma. */
export type ShowcaseBlocker = "draft" | "image" | "price";

const BLOCKER_TEXT: Record<ShowcaseBlocker, string> = {
  draft: "en borrador",
  image: "sin imagen",
  price: "sin precio",
};

/**
 * Lo que impide que esta línea aparezca en el prisma, si algo lo impide.
 *
 * Son las mismas tres condiciones que aplica el contrato público: el
 * repositorio solo sirve líneas publicadas y con precio
 * (`prisma-product.repository.ts`), y el reparto de caras descarta las que no
 * traen imagen (`prism/faces.ts`). Se repiten aquí para poder avisar ANTES,
 * que es lo único que se puede hacer al respecto desde una pantalla.
 */
export function blockersOf(row: AdminProductRow): ShowcaseBlocker[] {
  const blockers: ShowcaseBlocker[] = [];
  if (row.status !== "published") blockers.push("draft");
  if (!row.imageKey) blockers.push("image");
  if (row.price === null) blockers.push("price");
  return blockers;
}

export function ShowcaseCard({
  row,
  canWrite,
  onToggle,
}: {
  row: AdminProductRow;
  canWrite: boolean;
  /** Resuelve cuando el cambio está guardado; si rechaza, la tarjeta no cambia. */
  onToggle: (row: AdminProductRow, showcase: boolean) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const blockers = blockersOf(row);
  const url = cdnImageUrl(row.imageKey);

  async function toggle() {
    setPending(true);
    try {
      await onToggle(row, !row.showcase);
    } catch {
      // El mensaje lo pone la pantalla, que es quien tiene el sitio para él.
      // Aquí se traga a propósito: dejarlo subir desde un `onClick` solo
      // produce un rechazo sin atender en la consola del navegador.
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface
      as="article"
      border={row.showcase ? "accent" : "muted"}
      className="flex flex-col gap-3 p-4"
    >
      <div className="flex items-start gap-3">
        <Thumbnail url={url} name={row.name} />

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold leading-tight" title={row.name}>
            {row.name}
          </h3>
          <p className="truncate text-xs text-muted">{row.brandName}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.showcase && <PixelLabel variant="lime">EN VITRINA</PixelLabel>}
            {row.status === "draft" && <PixelLabel variant="outline">BORRADOR</PixelLabel>}
          </div>
        </div>
      </div>

      {/*
        El aviso solo se pinta en las elegidas: en las demás, «sin imagen» es un
        dato de la línea y no un problema, porque nadie espera verla girando.
      */}
      {row.showcase && blockers.length > 0 && (
        <p className="text-xs font-bold text-accent">
          No se verá en la portada: {blockers.map((key) => BLOCKER_TEXT[key]).join(", ")}.
        </p>
      )}

      {canWrite ? (
        <Button
          variant={row.showcase ? "ghost" : "secondary"}
          onClick={toggle}
          disabled={pending}
          className="w-full"
        >
          {pending ? "Guardando…" : row.showcase ? "Quitar de la vitrina" : "Poner en la vitrina"}
        </Button>
      ) : (
        <p className="text-xs text-muted">Solo el propietario cambia la vitrina.</p>
      )}
    </Surface>
  );
}

/**
 * Miniatura por CloudFront.
 *
 * `object-contain` y no `cover`: es la misma razón por la que la tarjeta del
 * catálogo lo usa —un recorte se come el producto— y aquí además sería una
 * mentira, porque esta foto es la que se va a ver en el prisma.
 *
 * El bucket es privado y la distribución responde 403 a una clave que no
 * existe, así que un fallo de carga es información: se enseña el hueco.
 */
function Thumbnail({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className="flex size-20 shrink-0 items-center justify-center rounded-vp border-2 border-muted bg-background text-center"
        role="img"
        aria-label={`${name} - sin imagen`}
      >
        <span className="vp-label text-[0.6rem] text-muted">SIN FOTO</span>
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={name}
      width={80}
      height={80}
      unoptimized
      onError={() => setFailed(true)}
      className="size-20 shrink-0 rounded-vp border-2 border-muted bg-background object-contain"
    />
  );
}
