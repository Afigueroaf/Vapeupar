"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/admin-api";
import type { ImageUploadTarget } from "@/types/admin";
import { FormError, FormStatus } from "./form";
import { ImageUploadField } from "./image-upload-field";

/**
 * Panel de solo imagen: lo que ve un `operator` donde el `owner` tiene el
 * formulario completo (§4.5 del traspaso de imágenes 2026-10-27).
 *
 * El PATCH lleva un único campo, que es justo lo que el backend le permite
 * escribir: cualquier otro campo en la misma petición se rechaza entera.
 */
interface ImageOnlyFormProps {
  label: string;
  target: ImageUploadTarget;
  entityId: string;
  imageKey: string | null;
  /** Guarda la clave —o `null` para quitarla— con el PATCH de su entidad. */
  save: (imageKey: string | null) => Promise<void>;
  onCancel: () => void;
}

export function ImageOnlyForm({
  label,
  target,
  entityId,
  imageKey,
  save,
  onCancel,
}: ImageOnlyFormProps) {
  const [key, setKey] = useState<string | null>(imageKey);
  /**
   * Una carga cuenta como cambio aunque la clave sea la misma, que es lo que
   * pasa al reemplazar la imagen de una entidad que ya tenía una: la clave se
   * deriva de la entidad, no del archivo.
   */
  const [uploaded, setUploaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const changed = uploaded || (key ?? "") !== (imageKey ?? "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    if (!changed) {
      setError("No hay ningún cambio que guardar");
      return;
    }
    setPending(true);
    try {
      await save(key || null);
      setUploaded(false);
      setStatus("Imagen guardada.");
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar la imagen"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <ImageUploadField
        label={label}
        target={target}
        entityId={entityId}
        imageKey={key}
        onUploaded={(uploadedKey) => {
          setKey(uploadedKey);
          setUploaded(true);
        }}
        onClear={() => setKey("")}
        onError={setError}
      />

      <p className="text-xs text-muted">
        Con rol operador solo se puede cambiar la imagen; el resto de los datos
        los edita un dueño.
      </p>

      {error && <FormError>{error}</FormError>}
      {status && <FormStatus>{status}</FormStatus>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || !changed}>
          {pending ? "Guardando…" : "Guardar imagen"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}
