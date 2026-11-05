"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { AdminApiError, adminApi } from "@/lib/admin-api";

/**
 * Acceso a la consola (plan A4.1 / A5.1).
 *
 * Aquí no se guarda ningún token: el backend responde con cookies `httpOnly`
 * que este JavaScript no puede leer. Por eso tampoco hay nada que limpiar al
 * salir y la única señal de que la sesión existe es que `GET /me` responda.
 *
 * Dos fases, porque la invitación llega con contraseña temporal: si el login
 * devuelve `new_password_required`, el reto queda en una cookie del backend y
 * aquí solo se pide la contraseña nueva.
 */

/** Mínimo del pool de Cognito (`passwordPolicy.minLength`). La valida él. */
const MIN_PASSWORD = 12;

type Phase = "credentials" | "new-password";

export default function AdminLoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function describe(cause: unknown): string {
    if (cause instanceof AdminApiError) {
      // Un 400 de validación trae el detalle campo a campo.
      const field = cause.fields?.[0];
      return field ? `${field.message}` : cause.message;
    }
    return "No se pudo completar la operación";
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await adminApi.login(email, password);
      if (result.status === "new_password_required") {
        setPhase("new-password");
        setPassword("");
        setNotice("La contraseña de la invitación es temporal. Define una nueva para entrar.");
        return;
      }
      router.replace("/admin/stock");
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setPending(false);
    }
  }

  async function submitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (password !== repeated) {
      setError("Las dos contraseñas no coinciden");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await adminApi.completeNewPassword(email, password);
      router.replace("/admin/stock");
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Surface border="line" offset className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-8 flex flex-col items-start gap-4">
          <Image
            src="/logo-detalle.svg"
            alt="Vapeupar"
            width={1319}
            height={786}
            priority
            className="h-9 w-auto"
          />
          <PixelLabel variant="lime">ACCESO</PixelLabel>
        </div>

        {notice && (
          <p className="mb-6 border-2 border-accent px-3 py-2 text-sm text-foreground">{notice}</p>
        )}

        {phase === "credentials" ? (
          <form className="space-y-5" onSubmit={submitCredentials} noValidate>
            <div className="space-y-2">
              <label htmlFor="email" className="block font-display text-sm font-bold uppercase tracking-[0.02em]">
                Correo
              </label>
              <TextField
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block font-display text-sm font-bold uppercase tracking-[0.02em]">
                Contraseña
              </label>
              <TextField
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            <ErrorLine id="login-error" message={error} />

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        ) : (
          <form className="space-y-5" onSubmit={submitNewPassword} noValidate>
            <p className="text-sm text-muted">
              Cuenta: <span className="text-foreground">{email}</span>
            </p>

            <div className="space-y-2">
              <label htmlFor="new-password" className="block font-display text-sm font-bold uppercase tracking-[0.02em]">
                Contraseña nueva
              </label>
              <TextField
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted">
                Mínimo {MIN_PASSWORD} caracteres, con mayúscula, minúscula y número.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="repeat-password" className="block font-display text-sm font-bold uppercase tracking-[0.02em]">
                Repetir contraseña
              </label>
              <TextField
                id="repeat-password"
                name="repeat-password"
                type="password"
                autoComplete="new-password"
                required
                value={repeated}
                onChange={(event) => setRepeated(event.target.value)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            <ErrorLine id="login-error" message={error} />

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Guardando…" : "Guardar y entrar"}
            </Button>
          </form>
        )}
      </Surface>
    </main>
  );
}

/** El mensaje de error se anuncia al lector de pantalla en cuanto aparece. */
function ErrorLine({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="border-2 border-action px-3 py-2 text-sm text-foreground">
      {message}
    </p>
  );
}
