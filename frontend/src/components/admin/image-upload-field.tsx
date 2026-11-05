"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { adminApi, errorMessage } from "@/lib/admin-api";
import { cdnImageUrl } from "@/lib/cdn";
import type { ImageUploadTarget } from "@/types/admin";
import { FormError, FormStatus } from "./form";

const ACCEPTED_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
const MAX_SIZE = 5 * 1024 * 1024;

interface ImageUploadFieldProps {
  id?: string;
  label: string;
  target: ImageUploadTarget;
  /** `null` mientras la entidad no existe: el presign necesita su `id`. */
  entityId: string | null;
  imageKey: string | null;
  onUploaded: (key: string) => void;
  onError?: (message: string | null) => void;
  /** Si se pasa, aparece «Quitar»: deja la entidad sin imagen al guardar. */
  onClear?: () => void;
}

/**
 * Pide una URL temporal al admin y sube el archivo directamente al bucket.
 *
 * El navegador nunca ve credenciales de AWS y tampoco elige la clave del
 * objeto: la decide el backend a partir de la entidad (ADR-002 §8). La clave
 * recién subida se devuelve por `onUploaded`, y guardarla en la base es cosa
 * del formulario que lo monta.
 *
 * Quitar la imagen solo borra la clave en la base; el objeto sigue en el
 * bucket, que es lo que permite volver atrás sin volver a subirla.
 */
export function ImageUploadField({
  id,
  label,
  target,
  entityId,
  imageKey,
  onUploaded,
  onError,
  onClear,
}: ImageUploadFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `image-upload-${generatedId}`;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /**
   * Sube uno por cada carga. La clave de una entidad es siempre la misma, así
   * que reemplazar una imagen no cambia la URL: sin esto el navegador seguiría
   * mostrando la que ya tenía en su caché.
   */
  const [uploads, setUploads] = useState(0);

  function fail(message: string) {
    setError(message);
    onError?.(message);
  }

  async function upload(file: File | undefined) {
    // Cada intento parte de cero: un error anterior no puede quedarse pegado
    // ni seguir bloqueando el formulario que escucha `onError`.
    setError(null);
    setStatus(null);
    onError?.(null);
    if (!file || !entityId) return;
    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      fail("Solo se permiten imágenes WEBP, JPEG o PNG");
      return;
    }
    if (file.size > MAX_SIZE) {
      fail("La imagen no puede superar 5 MB");
      return;
    }

    setPending(true);
    try {
      const presigned = await adminApi.presignImage({
        target,
        entityId,
        contentType: file.type as "image/webp" | "image/jpeg" | "image/png",
        size: file.size,
      });
      const response = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("No se pudo subir la imagen");
      // `imageKey` es el valor de antes de esta carga: con él se sabe si la
      // clave cambió o si se reemplazó el objeto dejando la misma.
      const mismaClave = presigned.key === imageKey;
      onUploaded(presigned.key);
      setUploads((count) => count + 1);

      // La imagen ya está en el bucket, así que un fallo al invalidar no
      // convierte la carga en fallida: se dice lo que pasó y nada más. Se
      // invalida también una clave nueva, porque el CDN pudo cachear el 403
      // de cuando el objeto no existía.
      let invalidada = true;
      try {
        await adminApi.invalidateImage(presigned.key);
      } catch {
        invalidada = false;
      }

      setStatus(
        !mismaClave
          ? "Imagen cargada. Se aplicará al guardar."
          : invalidada
            ? "Imagen reemplazada y caché del CDN invalidada: puede tardar unos segundos en verse. " +
              "Al guardar queda constancia del cambio."
            : "Imagen reemplazada en el bucket, pero no se pudo invalidar la caché del CDN: " +
              "hasta que caduque se seguirá viendo la anterior. Al guardar queda constancia del cambio.",
      );
    } catch (cause) {
      fail(errorMessage(cause, "No se pudo subir la imagen"));
    } finally {
      setPending(false);
    }
  }

  if (!entityId) {
    return (
      <div className="space-y-2">
        <span className="block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted">
          {label}
        </span>
        <p className="text-xs text-muted">
          La imagen se sube después de crear: guardar y volver a editar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted">
        {label}
      </label>

      <div className="flex items-start gap-3">
        <ImagePreview key={`${imageKey ?? "sin-imagen"}-${uploads}`} imageKey={imageKey} label={label} version={uploads} />
        <div className="space-y-2">
          <input
            id={inputId}
            type="file"
            accept="image/webp,image/jpeg,image/png"
            disabled={pending}
            aria-describedby={`${inputId}-hint`}
            onChange={(event) => {
              // El valor se limpia para que elegir el mismo archivo otra vez
              // vuelva a disparar `change` y no quede un reenvío pendiente.
              const input = event.currentTarget;
              void upload(input.files?.[0]).finally(() => {
                input.value = "";
              });
            }}
          />
          <p id={`${inputId}-hint`} className="text-xs text-muted">
            WEBP, JPEG o PNG. Máximo 5 MB.
            {imageKey ? ` Subir otra la reemplaza. Clave: ${imageKey}` : ""}
          </p>
          {onClear && imageKey && (
            <button
              type="button"
              className="font-display text-xs font-bold uppercase tracking-[0.04em] text-muted underline hover:text-foreground"
              disabled={pending}
              onClick={() => {
                setError(null);
                setStatus(null);
                onError?.(null);
                onClear();
              }}
            >
              Quitar imagen
            </button>
          )}
        </div>
      </div>

      {pending && <p role="status" className="text-sm text-muted">Subiendo imagen…</p>}
      {error && <FormError>{error}</FormError>}
      {status && <FormStatus>{status}</FormStatus>}
    </div>
  );
}

/**
 * Vista previa por CloudFront. El bucket es privado y la distribución responde
 * `403` a una clave que no existe, así que un fallo de carga es información
 * útil: se muestra el hueco en lugar de una imagen rota.
 */
function ImagePreview({
  imageKey,
  label,
  version,
}: {
  imageKey: string | null;
  label: string;
  /** Cambia con cada carga para saltarse la caché del navegador. */
  version: number;
}) {
  const key = cdnImageUrl(imageKey);
  const url = key && version > 0 ? `${key}?v=${version}` : key;
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center border-2 border-muted bg-surface rounded-vp text-center"
        role="img"
        aria-label={`${label} - ${imageKey && !url ? "sin dominio de CDN" : "sin imagen"}`}
      >
        <span className="vp-label text-[0.6rem] text-muted">
          {imageKey ? "NO CARGA" : "SIN IMAGEN"}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={label}
      width={80}
      height={80}
      unoptimized
      onError={() => setFailed(true)}
      className="h-20 w-20 shrink-0 border-2 border-muted bg-background object-cover rounded-vp"
    />
  );
}
