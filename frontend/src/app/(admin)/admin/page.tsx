import { redirect } from "next/navigation";

/**
 * `/admin` no tiene portada propia: lo primero que se usa a diario es el
 * inventario (plan A5.1), así que entra directo ahí. Si no hay sesión, la
 * puerta de `AdminShell` manda a `/admin/login`.
 */
export default function AdminIndexPage() {
  redirect("/admin/stock");
}
