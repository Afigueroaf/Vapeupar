"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { adminApi, isUnauthorized } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import type { AdminIdentity } from "@/types/admin";

/**
 * Armazón de la consola y **puerta de sesión** (plan A5.1).
 *
 * El plan preveía un `proxy.ts` de Next (antes `middleware.ts`) que redirigiera
 * sin sesión, pero no es posible: las cookies de sesión son `httpOnly` con
 * `Path=/api/admin` sobre el origen del backend (A4.1), de modo que el servidor
 * de Next no las recibe nunca y no puede saber si hay sesión. Así que la puerta
 * es esta: una llamada a `GET /api/admin/me` al montar, y `/admin/login` si
 * responde 401.
 *
 * No es la defensa, es la navegación. La defensa está en el backend, que exige
 * sesión en cada petición: estas pantallas no traen ningún dato sin ella.
 */

interface AdminSession {
  identity: AdminIdentity;
  signOut: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext);
  if (!session) throw new Error("useAdminSession necesita <AdminShell> por encima");
  return session;
}

const NAV = [{ href: "/admin/stock", label: "Inventario" }];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    adminApi.me().then(
      (me) => {
        if (alive) setIdentity(me);
      },
      (cause: unknown) => {
        if (!alive) return;
        // 401 es «no hay sesión», que no es un error que mostrar: es un login.
        if (isUnauthorized(cause)) {
          router.replace("/admin/login");
          return;
        }
        setError(cause instanceof Error ? cause.message : "No se pudo comprobar la sesión");
      },
    );
    return () => {
      alive = false;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    try {
      await adminApi.logout();
    } finally {
      // Aunque el backend falle, aquí ya no se sigue: las cookies las borra él
      // en cualquiera de los dos caminos de `logout`.
      router.replace("/admin/login");
    }
  }, [router]);

  if (error) {
    return (
      <CenteredPanel title="Sesión no disponible">
        <p className="text-sm text-muted">{error}</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
      </CenteredPanel>
    );
  }

  if (!identity) {
    return (
      <CenteredPanel title="Comprobando sesión">
        <p className="text-sm text-muted">Un momento.</p>
      </CenteredPanel>
    );
  }

  return (
    <AdminSessionContext.Provider value={{ identity, signOut }}>
      <header className="border-b-2 border-muted">
        <div className="mx-auto flex w-full max-w-vp flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/admin/stock" className="flex items-center gap-3">
            <Image
              src="/logo-detalle.svg"
              alt="Vapeupar"
              width={1860}
              height={926}
              priority
              className="h-7 w-auto"
            />
            <PixelLabel variant="outline">CONSOLA</PixelLabel>
          </Link>

          <nav aria-label="Secciones de la consola" className="flex items-center gap-1">
            {NAV.map((item) => {
              const current = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "min-h-[44px] border-2 px-3 py-2 font-display text-sm font-bold uppercase tracking-[0.02em]",
                    "rounded-vp transition-colors duration-150 ease-vp",
                    current
                      ? "border-action text-action"
                      : "border-transparent text-muted hover:border-line hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              {identity.email}
              <span className="ml-2 text-foreground">({identity.role})</span>
            </span>
            <Button variant="secondary" className="px-3" onClick={signOut}>
              <LogOut className="size-4" aria-hidden="true" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-vp flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </AdminSessionContext.Provider>
  );
}

/** Estados de la puerta: comprobando y error. Centrados, sin armazón. */
function CenteredPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Surface border="line" className="w-full max-w-md space-y-4 p-6">
        <h1 className="font-display text-xl font-bold uppercase tracking-[0.02em]">{title}</h1>
        {children}
      </Surface>
    </main>
  );
}
