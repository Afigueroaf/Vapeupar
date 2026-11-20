"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminSession } from "@/components/admin/admin-shell";
import { ContentEditor } from "@/components/admin/content/editors";
import { VersionHistory } from "@/components/admin/content/history";
import { ContentPreview } from "@/components/admin/content/preview";
import { FormError, FormStatus } from "@/components/admin/form";
import { ScreenHeader } from "@/components/admin/screen";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { AdminApiError, adminApi, errorMessage } from "@/lib/admin-api";
import {
  apiFieldErrors,
  CONTENT_KEY_INFO,
  editableValue,
  publishedMessage,
  sameContent,
  validateContent,
  type FieldErrors,
} from "@/lib/content-form";
import { type ContentKey, type ContentValue } from "@/lib/content/schemas";
import { cn, formatDateTimeCO } from "@/lib/utils";
import type { ContentVersionRow } from "@/types/admin";

/**
 * Contenido del sitio (plan A5.4).
 *
 * Publicación directa con vista previa, sin borradores (decisión
 * `dec-borrador-o-publicacion-directa`): «Publicar» crea una versión nueva que
 * el sitio sirve al momento, y un error se deshace con «Restaurar» sobre una
 * versión anterior, que vuelve a publicarla como versión nueva sin reescribir
 * el historial.
 *
 * La validación en vivo usa el esquema espejo (`lib/content/schemas.ts`), el
 * mismo que exige el backend: con errores, «Publicar» no se activa, y un 400
 * que llegara igual se proyecta sobre sus campos.
 *
 * Leer es para cualquier sesión; publicar y restaurar, solo para el dueño. El
 * operator ve el formulario en solo lectura, y el backend responde 403 igual.
 */

const KEYS = Object.keys(CONTENT_KEY_INFO) as ContentKey[];

/** Cuántas versiones se listan. El backend admite hasta 50. */
const HISTORY_LIMIT = 20;

interface Query {
  key: ContentKey;
}

interface Loaded {
  key: ContentKey;
  latest: ContentVersionRow | null;
  versions: ContentVersionRow[];
}

const fetchContent = async ({ key }: Query): Promise<Loaded> => {
  const [latest, versions] = await Promise.all([
    adminApi.content.get(key),
    adminApi.content.versions(key, HISTORY_LIMIT),
  ]);
  return { key, latest, versions };
};

