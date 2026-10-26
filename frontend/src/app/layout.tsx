import type { Metadata, Viewport } from "next";
import { Oxanium, Press_Start_2P } from "next/font/google";
import { PageGlitch } from "@/components/page-glitch";
import "./globals.css";

/**
 * Sistema tipográfico VP.
 * Oxanium: 85-90% de la interfaz (títulos, productos, precios, nav, botones, texto).
 * Press Start 2P: 10-15%, exclusivamente en etiquetas cortas vía `.vp-label`.
 * Ver `docs/design-execution-plan.md` §V1.
 */
const oxanium = Oxanium({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-oxanium",
  display: "swap",
});

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Vapeupar | Tienda de Vaporizadores & Catálogo en Valledupar",
  description: "Catálogo exclusivo de vaporizadores desechables, pods recargables, sales de nicotina y accesorios en Valledupar. Envíos express contra entrega en moto.",
  keywords: [
    "vape valledupar",
    "vaporizadores valledupar",
    "pods desechables valledupar",
    "sales de nicotina colombia",
    "lost mary",
    "geekvape",
    "oxva"
  ],
  authors: [{ name: "Vapeupar" }],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Vapeupar | Tienda de Vaporizadores en Valledupar",
    description: "Vaporizadores 100% auténticos, pods y sales de nicotina con entrega inmediata en Valledupar. Pide directamente por WhatsApp.",
    url: "https://vapeupar.com",
    siteName: "Vapeupar",
    locale: "es_CO",
    type: "website",
    images: [
      {
        url: "https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=1200&q=80",
        width: 1200,
        height: 630,
        alt: "Vapeupar Valledupar - Vaporizadores y Accesorios",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vapeupar | Vaporizadores en Valledupar",
    description: "Catálogo de vaporizadores con envíos inmediatos contra entrega en Valledupar.",
    images: ["https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=1200&q=80"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      dir="ltr"
      className={`${oxanium.variable} ${pressStart.variable} h-full antialiased`}
    >
      {/* Fondo y color de texto se declaran una sola vez en globals.css sobre tokens */}
      <body className="min-h-full flex flex-col">
        <PageGlitch />
        {children}
      </body>
    </html>
  );
}
