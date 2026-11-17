"use client";

import { useCallback, useState } from "react";
import { useAdminSession } from "@/components/admin/admin-shell";
import { FormError, FormStatus } from "@/components/admin/form";
import { EmptyState, ScreenHeader } from "@/components/admin/screen";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { AdminApiError, adminApi } from "@/lib/admin-api";
import type { AdminRole, AdminUserRow } from "@/types/admin";

/**
 * Usuarios de la consola (decisión #6 del plan: habrá operadores).
 *
 * Solo el dueño entra aquí; el backend responde 403 a cualquier otro rol, así
 * que la comprobación de esta pantalla es de navegación, no la defensa.
 *
 * - **Invitar**: Cognito envía la contraseña temporal por correo (vence en 3
 *   días) y la persona define la suya —y su verificación en dos pasos— al
 *   entrar por primera vez.
 * - **Desactivar**: corta el acceso al instante (la base es lo que se consulta
 *   en cada petición), revoca sus sesiones y deshabilita la cuenta en Cognito.
 *   No se deshace desde aquí: para devolver el acceso se vuelve a invitar con
 *   otro correo o se reactiva a mano en el pool.
 *
 * Los permisos de cada rol no se cambian aquí: el operador opera el inventario
 * diario y las imágenes; precios, publicación y catálogo siguen siendo del dueño.
 */

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Dueño",
  operator: "Operador",
};

function describe(cause: unknown, fallback: string): string {
  if (cause instanceof AdminApiError) return cause.fields?.[0]?.message ?? cause.message;
  return fallback;
}

export default function UsersPage() {
  const { identity } = useAdminSession();
  const isOwner = identity.role === "owner";

  // Un objeto nuevo es una recarga (ver `useAdminQuery`).
  const [query, setQuery] = useState({});
  // Al operador no se le pide nada: el backend le respondería 403.
  const fetchUsers = useCallback(
    () => (isOwner ? adminApi.users() : Promise.resolve([] as AdminUserRow[])),
    [isOwner],
  );
  const { data: users, error: loadError, loading, patch } = useAdminQuery(
    query,
    fetchUsers,
    "No se pudieron cargar los usuarios",
  );
  const reload = () => setQuery({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("operator");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setInviting(true);
    setInviteError(null);
    setStatus(null);
    try {
      const created = await adminApi.inviteUser(email.trim(), role);
      patch((current) => [...current, created].sort((a, b) => a.email.localeCompare(b.email)));
      setStatus(`Invitación enviada a ${created.email}. La contraseña temporal vence en 3 días.`);
      setEmail("");
      setRole("operator");
    } catch (cause) {
      setInviteError(describe(cause, "No se pudo enviar la invitación"));
    } finally {
      setInviting(false);
    }
  }

  async function deactivate(user: AdminUserRow) {
    setDeactivating(user.id);
    setError(null);
    setStatus(null);
    try {
      const updated = await adminApi.deactivateUser(user.id);
      patch((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setStatus(`${updated.email} ya no tiene acceso a la consola.`);
    } catch (cause) {
      setError(describe(cause, "No se pudo desactivar la cuenta"));
    } finally {
      setDeactivating(null);
      setConfirming(null);
    }
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Usuarios" description="Quién entra a la consola." />
        <EmptyState>Solo el dueño gestiona los usuarios de la consola.</EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Usuarios"
        description="Quién entra a la consola. El operador registra el inventario diario y las imágenes; precios, publicación y catálogo siguen siendo tuyos."
      >
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      <Surface border="accent" className="space-y-4 p-4">
        <h2 className="font-display text-lg font-bold uppercase tracking-[0.02em]">Invitar</h2>
        <form className="flex flex-wrap items-end gap-4" onSubmit={invite} noValidate>
          <div className="min-w-0 flex-1 basis-64">
            <label
              htmlFor="invite-email"
              className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
            >
              Correo
            </label>
            <TextField
              id="invite-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={inviteError ? "invite-error" : undefined}
            />
          </div>
          <div>
            <label
              htmlFor="invite-role"
              className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
            >
              Rol
            </label>
            <SelectField
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as AdminRole)}
            >
              <option value="operator">Operador</option>
              <option value="owner">Dueño</option>
            </SelectField>
          </div>
          <Button type="submit" disabled={inviting || email.trim() === ""}>
            {inviting ? "Enviando…" : "Enviar invitación"}
          </Button>
        </form>
        {role === "owner" && (
          <p className="text-sm text-muted">
            Un dueño puede cambiar precios, publicar e invitar o desactivar a otros usuarios.
          </p>
        )}
        {inviteError && (
          <div id="invite-error">
            <FormError>{inviteError}</FormError>
          </div>
        )}
      </Surface>

      {(error ?? loadError) && <FormError>{error ?? loadError}</FormError>}
      {status && <FormStatus>{status}</FormStatus>}

      {users && users.length === 0 ? (
        <EmptyState>No hay cuentas todavía.</EmptyState>
      ) : (
        <Surface border="muted" className="divide-y-2 divide-muted">
          {(users ?? []).map((user) => {
            const self = user.id === identity.userId;
            return (
              <div key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="break-all text-sm text-foreground">
                    {user.email}
                    {self && <span className="ml-2 text-muted">(tú)</span>}
                  </p>
                </div>
                <PixelLabel variant={user.role === "owner" ? "lime" : "outline"}>
                  {ROLE_LABEL[user.role].toUpperCase()}
                </PixelLabel>
                {!user.active && <PixelLabel variant="outline">INACTIVO</PixelLabel>}
                <div className="ms-auto flex items-center gap-2">
                  {user.active && !self && confirming !== user.id && (
                    <Button variant="ghost" onClick={() => setConfirming(user.id)}>
                      Desactivar
                    </Button>
                  )}
                  {confirming === user.id && (
                    <>
                      <span className="text-sm text-foreground">¿Quitarle el acceso?</span>
                      <Button
                        onClick={() => void deactivate(user)}
                        disabled={deactivating === user.id}
                      >
                        {deactivating === user.id ? "Desactivando…" : "Sí, desactivar"}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(null)}>
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {!users && loading && <p className="p-4 text-sm text-muted">Cargando…</p>}
        </Surface>
      )}
    </div>
  );
}
