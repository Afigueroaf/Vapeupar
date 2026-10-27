"use client";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { formatNumberCO } from "@/lib/utils";
import type { Pagination } from "@/types/admin";

/**
 * Cabecera, paginación y vacíos: lo que todas las pantallas de la consola
 * repiten (plan A5).
 *
 * El botón de la cabecera es `secondary` a propósito: el `primary` de la vista
 * está reservado al envío del formulario que esté abierto, y el sistema admite
 * uno solo por vista.
 */
export function ScreenHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.02em]">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

/** Mensaje cuando no hay nada que listar, que no es lo mismo que un error. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Surface border="muted" className="p-6">
      <p className="text-sm text-muted">{children}</p>
    </Surface>
  );
}

/** Paginación. Se oculta sola cuando hay una sola página. */
export function Pager({
  pagination,
  loading,
  noun,
  onPage,
}: {
  pagination: Pagination | null;
  loading: boolean;
  /** Lo que se está contando, en plural: «marcas», «líneas». */
  noun: string;
  onPage: (step: number) => void;
}) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-4">
      <Button
        variant="secondary"
        disabled={pagination.page <= 1 || loading}
        onClick={() => onPage(-1)}
      >
        Anterior
      </Button>
      <p className="text-sm text-muted">
        Página {pagination.page} de {pagination.totalPages} ·{" "}
        {formatNumberCO(pagination.total)} {noun}
      </p>
      <Button
        variant="secondary"
        disabled={pagination.page >= pagination.totalPages || loading}
        onClick={() => onPage(1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}
