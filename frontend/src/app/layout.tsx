import type { Metadata, Viewport } from "next";
import { Oxanium, Press_Start_2P } from "next/font/google";
import { PageGlitch } from "@/components/page-glitch";
import { VP_BLACK } from "@/lib/brand";
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

  /**
   * Color de la barra del navegador en móvil.
   *
   * El manifiesto ya declaraba `theme_color`, pero eso SOLO vale cuando la
   * aplicación está instalada en la pantalla de inicio. En una visita normal
   * desde el teléfono —que es casi todas— quien manda es esta etiqueta, y sin
   * ella la barra de direcciones salía con su color por defecto contra una
   * página casi negra. El escritorio no tiene barra que igualar, así que era un
   * desajuste que solo se veía en móvil.
   */
  themeColor: VP_BLACK,

  /**
   * Declara el documento como oscuro.
   *
   * Sin esto el navegador asume claro y pinta de claro todo lo que dibuja él y
   * no la hoja de estilos: las barras de desplazamiento y, lo que más se nota,
   * el desplegable NATIVO de los `<select>` del catálogo, que en un teléfono se
   * abre como un selector del sistema a pantalla casi completa. Con el tema
   * declarado, ese cromo acompaña a la paleta en lugar de contradecirla.
   */
  colorScheme: "dark",
};

export const metadata: Metadata = {
  // Sin `metadataBase`, Next resuelve las URL de OpenGraph contra localhost y
  // ningún cliente de WhatsApp ni de X puede recuperar la imagen.
  metadataBase: new URL("https://vapeupar.com"),
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
    // La imagen la aporta `app/opengraph-image.png` por convención de archivo:
    // Next emite `og:image`, su tamaño y su tipo, y toma el texto alternativo de
    // `opengraph-image.alt.txt`. Antes apuntaba a una foto de Unsplash.
  },
  twitter: {
    card: "summary_large_image",
    title: "Vapeupar | Vaporizadores en Valledupar",
    description: "Catálogo de vaporizadores con envíos inmediatos contra entrega en Valledupar.",
    // Sin `images` aquí a propósito: de `app/opengraph-image.png` Next deriva
    // también `twitter:image`, su alt y su tamaño. Una `app/twitter-image.png`
    // solo haría falta para un recorte distinto del de OpenGraph.
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
