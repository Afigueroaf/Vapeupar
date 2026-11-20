import type { ContentKey } from "@/lib/content/schemas";
import type { ProductCategory } from "@/types/product";
import type {
  AdminRole,
  AdminUserRow,
  AdminIdentity,
  AdminProductDetail,
  AdminProductRow,
  AdminVariantRow,
  BrandInput,
  BrandRow,
  CdnInvalidation,
  ContentPublishResult,
  ContentVersionRow,
  Kardex,
  InventoryNote,
  ImageUploadTarget,
  MovementResult,
  Order,
  OrderLineIssue,
  OrderStatus,
  OrderTransition,
  PagedResponse,
  ProductInput,
  ProductStatus,
  PresignedUpload,
  Readiness,
  StockMovementType,
  StockRow,
  SupplierDetail,
  SupplierInput,
  SupplierRow,
  VariantInput,
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
    /** En un `NOT_PUBLISHABLE`: qué le falta a la línea para publicarse. */
    public readonly missing?: string[],
    /** En un `409` de pedidos: qué líneas fallan y por qué. */
    public readonly lines?: OrderLineIssue[],
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

/**
 * Mensaje para la pantalla. El primer campo inválido dice más que el mensaje
 * general («Marca inválida» vs. «slug: va en minúsculas»), y la sesión
 * caducada se nombra aparte porque la resuelve `AdminShell` al recargar.
 */
export function errorMessage(cause: unknown, fallback: string): string {
  if (isUnauthorized(cause)) return "La sesión caducó. Vuelve a entrar.";
  if (cause instanceof AdminApiError) {
    if (cause.status === 403) return "Esta acción es solo para el dueño de la cuenta.";
    const field = cause.fields?.[0];
    return field ? `${field.field}: ${field.message}` : cause.message;
  }
  return cause instanceof Error ? cause.message : fallback;
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
  missing?: string[];
  lines?: OrderLineIssue[];
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
      body.missing,
      Array.isArray(body.lines) ? body.lines : undefined,
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

export interface OrderQuery {
  status?: OrderStatus;
  /** Referencia, nombre o teléfono (3 cifras o más). */
  q?: string;
  /** `YYYY-MM-DD` o ISO 8601. */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ConfirmOrderInput {
  /** Domicilio cobrado; 0 si se recoge o va incluido. */
  deliveryFee: number;
  /** Solo las líneas con otro precio que el de catálogo, y solo el owner. */
  lines?: { variantId: string; unitPrice: number }[];
}

type TransitionBody = { data: Order; meta?: { replayed?: boolean; revalidated?: boolean } };

function toTransition(body: TransitionBody): OrderTransition {
  return {
    order: body.data,
    replayed: body.meta?.replayed === true,
    revalidated: body.meta?.revalidated === true,
  };
}

export interface InventoryNotesQuery {
  variantId?: string;
  resolved?: boolean;
}

export interface BrandQuery {
  q?: string;
  active?: boolean;
  isPartner?: boolean;
  page?: number;
  limit?: number;
}

export interface SupplierQuery {
  q?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}

export interface ProductQuery {
  q?: string;
  brandId?: string;
  category?: ProductCategory;
  status?: ProductStatus;
  /** Solo las elegidas para la vitrina, o solo las que no lo están. */
  showcase?: boolean;
  page?: number;
  limit?: number;
}

/** Una línea y qué le falta para publicarse: el backend manda las dos cosas. */
export interface ProductWithReadiness {
  product: AdminProductDetail;
  readiness: Readiness;
}

function withReadiness(body: {
  data: AdminProductDetail;
  meta?: { readiness?: Readiness };
}): ProductWithReadiness {
  // El backend siempre manda `meta.readiness` en estas tres rutas. Si faltara,
  // la pantalla no puede quedarse muda: se deriva de los mismos tres datos.
  // La regla la sigue imponiendo el servicio al publicar de verdad.
  const fallback: Readiness = {
    canPublish: false,
    missing: [
      ...(body.data.price === null ? (["price"] as const) : []),
      ...(!body.data.imageKey ? (["imageKey"] as const) : []),
      ...(!body.data.variants.some((variant) => variant.active)
        ? (["activeVariant"] as const)
        : []),
    ],
  };
  return { product: body.data, readiness: body.meta?.readiness ?? fallback };
}

/** Paso siguiente del inicio de sesión de la consola. */
export type LoginStep =
  | { status: "authenticated"; email: string; role: string }
  | { status: "new_password_required" }
  | { status: "mfa_required" }
  | { status: "mfa_setup"; secret: string; otpauthUri: string }
  /** TOTP quedó activo pero no hubo sesión: hay que volver a entrar. */
  | { status: "mfa_enrolled" };

type LoginStepBody = {
  status?: string;
  email?: string;
  role?: string;
  secret?: string;
  otpauthUri?: string;
};

function toLoginStep(data: LoginStepBody, email: string): LoginStep {
  switch (data.status) {
    case "new_password_required":
    case "mfa_required":
    case "mfa_enrolled":
      return { status: data.status };
    case "mfa_setup":
      return { status: "mfa_setup", secret: data.secret ?? "", otpauthUri: data.otpauthUri ?? "" };
    default:
      return { status: "authenticated", email: data.email ?? email, role: data.role ?? "operator" };
  }
}

type PublishBody = { data: ContentVersionRow; meta?: { revalidated?: boolean } };

function toPublishResult(body: PublishBody): ContentPublishResult {
  // Sin `meta` (un backend anterior a A7.3) no se sabe: se asume el plazo de 60 s.
  return { version: body.data, revalidated: body.meta?.revalidated === true };
}

export const adminApi = {
  /** Identidad de la sesión. `401` si no hay. */
  async me(): Promise<AdminIdentity> {
    const body = await request<{ data: AdminIdentity }>("/me");
    return body.data;
  },

  /**
   * Abre sesión, o devuelve el paso que falta. Los retos quedan en cookies
   * `httpOnly` del backend; aquí solo se sabe qué pedir a continuación:
   * - `new_password_required`: contraseña temporal de la invitación →
   *   `completeNewPassword`.
   * - `mfa_required`: la cuenta tiene TOTP → `verifyMfa` con el código.
   * - `mfa_setup`: hay que enrolar TOTP; trae el secreto para la app →
   *   `verifyMfa` con el primer código.
   */
  async login(email: string, password: string): Promise<LoginStep> {
    const body = await request<{ data: LoginStepBody }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return toLoginStep(body.data, email);
  },

  async completeNewPassword(email: string, password: string): Promise<LoginStep> {
    const body = await request<{ data: LoginStepBody }>("/auth/new-password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return toLoginStep(body.data, email);
  },

  /** Código de 6 dígitos: entra con TOTP o termina de enrolarlo. */
  async verifyMfa(email: string, code: string): Promise<LoginStep> {
    const body = await request<{ data: LoginStepBody }>("/auth/mfa", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    return toLoginStep(body.data, email);
  },

  async logout(): Promise<void> {
    await request("/auth/logout", { method: "POST" });
  },

  /** Cuentas de la consola, activas e inactivas. Solo owner. */
  async users(): Promise<AdminUserRow[]> {
    const body = await request<{ data: AdminUserRow[] }>("/users");
    return body.data;
  },

  /** Cognito envía la contraseña temporal por correo; vence en 3 días. */
  async inviteUser(email: string, role: AdminRole): Promise<AdminUserRow> {
    const body = await request<{ data: AdminUserRow }>("/users/invite", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    return body.data;
  },

  /** Revoca sus sesiones y deshabilita la cuenta. No se deshace desde la consola. */
  async deactivateUser(id: string): Promise<AdminUserRow> {
    const body = await request<{ data: AdminUserRow }>(`/users/${encodeURIComponent(id)}/deactivate`, {
      method: "POST",
    });
    return body.data;
  },

  /** Inventario paginado, ordenado por disponible ascendente. */
  stock(
    query: StockQuery = {},
  ): Promise<PagedResponse<StockRow> & { meta?: { threshold?: number; configuredThreshold?: number } }> {
    return request(`/stock${toSearchParams({ ...query })}`);
  },

  /** Umbral global de bajo stock (decisión #5). */
  async stockThreshold(): Promise<number> {
    const body = await request<{ data: { threshold: number } }>("/stock/threshold");
    return body.data.threshold;
  },

  /** Solo owner. Queda versionado y en la auditoría. */
  async setStockThreshold(threshold: number): Promise<number> {
    const body = await request<{ data: { threshold: number } }>("/stock/threshold", {
      method: "PUT",
      body: JSON.stringify({ threshold }),
    });
    return body.data.threshold;
  },

  async movement(input: MovementInput): Promise<MovementResult> {
    const body = await request<{ data: MovementResult }>("/stock/movements", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.data;
  },

  async presignImage(input: {
    target: ImageUploadTarget;
    entityId: string;
    contentType: "image/webp" | "image/jpeg" | "image/png";
    size: number;
  }): Promise<PresignedUpload> {
    const body = await request<{ data: PresignedUpload }>("/uploads/presign", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.data;
  },

  /**
   * Invalida la caché del CDN para una clave recién subida. Reemplazar una
   * imagen no cambia su clave, así que sin esto el CDN seguiría sirviendo la
   * anterior hasta un día.
   */
  async invalidateImage(key: string): Promise<CdnInvalidation> {
    const body = await request<{ data: CdnInvalidation }>("/uploads/invalidate", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    return body.data;
  },

  async imageAlerts(): Promise<StockRow[]> {
    const body = await request<{ data: StockRow[] }>("/stock/image-alerts");
    return body.data;
  },

  async inventoryNotes(query: InventoryNotesQuery = {}): Promise<InventoryNote[]> {
    const body = await request<{ data: InventoryNote[] }>(
      `/inventory-notes${toSearchParams({ ...query })}`,
    );
    return body.data;
  },

  async createInventoryNote(input: { variantId?: string | null; text: string }): Promise<InventoryNote> {
    const body = await request<{ data: InventoryNote }>("/inventory-notes", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.data;
  },

  async resolveInventoryNote(id: string): Promise<InventoryNote> {
    const body = await request<{ data: InventoryNote }>(`/inventory-notes/${id}/resolve`, {
      method: "PATCH",
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

  // ---- Marcas (A5.2). Leer, cualquier sesión; escribir, solo el dueño. ----

  brands(query: BrandQuery = {}): Promise<PagedResponse<BrandRow>> {
    return request(`/brands${toSearchParams({ ...query })}`);
  },

  async createBrand(input: BrandInput): Promise<BrandRow> {
    const body = await request<{ data: BrandRow }>("/brands", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.data;
  },

  /** PATCH: lo que no viaja se queda como estaba. Devuelve la marca ya guardada. */
  async updateBrand(id: string, patch: Partial<BrandInput>): Promise<BrandRow> {
    const body = await request<{ data: BrandRow }>(`/brands/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return body.data;
  },

  // ---- Proveedores (A5.2) ----

  suppliersPage(query: SupplierQuery = {}): Promise<PagedResponse<SupplierRow>> {
    return request(`/suppliers${toSearchParams({ ...query })}`);
  },

  /** Ficha: marcas que trae, variantes abastecidas y último ingreso. */
  async supplier(id: string): Promise<SupplierDetail> {
    const body = await request<{ data: SupplierDetail }>(`/suppliers/${id}`);
    return body.data;
  },

  async createSupplier(input: SupplierInput): Promise<SupplierRow> {
    const body = await request<{ data: SupplierRow }>("/suppliers", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.data;
  },

  async updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<SupplierRow> {
    const body = await request<{ data: SupplierRow }>(`/suppliers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return body.data;
  },

  // ---- Líneas y variantes (A5.3) ----

  products(query: ProductQuery = {}): Promise<PagedResponse<AdminProductRow>> {
    return request(`/products${toSearchParams({ ...query })}`);
  },

  async product(id: string): Promise<ProductWithReadiness> {
    return withReadiness(
      await request<{ data: AdminProductDetail; meta?: { readiness?: Readiness } }>(
        `/products/${id}`,
      ),
    );
  },

  async createProduct(input: ProductInput): Promise<ProductWithReadiness> {
    return withReadiness(
      await request<{ data: AdminProductDetail; meta?: { readiness?: Readiness } }>("/products", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  },

  /** Aquí se edita el precio, y solo aquí: las variantes no tienen precio. */
  async updateProduct(id: string, patch: Partial<ProductInput>): Promise<ProductWithReadiness> {
    return withReadiness(
      await request<{ data: AdminProductDetail; meta?: { readiness?: Readiness } }>(
        `/products/${id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      ),
    );
  },

  async createVariant(productId: string, input: VariantInput): Promise<AdminVariantRow> {
    const body = await request<{ data: AdminVariantRow }>(`/products/${productId}/variants`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return body.data;
  },

  /**
   * La línea va en la ruta: una variante no se edita sin decir de quién es, y
   * el backend comprueba que de verdad le pertenece.
   */
  async updateVariant(
    productId: string,
    variantId: string,
    patch: Partial<VariantInput>,
  ): Promise<AdminVariantRow> {
    const body = await request<{ data: AdminVariantRow }>(
      `/products/${productId}/variants/${variantId}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    return body.data;
  },

  // ---- Pedidos (ADR-003). Leer y mover, cualquier sesión; descuentos, anonimizar y plazo, solo el dueño. ----

  orders: {
    list(query: OrderQuery = {}): Promise<PagedResponse<Order>> {
      return request(`/orders${toSearchParams({ ...query })}`);
    },

    async get(id: string): Promise<Order> {
      const body = await request<{ data: Order }>(`/orders/${encodeURIComponent(id)}`);
      return body.data;
    },

    /** Descuenta el stock: un movimiento `sale` por línea, todas o ninguna. */
    async confirm(id: string, input: ConfirmOrderInput): Promise<OrderTransition> {
      return toTransition(
        await request<TransitionBody>(`/orders/${encodeURIComponent(id)}/confirm`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },

    async deliver(id: string): Promise<OrderTransition> {
      return toTransition(
        await request<TransitionBody>(`/orders/${encodeURIComponent(id)}/deliver`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
    },

    /** Si estaba confirmado, devuelve el stock con un `return` por línea. */
    async cancel(id: string, reason?: string): Promise<OrderTransition> {
      return toTransition(
        await request<TransitionBody>(`/orders/${encodeURIComponent(id)}/cancel`, {
          method: "POST",
          body: JSON.stringify(reason ? { reason } : {}),
        }),
      );
    },

    /** Supresión de los datos del cliente en un pedido cerrado. Solo owner. */
    async anonymize(id: string): Promise<OrderTransition> {
      return toTransition(
        await request<TransitionBody>(`/orders/${encodeURIComponent(id)}/anonymize`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
    },

    /** Plazo de conservación (ADR-003 §4). Solo owner. */
    async applyRetention(): Promise<{ cancelled: number; anonymized: number }> {
      const body = await request<{ data: { cancelled: number; anonymized: number } }>("/orders/retention", {
        method: "POST",
        body: JSON.stringify({}),
      });
      return body.data;
    },
  },

  // ---- Contenido del sitio (A5.4). Leer, cualquier sesión; publicar, solo el dueño. ----

  content: {
    async keys(): Promise<ContentKey[]> {
      const body = await request<{ data: ContentKey[] }>("/content");
      return body.data;
    },

    /** Última versión publicada, o `null` si la clave nunca se publicó (se usa el texto por defecto). */
    async get(key: ContentKey): Promise<ContentVersionRow | null> {
      try {
        const body = await request<{ data: ContentVersionRow }>(`/content/${key}`);
        return body.data;
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 404) return null;
        throw error;
      }
    },

    /** De la más reciente a la más antigua; el backend admite hasta 50. */
    async versions(key: ContentKey, limit = 20): Promise<ContentVersionRow[]> {
      const body = await request<{ data: ContentVersionRow[] }>(
        `/content/${key}/versions${toSearchParams({ limit })}`,
      );
      return body.data;
    },

    /** Publica al instante: no hay borradores (decisión A5.4). */
    async publish(key: ContentKey, value: unknown): Promise<ContentPublishResult> {
      return toPublishResult(
        await request<PublishBody>(`/content/${key}`, {
          method: "PUT",
          body: JSON.stringify({ value }),
        }),
      );
    },

    /** Vuelve a publicar la versión `version` como una nueva: el historial no se reescribe. */
    async restore(key: ContentKey, version: number): Promise<ContentPublishResult> {
      return toPublishResult(
        await request<PublishBody>(`/content/${key}/versions/${version}/restore`, { method: "POST" }),
      );
    },
  },
};
