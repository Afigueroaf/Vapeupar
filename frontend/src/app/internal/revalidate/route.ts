import { revalidateTag } from "next/cache";
import { z } from "zod";
import { SITE_TAGS } from "@/lib/cache-tags";
import { isRevalidateAuthorized } from "@/lib/revalidate-auth";

/**
 * Revalidación on-demand (plan A7.3, ADR-002 §7).
 *
 * La llama SOLO el backend, por loopback, después de una escritura de la
 * consola (catálogo, contenido o stock), para que el cambio se vea al recargar
 * sin esperar los 60 s del ISR, que siguen como red de seguridad.
 *
 * Va en `/internal/` y no en `/api/` porque nginx manda `/api/*` al backend; y
 * nginx responde 404 a `/internal/*` desde fuera
 * (`infra/deploy/nginx/vapeupar-site.inc`), así que el secreto es la segunda
 * barrera, no la única.
 *
 *   503  el servidor no tiene REVALIDATE_SECRET
 *   401  sin secreto o con uno incorrecto
 *   400  cuerpo inválido o etiqueta desconocida
 *   200  { revalidated: [...] }
 */

const BodySchema = z.object({
  tags: z.array(z.enum(SITE_TAGS)).min(1),
});

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return Response.json({ success: false, message: "Revalidación no configurada" }, { status: 503 });
  }
  if (!isRevalidateAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ success: false, message: "No autorizado" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => undefined);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ success: false, message: "Etiquetas inválidas" }, { status: 400 });
  }

  const tags = [...new Set(parsed.data.tags)];
  // `{ expire: 0 }` y no `'max'`: con `'max'` la primera visita tras publicar
  // seguiría recibiendo la versión vieja mientras se regenera, y el criterio
  // de A7.3 es ver el cambio al recargar.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  return Response.json({ success: true, revalidated: tags });
}
