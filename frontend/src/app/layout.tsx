import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
