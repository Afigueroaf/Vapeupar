import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Todo lo que cuelga de aquí exige sesión: `AdminShell` la comprueba y manda a
 * `/admin/login` si no hay. `/admin/login` está fuera de este grupo a
 * propósito, porque si no, la puerta se redirigiría a sí misma.
 */
export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
