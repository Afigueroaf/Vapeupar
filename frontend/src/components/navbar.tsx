"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { waLink } from "@/lib/contact";

interface NavbarProps {
  cartCount?: number;
}

/**
 * Navegación principal VP.
 *
 * Los destinos apuntan a secciones de la página única actual. Se convierten
 * en rutas reales (`/tienda`, `/coleccion/[categoria]`, `/nosotros`) en una
 * fase posterior (`docs/design-reset-inventory.md` §5.6).
 */
const NAV_LINKS = [
  { href: "#catalogo", label: "Tienda" },
  { href: "#colecciones", label: "Colecciones" },
  { href: "#nosotros", label: "Nosotros" },
];

const MOBILE_COLLECTIONS = [
  { href: "#desechables", label: "Desechables" },
  { href: "#pods", label: "Pods recargables" },
  { href: "#liquidos", label: "Sales de nicotina" },
  { href: "#faq", label: "Preguntas frecuentes" },
];

export function Navbar({ cartCount = 0 }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const whatsappHref = waLink("Hola Vapeupar, quiero consultar sobre su catálogo");

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b-2 border-line bg-background">
      <div className="mx-auto flex max-w-vp items-center justify-between gap-6 px-4 py-4 sm:px-6 xl:px-10">
        <Link href="/" className="flex items-center" aria-label="Vapeupar, inicio">
          <Image
            src="/logo-detalle.svg"
            alt="Vapeupar"
            width={1860}
            height={926}
            priority
            className="h-10 w-auto sm:h-12"
          />
        </Link>

        {/* Navegación de escritorio */}
        <nav aria-label="Navegación principal" className="hidden md:block">
          <ul className="flex items-center gap-4 text-[0.9375rem] font-semibold uppercase tracking-[0.04em]">
            {NAV_LINKS.map((link, index) => (
              <li key={link.href} className="flex items-center gap-4">
                {index > 0 && (
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                )}
                <a href={link.href} className="transition-colors hover:text-action">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Acciones */}
        <div className="flex items-center gap-3">
          {whatsappHref && (
            <Button
              variant="secondary"
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 text-xs sm:text-[0.9375rem] sm:px-6"
            >
              WhatsApp
            </Button>
          )}

          <button
            type="button"
            className="relative flex size-11 items-center justify-center rounded-vp border-2 border-muted transition-colors hover:border-line"
            aria-label="Carrito de compras"
          >
            <ShoppingBag className="size-5" aria-hidden="true" />
            {cartCount > 0 && (
              <span className="vp-label absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-vp bg-action text-action-ink">
                {cartCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex size-11 items-center justify-center rounded-vp border-2 border-muted transition-colors hover:border-line md:hidden"
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú de navegación"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Panel móvil */}
      {mobileMenuOpen && (
        <div className="border-t-2 border-line bg-background px-4 pb-8 pt-6 md:hidden">
          <nav aria-label="Navegación móvil">
            <ul className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={closeMenu}
                    className="flex min-h-[44px] items-center text-2xl font-bold uppercase tracking-[-0.01em] transition-colors hover:text-action"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-6 border-t-2 border-muted pt-6">
            <PixelLabel variant="outline">Colecciones</PixelLabel>
            <ul className="mt-4 flex flex-col gap-1">
              {MOBILE_COLLECTIONS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={closeMenu}
                    className="flex min-h-[44px] items-center text-base font-semibold text-muted transition-colors hover:text-action"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
