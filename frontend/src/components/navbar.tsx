"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame, MessageCircle, ShoppingBag, Menu, X } from "lucide-react";

interface NavbarProps {
  cartCount?: number;
}

export function Navbar({ cartCount = 0 }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "573001234567";

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-400 text-zinc-950 font-black shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <Flame className="size-5 fill-zinc-950" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
              VAPEUPAR
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Valledupar
              </span>
            </span>
          </div>
        </Link>

        {/* Desktop Links Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
          <a href="#catalogo" className="hover:text-white transition">
            Catálogo
          </a>
          <a href="#desechables" className="hover:text-white transition">
            Desechables
          </a>
          <a href="#pods" className="hover:text-white transition">
            Pods Recargables
          </a>
          <a href="#liquidos" className="hover:text-white transition">
            Líquidos & Sales
          </a>
          <a href="#faq" className="hover:text-white transition">
            Preguntas
          </a>
        </nav>

        {/* Action Buttons & Mobile Hamburger */}
        <div className="flex items-center gap-2.5">
          <a
            href={`https://wa.me/${whatsappNumber}?text=Hola%20Vapeupar,%20quiero%20consultar%20sobre%20su%20cat%C3%A1logo`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 shadow-sm shadow-emerald-500/20"
          >
            <MessageCircle className="size-4" />
            <span className="hidden sm:inline">Pedir por WhatsApp</span>
            <span className="sm:hidden">WhatsApp</span>
          </a>

          <button 
            type="button"
            className="relative flex size-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 transition"
            aria-label="Carrito de compras"
          >
            <ShoppingBag className="size-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-zinc-950">
                {cartCount}
              </span>
            )}
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex size-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white transition"
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú de navegación"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-800/80 bg-zinc-950/95 px-4 pt-3 pb-6 space-y-3">
          <nav className="flex flex-col space-y-2 text-sm font-medium text-zinc-300">
            <a
              href="#catalogo"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 hover:bg-zinc-900 hover:text-emerald-400 transition"
            >
              Catálogo Completo
            </a>
            <a
              href="#desechables"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 hover:bg-zinc-900 hover:text-emerald-400 transition"
            >
              Vaporizadores Desechables
            </a>
            <a
              href="#pods"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 hover:bg-zinc-900 hover:text-emerald-400 transition"
            >
              Pods Recargables & Kits
            </a>
            <a
              href="#liquidos"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 hover:bg-zinc-900 hover:text-emerald-400 transition"
            >
              Líquidos & Sales de Nicotina
            </a>
            <a
              href="#faq"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 hover:bg-zinc-900 hover:text-emerald-400 transition"
            >
              Preguntas Frecuentes
            </a>
          </nav>

          <div className="pt-2 border-t border-zinc-800/60">
            <p className="text-[11px] text-zinc-500">
              Envíos rápidos en Valledupar • Pago contra entrega
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
