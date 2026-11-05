"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { adminApi, errorMessage } from "@/lib/admin-api";
import { formatDateTimeCO } from "@/lib/utils";
import type { InventoryNote, StockRow } from "@/types/admin";
import { FormError, FormStatus, Labelled } from "./form";
import { useAdminQuery } from "./use-admin-query";

/**
 * Anotaciones de inventario: lo que hay que recordar de una variante o del
 * inventario en general, con autor, fecha y estado.
 *
 * Crear y resolver es de `owner`; leer, de cualquier sesión. La lectura va por
 * `useAdminQuery` para no escribir estado dentro del efecto, igual que el resto
 * de la consola.
 */
interface Filters {
  resolved: boolean;
}

/** «General», o la variante con su línea tal como las devolvió el backend. */
function noteTarget(note: InventoryNote): string {
  if (!note.variantId) return "General";
  if (!note.variantName) return "Variante retirada";
  return note.productName ? `${note.productName} · ${note.variantName}` : note.variantName;
}

export function InventoryNotes({ rows, canWrite }: { rows: StockRow[]; canWrite: boolean }) {
  const [filters, setFilters] = useState<Filters>({ resolved: false });
  const [text, setText] = useState("");
  const [variantId, setVariantId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const fetchNotes = useCallback(
    (current: Filters) => adminApi.inventoryNotes({ resolved: current.resolved }),
    [],
  );

  const { data, error: loadError, loading, patch } = useAdminQuery(
    filters,
    fetchNotes,
    "No se pudieron cargar las anotaciones",
  );

  const showResolved = filters.resolved;
  const notes = data ?? [];

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    if (!text.trim()) {
      setError("Escribe una anotación");
      return;
    }
    setPending(true);
    try {
      const note = await adminApi.createInventoryNote({
        text: text.trim(),
        variantId: variantId || null,
      });
      // Nace pendiente: solo aparece si es la lista que se está viendo.
      if (!showResolved) patch((current) => [note, ...current]);
      setText("");
      setVariantId("");
      setStatus("Anotación agregada.");
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo agregar la anotación"));
    } finally {
      setPending(false);
    }
  }

  async function resolve(note: InventoryNote) {
    setError(null);
    setStatus(null);
    setPending(true);
    try {
      await adminApi.resolveInventoryNote(note.id);
      patch((current) => current.filter((item) => item.id !== note.id));
      setStatus("Anotación resuelta.");
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo resolver la anotación"));
    } finally {
      setPending(false);
    }
  }

  // El selector solo ofrece lo que hay a la vista; el nombre de una nota ya
  // viaja con ella, así que una variante de otra página también se lee bien.
  const variants = new Map(
    rows.map((row) => [row.variantId, `${row.productName} · ${row.variantName}`]),
  );

  return (
    <div className="space-y-5">
      {canWrite && (
        <form
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={create}
          noValidate
        >
          <Labelled label="Variante (opcional)" htmlFor="inventory-note-variant">
            <SelectField
              id="inventory-note-variant"
              value={variantId}
              disabled={pending}
              onChange={(event) => setVariantId(event.target.value)}
            >
              <option value="">Anotación general</option>
              {[...variants].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </SelectField>
          </Labelled>
          <Labelled label="Anotación" htmlFor="inventory-note-text">
            <TextAreaField
              id="inventory-note-text"
              rows={1}
              maxLength={4000}
              disabled={pending}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Labelled>
          <Button type="submit" className="self-end" disabled={pending}>
            {pending ? "Guardando…" : "Agregar"}
          </Button>
        </form>
      )}

      <div className="flex gap-3" role="group" aria-label="Estado de anotaciones">
        <Button
          variant={showResolved ? "ghost" : "secondary"}
          onClick={() => setFilters({ resolved: false })}
        >
          Pendientes
        </Button>
        <Button
          variant={showResolved ? "secondary" : "ghost"}
          onClick={() => setFilters({ resolved: true })}
        >
          Resueltas
        </Button>
      </div>

      {(loadError ?? error) && <FormError>{loadError ?? error}</FormError>}
      {status && <FormStatus>{status}</FormStatus>}

      {loading ? (
        <p className="text-sm text-muted">Cargando anotaciones…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted">
          No hay anotaciones {showResolved ? "resueltas" : "pendientes"}.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="border-2 border-muted p-3">
              <p className="whitespace-pre-line text-sm">{note.text}</p>
              <p className="mt-2 text-xs text-muted">
                {noteTarget(note)} · {note.authorEmail} · {formatDateTimeCO(note.createdAt)}
              </p>
              {!note.resolved && canWrite && (
                <Button
                  variant="ghost"
                  className="mt-2"
                  disabled={pending}
                  onClick={() => void resolve(note)}
                >
                  Resolver
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
