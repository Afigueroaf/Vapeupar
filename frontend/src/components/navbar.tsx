"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BagIcon, CloseIcon, MenuIcon } from "@/components/ui/icons";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { PixelLabel } from "@/components/ui/pixel-label";
import { setCartOpen, useCart, useCartOpen } from "@/lib/cart";
import { COLLECTIONS } from "@/lib/collections";

/**
 * Navegación principal VP.
 *
 * Desde V8 (`docs/design-reset-inventory.md` §5.6) «Nosotros» y las
 * colecciones son rutas propias (`/nosotros`, `/coleccion/<slug>`). La tienda
 * y el índice de colecciones siguen siendo secciones de la portada, escritas
 * como `/#seccion` para que también lleven allí desde otra página.
 */
const NAV_LINKS = [
  { href: "/#catalogo", label: "Tienda" },
  { href: "/#colecciones", label: "Colecciones" },
  { href: "/nosotros", label: "Nosotros" },
];

/**
 * Accesos directos del menú móvil: las tres colecciones con más recorrido
 * (las que antes eran anclas) y las preguntas frecuentes. Las seis están en el
 * índice «Colecciones» y en la propia página de cada colección.
 */
const MOBILE_COLLECTIONS = [
  ...COLLECTIONS.slice(0, 3).map((c) => ({ href: `/coleccion/${c.slug}`, label: c.label })),
  { href: "/#faq", label: "Preguntas frecuentes" },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // El contador sale del carrito local (`lib/cart.ts`): unidades, no líneas.
  const { count: cartCount } = useCart();
  const cartOpen = useCartOpen();

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="vp-glitch sticky top-0 z-40 w-full border-b-2 border-line bg-background">
      <div className="mx-auto flex max-w-vp items-center justify-between gap-6 px-inline py-4">
        <Link href="/" className="flex items-center" aria-label="Vapeupar, inicio">
          <Image
            src="/logo-vu-blanco.svg"
            alt="Vapeupar"
            width={1026}
            height={549}
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
                <Link href={link.href} className="transition-colors hover:text-action">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Acciones.
            El CTA de WhatsApp ya no vive aquí: pasó a `whatsapp-fab.tsx`, un
            botón flotante permanente. En esta fila competia con el logo, la
            navegación, el carrito y el menú, y desaparecía en cuanto el
            visitante bajaba al catálogo. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setCartOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={cartOpen}
            className="relative flex size-11 items-center justify-center rounded-vp border-2 border-muted transition-colors hover:border-line"
            aria-label={
              cartCount === 0
                ? "Carrito de compras, vacío"
                : `Carrito de compras, ${cartCount} ${cartCount === 1 ? "unidad" : "unidades"}`
            }
          >
            <BagIcon className="size-5" aria-hidden="true" />
            {cartCount > 0 && (
              <span className="vp-label absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-vp bg-action text-action-ink">
                {/* Dos cifras no caben en la chapa de 20px en Press Start 2P. */}
                {cartCount > 9 ? "9+" : cartCount}
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
              <CloseIcon className="size-5" aria-hidden="true" />
            ) : (
              <MenuIcon className="size-5" aria-hidden="true" />
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
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    className="flex min-h-[44px] items-center text-2xl font-bold uppercase tracking-[-0.01em] transition-colors hover:text-action"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-6 border-t-2 border-muted pt-6">
            <PixelLabel variant="outline">Colecciones</PixelLabel>
            <ul className="mt-4 flex flex-col gap-1">
              {MOBILE_COLLECTIONS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    className="flex min-h-[44px] items-center text-base font-semibold text-muted transition-colors hover:text-action"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* El cajón se monta aquí porque aquí está su botón, pero se pinta en
          un portal al `body`: esta cabecera lleva `vp-glitch`, y un `filter`
          en un ancestro anclaría el panel fijo a la barra en vez de a la
          pantalla (ver `cart/cart-drawer.tsx`). */}
      <CartDrawer />
    </header>
  );
}
