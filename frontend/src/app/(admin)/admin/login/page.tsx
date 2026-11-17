"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { AdminApiError, LoginStep, adminApi } from "@/lib/admin-api";

/**
 * Acceso a la consola (plan A4.1 / A5.1).
 *
 * Aquí no se guarda ningún token: el backend responde con cookies `httpOnly`
 * que este JavaScript no puede leer. Por eso tampoco hay nada que limpiar al
 * salir y la única señal de que la sesión existe es que `GET /me` responda.
 *
 * Fases, según lo que pida el backend:
 * - `new-password`: la invitación llega con contraseña temporal.
 * - `mfa`: la cuenta tiene verificación en dos pasos; se pide el código.
 * - `mfa-setup`: en producción toda cuenta necesita TOTP; la primera vez se
 *   enseña el QR (y el secreto, para escribirlo a mano) y se pide el primer
 *   código.
 * Los retos quedan en cookies del backend: aquí solo se cambia de formulario.
 */

/** Mínimo del pool de Cognito (`passwordPolicy.minLength`). La valida él. */
const MIN_PASSWORD = 12;

type Phase = "credentials" | "new-password" | "mfa" | "mfa-setup";

export default function AdminLoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
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

  /** Lleva a la fase que pide el backend, o a la consola si ya hay sesión. */
  function follow(step: LoginStep) {
    setCode("");
    switch (step.status) {
      case "authenticated":
        router.replace("/admin/stock");
        return;
      case "new_password_required":
        setPhase("new-password");
        setPassword("");
        setNotice("La contraseña de la invitación es temporal. Define una nueva para entrar.");
        return;
      case "mfa_required":
        setPhase("mfa");
        setNotice(null);
        return;
      case "mfa_setup":
        setSetup({ secret: step.secret, otpauthUri: step.otpauthUri });
        setPhase("mfa-setup");
        setNotice("La consola exige verificación en dos pasos. Configúrala una vez y luego te pedirá un código al entrar.");
        return;
      case "mfa_enrolled":
        setPhase("credentials");
        setPassword("");
        setSetup(null);
        setNotice("Verificación en dos pasos activada. Vuelve a entrar con tu contraseña y el código.");
        return;
    }
  }

  async function run(action: () => Promise<LoginStep>) {
    setPending(true);
    setError(null);
    try {
      follow(await action());
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setPending(false);
    }
  }

  function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    void run(() => adminApi.login(email, password));
  }

  function submitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (password !== repeated) {
      setError("Las dos contraseñas no coinciden");
      return;
    }
    void run(() => adminApi.completeNewPassword(email, password));
  }

  function submitCode(event: React.FormEvent) {
    event.preventDefault();
    void run(() => adminApi.verifyMfa(email, code));
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

        {phase === "credentials" && (
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
        )}

        {phase === "new-password" && (
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

        {(phase === "mfa" || phase === "mfa-setup") && (
          <form className="space-y-5" onSubmit={submitCode} noValidate>
            <p className="text-sm text-muted">
              Cuenta: <span className="text-foreground">{email}</span>
            </p>

            {phase === "mfa-setup" && setup && <TotpSetup secret={setup.secret} otpauthUri={setup.otpauthUri} />}

            <div className="space-y-2">
              <label htmlFor="mfa-code" className="block font-display text-sm font-bold uppercase tracking-[0.02em]">
                {phase === "mfa-setup" ? "Primer código de la app" : "Código de verificación"}
              </label>
              <TextField
                id="mfa-code"
                name="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                required
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-describedby={error ? "login-error" : "mfa-hint"}
              />
              <p id="mfa-hint" className="text-xs text-muted">
                Los 6 dígitos que muestra tu app autenticadora. Cambian cada 30 segundos.
              </p>
            </div>

            <ErrorLine id="login-error" message={error} />

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Comprobando…" : phase === "mfa-setup" ? "Activar y entrar" : "Entrar"}
            </Button>
          </form>
        )}
      </Surface>
    </main>
  );
}

/**
 * QR del secreto TOTP para escanearlo con la app (Google Authenticator, 1Password,
 * Authy…). El QR se genera aquí, en el navegador: el secreto no sale a ningún
 * servicio de terceros. Debajo va el secreto en texto por si no se puede escanear.
 */
function TotpSetup({ secret, otpauthUri }: { secret: string; otpauthUri: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(otpauthUri, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUri]);

  const grouped = secret.replace(/(.{4})/g, "$1 ").trim();

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground">
        1. Escanea este código con tu app autenticadora.
      </p>
      {svg ? (
        <div
          role="img"
          aria-label="Código QR para configurar la verificación en dos pasos"
          className="w-48 max-w-full bg-white p-2"
          // SVG generado en el navegador por `qrcode` a partir del URI del backend.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <p className="text-xs text-muted">Generando el código QR…</p>
      )}
      <p className="text-sm text-foreground">
        ¿No puedes escanearlo? Escribe esta clave en la app:
      </p>
      <code className="block select-all break-all border-2 border-line px-3 py-2 font-mono text-sm">
        {grouped}
      </code>
      <p className="text-sm text-foreground">2. Escribe el código de 6 dígitos que aparece.</p>
    </div>
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