export default function ContentPage() {
  const { identity } = useAdminSession();
  const canWrite = identity.role === "owner";

  const [query, setQuery] = useState<Query>({ key: "hero" });
  const key = query.key;
  const { data, error, loading } = useAdminQuery(query, fetchContent, "No se pudo cargar el contenido");
  const loaded = data?.key === key ? data : null;

  /** Lo editado y aún sin publicar, por clave: cambiar de pestaña no lo pierde. */
  const [drafts, setDrafts] = useState<Partial<Record<ContentKey, unknown>>>({});
  /** Errores que devolvió el backend, por campo, hasta el siguiente cambio. */
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [viewing, setViewing] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [partners, setPartners] = useState<string[] | null>(null);

  // Marcas aliadas activas, para sustituir `{marcas}` en la vista previa.
  useEffect(() => {
    let alive = true;
    adminApi.brands({ isPartner: true, active: true, limit: 100 }).then(
      (page) => {
        if (alive) setPartners(page.data.map((brand) => brand.name));
      },
      () => undefined, // Sin marcas, la vista previa usa la fórmula genérica, como el sitio.
    );
    return () => {
      alive = false;
    };
  }, []);

  const base = useMemo(
    () => (loaded ? editableValue(key, loaded.latest?.value ?? undefined) : null),
    [key, loaded],
  );
  const draft = (drafts[key] ?? base?.value) as ContentValue<ContentKey> | undefined;
  const validation = useMemo(() => (draft === undefined ? null : validateContent(key, draft)), [key, draft]);
  const errors = useMemo(
    () => ({ ...serverErrors, ...(validation?.errors ?? {}) }),
    [serverErrors, validation],
  );
  const dirty = base !== null && draft !== undefined && !sameContent(key, draft, base.value);
  // `change` solo guarda un borrador si difiere de lo cargado, así que «hay
  // borrador» es «hay cambios reales».
  const anyDirty = dirty || KEYS.some((k) => k !== key && drafts[k] !== undefined);
  const errorCount = Object.keys(validation?.errors ?? {}).length;
  const canPublish =
    canWrite && !pending && validation?.value != null && (dirty || base?.source !== "published");

  const viewed = viewing === null ? null : loaded?.versions.find((v) => v.version === viewing) ?? null;
  const previewValue = viewed ? editableValue(key, viewed.value).value : draft;

  // Avisa antes de salir con cambios sin publicar.
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const reload = useCallback(() => setQuery((current) => ({ ...current })), []);

  function selectKey(next: ContentKey) {
    if (next === key) return;
    setQuery({ key: next });
    setViewing(null);
    setServerErrors({});
    setStatus(null);
    setActionError(null);
    setRestoreError(null);
  }

  function change(value: unknown) {
    // Volver a dejarlo como estaba no cuenta como cambio.
    const unchanged = base !== null && sameContent(key, value, base.value);
    setDrafts((current) => ({ ...current, [key]: unchanged ? undefined : value }));
    setServerErrors({});
    setStatus(null);
  }

  function discard() {
    setDrafts((current) => ({ ...current, [key]: undefined }));
    setServerErrors({});
  }

  /** Tras escribir: lo publicado pasa a ser la base y el borrador local sobra. */
  function afterWrite(message: string) {
    setDrafts((current) => ({ ...current, [key]: undefined }));
    setViewing(null);
    setStatus(message);
    reload();
  }

  async function publish() {
    if (!validation?.value) return;
    setPending(true);
    setActionError(null);
    setRestoreError(null);
    setStatus(null);
    try {
      const result = await adminApi.content.publish(key, validation.value);
      afterWrite(publishedMessage(result.revalidated, result.version.version));
    } catch (cause) {
      // Un 400 se proyecta sobre los campos del borrador, que es lo que se envió.
      if (cause instanceof AdminApiError) setServerErrors(apiFieldErrors(cause.fields));
      setActionError(errorMessage(cause, "No se pudo publicar"));
    } finally {
      setPending(false);
    }
  }

  async function restore(version: number) {
    setPending(true);
    setActionError(null);
    setRestoreError(null);
    setStatus(null);
    try {
      const result = await adminApi.content.restore(key, version);
      afterWrite(publishedMessage(result.revalidated, result.version.version, version));
    } catch (cause) {
      // El valor rechazado es el de la versión, no el del borrador: el error
      // va al historial, no a los campos.
      setRestoreError(errorMessage(cause, "No se pudo restaurar la versión"));
    } finally {
      setPending(false);
    }
  }

  const info = CONTENT_KEY_INFO[key];

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Contenido"
        description="Los textos editables del sitio. Publicar los pone en la web al momento."
      >
        <Button variant="secondary" onClick={reload} disabled={loading || pending}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      <nav aria-label="Partes del sitio" className="flex flex-wrap gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => selectKey(k)}
            aria-current={k === key ? "page" : undefined}
            className={cn(
              "min-h-[44px] border-2 px-4 font-display text-sm font-bold uppercase tracking-[0.02em] transition-colors",
              k === key ? "border-action text-foreground" : "border-muted text-muted hover:border-line hover:text-foreground",
            )}
          >
            {CONTENT_KEY_INFO[k].label}
            {drafts[k] !== undefined && <span className="ml-2 text-action" aria-label="(cambios sin publicar)">•</span>}
          </button>
        ))}
      </nav>

      {error && <FormError>{error}</FormError>}
      {actionError && <FormError>{actionError}</FormError>}
      {status && <FormStatus>{status}</FormStatus>}

      {!loaded || !base || draft === undefined ? (
        <Surface border="muted" className="p-6">
          <p className="text-sm text-muted">{error ? "Sin datos que mostrar." : "Cargando…"}</p>
        </Surface>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Surface border="line" as="section" aria-labelledby="content-form-title" className="space-y-6 p-4 sm:p-6">
            <div>
              <h2 id="content-form-title" className="font-display text-lg font-bold uppercase tracking-[0.02em]">
                {info.label}
              </h2>
              <p className="mt-1 text-sm text-muted">{info.description}</p>
              <p className="mt-2 text-xs text-muted">
                {base.source === "published" && loaded.latest
                  ? `Versión ${loaded.latest.version} publicada el ${formatDateTimeCO(loaded.latest.publishedAt ?? loaded.latest.createdAt)}.`
                  : base.source === "default"
                    ? "Usando el texto por defecto: esta parte nunca se publicó desde la consola."
                    : "La última versión publicada ya no cumple el esquema: el sitio muestra el texto por defecto, que es lo que ves aquí."}
              </p>
            </div>

            {!canWrite && (
              <p className="border-2 border-muted px-3 py-2 text-sm text-muted">
                Solo lectura: publicar y restaurar son acciones del dueño de la cuenta.
              </p>
            )}

            <form
              noValidate
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (canPublish) void publish();
              }}
            >
              <ContentEditor
                key={key}
                contentKey={key}
                value={draft}
                errors={errors}
                // Mientras se publica o restaura, nada se edita: lo enviado es lo que se ve.
                readOnly={!canWrite || pending}
                onChange={change}
              />

              {errors[""] && <FormError>{errors[""]}</FormError>}

              {canWrite && (
                <div className="flex flex-wrap items-center gap-3 border-t-2 border-muted pt-4">
                  <Button type="submit" disabled={!canPublish}>
                    {pending ? "Publicando…" : "Publicar"}
                  </Button>
                  {dirty && (
                    <Button variant="ghost" onClick={discard} disabled={pending}>
                      Descartar cambios
                    </Button>
                  )}
                  <p className="text-xs text-muted" aria-live="polite">
                    {errorCount > 0
                      ? `Corrige ${errorCount === 1 ? "el campo marcado" : `los ${errorCount} campos marcados`} para publicar.`
                      : dirty
                        ? "Cambios sin publicar. Revisa la vista previa antes."
                        : base.source === "published"
                          ? "Sin cambios respecto a lo publicado."
                          : "Puedes publicar el texto por defecto como versión 1."}
                  </p>
                </div>
              )}
            </form>
          </Surface>

          <div className="space-y-6 xl:sticky xl:top-6">
            <section aria-labelledby="content-preview-title" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="content-preview-title" className="font-display text-lg font-bold uppercase tracking-[0.02em]">
                  Vista previa
                </h2>
                {viewed && (
                  <Button variant="ghost" onClick={() => setViewing(null)}>
                    Volver a la edición
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">
                {viewed
                  ? `Versión ${viewed.version}, publicada el ${formatDateTimeCO(viewed.publishedAt ?? viewed.createdAt)}.`
                  : dirty
                    ? "Lo que estás editando, todavía sin publicar."
                    : "Lo que hay ahora en el sitio."}
              </p>
              <Surface border={viewed ? "accent" : "muted"} className="overflow-hidden bg-background">
                <ContentPreview contentKey={key} value={previewValue as ContentValue<ContentKey>} partners={partners} />
              </Surface>
            </section>

            <VersionHistory
              versions={loaded.versions}
              limit={HISTORY_LIMIT}
              currentUserId={identity.userId}
              viewing={viewing}
              canRestore={canWrite}
              pending={pending}
              dirty={dirty}
              error={restoreError}
              onView={(version) => setViewing((current) => (current === version ? null : version))}
              onRestore={restore}
            />
          </div>
        </div>
      )}
    </div>
  );
}
