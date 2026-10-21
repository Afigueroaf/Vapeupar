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
  description: "Catálogo exclusivo de vaporizadores desechables, pods recargables, sales de nicotina y accesorios en Valledupar. Envíos express contra entrega.",
  keywords: [
    "vape valledupar",
    "vaporizadores valledupar",
    "pods desechables",
    "sales de nicotina colombia",
    "lost mary",
    "geekvape",
    "oxva"
  ],
  authors: [{ name: "Vapeupar" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
