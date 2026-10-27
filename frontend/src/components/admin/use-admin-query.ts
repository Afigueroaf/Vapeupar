"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/admin-api";

/**
 * Una lectura de `/api/admin` con su estado, como lo necesitan las pantallas
 * de la consola (plan A5).
 *
 * El estado de carga **se deriva**: se guarda con qué filtros se resolvió la
 * última respuesta y «cargando» es que esos no sean los vigentes. React 19
 * rechaza —con razón— escribir `setState` dentro del efecto que pide los
 * datos, y esta es la forma de no necesitarlo. Recargar a mano es crear un
 * objeto de filtros nuevo, sin ninguna bandera extra.
 *
 * Lo cargado y lo fallido son dos estados distintos a propósito: así un error
 * no borra de la pantalla las filas que ya se veían.
 */
export interface AdminQuery<T> {
  /** Lo último que se cargó bien, aunque ahora mismo haya un error encima. */
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Retoca lo cargado sin volver a pedirlo (tras guardar, por ejemplo). */
  patch: (update: (data: T) => T) => void;
}

/**
 * @param filters Identidad de la consulta. Un objeto nuevo es una consulta
 *   nueva, así que recargar es `setFilters(current => ({ ...current }))`.
 * @param fetcher Tiene que ser estable (`useCallback`): es dependencia del
 *   efecto.
 */
export function useAdminQuery<F, T>(
  filters: F,
  fetcher: (filters: F) => Promise<T>,
  fallback: string,
): AdminQuery<T> {
  const [loaded, setLoaded] = useState<{ filters: F; data: T } | null>(null);
  const [failed, setFailed] = useState<{ filters: F; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetcher(filters).then(
      (data) => {
        if (alive) setLoaded({ filters, data });
      },
      (cause: unknown) => {
        // La sesión caducada la resuelve la puerta de `AdminShell` al recargar;
        // aquí solo se dice lo que pasó.
        if (alive) setFailed({ filters, message: errorMessage(cause, fallback) });
      },
    );
    return () => {
      alive = false;
    };
  }, [filters, fetcher, fallback]);

  const patch = useCallback((update: (data: T) => T) => {
    setLoaded((current) => (current ? { ...current, data: update(current.data) } : current));
  }, []);

  return {
    data: loaded?.data ?? null,
    error: failed?.filters === filters ? failed.message : null,
    loading: loaded?.filters !== filters && failed?.filters !== filters,
    patch,
  };
}
