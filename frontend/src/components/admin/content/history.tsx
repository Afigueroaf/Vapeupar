"use client";

import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { validateContent } from "@/lib/content-form";
import type { ContentKey } from "@/lib/content/schemas";
import { formatDateTimeCO } from "@/lib/utils";
import type { ContentVersionRow } from "@/types/admin";

/**
 * Historial de versiones de una clave (A5.4), de la más reciente a la más
 * antigua.
 *
 * «Ver» lleva la versión a la vista previa sin tocar lo que se está editando.
 * «Restaurar» la vuelve a publicar como versión nueva (`POST
 * /:key/versions/:n/restore`): el historial nunca se reescribe. No se ofrece
 * sobre la vigente, que ya es lo publicado, ni sobre una versión que ya no
 * cumple el esquema, que el backend rechazaría.
 */
export function VersionHistory({
  versions,
  limit,
  currentUserId,
  viewing,
  canRestore,
  pending,
  onView,
  onRestore,
}: {
  versions: ContentVersionRow[];
  limit: number;
  currentUserId: string;
  viewing: number | null;
  canRestore: boolean;
  pending: boolean;
  onView: (version: number) => void;
  onRestore: (version: number) => void;
}) {
  return (
    <section aria-labelledby="content-history-title" className="space-y-3">
      <h2 id="content-history-title" className="font-display text-lg font-bold uppercase tracking-[0.02em]">
        Historial
      </h2>

      {versions.length === 0 ? (
        <Surface border="muted" className="p-4">
          <p className="text-sm text-muted">
            Usando el texto por defecto: todavía no hay versiones publicadas de esta parte.
          </p>
        </Surface>
      ) : (
        <ol className="space-y-2">
          {versions.map((version, index) => {
            const latest = index === 0;
            const valid = validateContent(version.key as ContentKey, version.value).value !== null;
            const author = version.userId === currentUserId ? "tú" : `usuario ${version.userId.slice(0, 8)}`;
            return (
              <li key={version.version}>
                <Surface
                  border={viewing === version.version ? "accent" : "muted"}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-display font-bold">
                      Versión {version.version}
                      {latest && <PixelLabel variant="lime">VIGENTE</PixelLabel>}
                      {!valid && <PixelLabel variant="outline">NO VÁLIDA</PixelLabel>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTimeCO(version.publishedAt ?? version.createdAt)} · por {author}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      aria-pressed={viewing === version.version}
                      aria-label={`Ver la versión ${version.version} en la vista previa`}
                      onClick={() => onView(version.version)}
                    >
                      <Eye className="size-4" aria-hidden="true" />
                      Ver
                    </Button>
                    {canRestore && !latest && valid && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        aria-label={`Restaurar la versión ${version.version}`}
                        onClick={() => onRestore(version.version)}
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        Restaurar
                      </Button>
                    )}
                  </div>
                </Surface>
              </li>
            );
          })}
        </ol>
      )}

      {versions.length >= limit && (
        <p className="text-xs text-muted">Se muestran las {limit} versiones más recientes.</p>
      )}
    </section>
  );
}
