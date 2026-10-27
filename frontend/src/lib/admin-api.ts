import type {
  AdminIdentity,
  Kardex,
  MovementResult,
  PagedResponse,
  StockMovementType,
  StockRow,
  SupplierRow,
} from "@/types/admin";

/**
 * Cliente de `/api/admin` (plan A5.1).
 *
 * **Las peticiones salen del navegador, no del servidor de Next.** La sesión
 * vive en cookies `httpOnly` con `Path=/api/admin` puestas por el backend
 * (A4.1), así que el navegador solo las manda a esas rutas de ese origen: el
 * servidor de Next nunca las ve y no podría reenviar lo que no recibe. De ahí
 * `credentials: "include"` y el CORS propio del admin con origen explícito.
 *
 * Nada de tokens en `localStorage`: no hay token que guardar. Cerrar sesión es
 * una llamada al backend, no borrar algo del cliente.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/** Error con el código de dominio del backend, para decidir el mensaje. */
export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** `INSUFFICIENT_STOCK`, `NOT_PUBLISHABLE`... */
    public readonly code?: string,
    /** Campos que el backend señaló como inválidos. */
    public readonly fields?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

/** `true` si el error es «no hay sesión»: quien lo reciba redirige al login. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 401;
}

interface ApiEnvelope {
  /** Opcional porque una respuesta puede no venir en JSON (429 del limitador). */
  success?: boolean;
  message?: string;
  code?: string;
  errors?: { field: string; message: string }[];
  data?: unknown;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/admin${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    // Backend apagado, DNS, CORS: nada de esto tiene código HTTP.
    throw new AdminApiError(0, "No se pudo contactar con el servidor");
  }

  const text = await response.text();
  let body: ApiEnvelope = {};
  try {
    body = text ? (JSON.parse(text) as ApiEnvelope) : {};
  } catch {
    // Un 429 del limitador o un 502 del proxy pueden no venir en JSON.
    if (!response.ok) throw new AdminApiError(response.status, text || response.statusText);
  }

  if (!response.ok || body.success === false) {
    throw new AdminApiError(
      response.status,
      body.message ?? "La operación no se pudo completar",
      body.code,
      body.errors,
    );
  }

  return body as T;
}

export interface StockQuery {
  q?: string;
  lowStock?: boolean;
  threshold?: number;
  page?: number;
  limit?: number;
}

function toSearchParams(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export interface MovementInput {
  variantId: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  supplierId?: string;
  unitCost?: number;
  lot?: string;
  /** La genera el cliente, una por intento: hace seguro el reintento. */
  operationKey: string;
}

export const adminApi = {
  /** Identidad de la sesión. `401` si no hay. */
  async me(): Promise<AdminIdentity> {
    const body = await request<{ data: AdminIdentity }>("/me");
    return body.data;
  },

  /**
   * Abre sesión. Con la contraseña temporal de la invitación no la abre:
   * devuelve `new_password_required` y deja el reto en una cookie, así que el
   * siguiente paso es `completeNewPassword` con el mismo correo.
   */
  async login(email: string, password: string): Promise<
    { status: "authenticated"; email: string; role: string } | { status: "new_password_required" }
  > {
    const body = await request<{ data: { status?: string; email?: string; role?: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    );
    if (body.data.status === "new_password_required") return { status: "new_password_required" };
    return { status: "authenticated", email: body.data.email ?? email, role: body.data.role ?? "operator" };
  },

  async completeNewPassword(email: string, password: string): Promise<void> {
    await request("/auth/new-password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async logout(): Promise<void> {
    await request("/auth/logout", { method: "POST" });
  },

  /** Inventario paginado, ordenado por disponible ascendente. */
  stock(query: StockQuery = {}): Promise<PagedResponse<StockRow> & { meta?: { threshold?: number } }> {
    return request(`/stock${toSearchParams({ ...query })}`);
  },

  async movement(input: MovementInput): Promise<MovementResult> {
    const body = await request<{ data: MovementResult }>("/stock/movements", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.data;
  },

  async kardex(variantId: string, range: { from?: string; to?: string } = {}): Promise<Kardex> {
    const body = await request<{ data: Kardex }>(
      `/stock/${variantId}/kardex${toSearchParams({ ...range })}`,
    );
    return body.data;
  },

  /** Para el selector de proveedor del formulario de ingreso. */
  async suppliers(): Promise<SupplierRow[]> {
    const body = await request<PagedResponse<SupplierRow>>(
      `/suppliers${toSearchParams({ active: true, limit: 100 })}`,
    );
    return body.data;
  },
};
