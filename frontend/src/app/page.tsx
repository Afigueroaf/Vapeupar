import { AgeVerificationModal } from "@/components/age-verification-modal";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { TrustBand } from "@/components/trust-band";
import { ProductCatalog } from "@/components/product-catalog";
import { FAQ } from "@/components/faq";
import { Footer } from "@/components/footer";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { TouchCursor } from "@/components/touch-cursor";
import { VaporizerPointCloud } from "@/components/vaporizer-point-cloud";
import { VAPORIZER_ANCHOR_SELECTOR } from "@/components/vaporizer/anchor";
import { FALLBACK_PRODUCTS } from "@/data/fallback-products";
import { Product } from "@/types/product";

/** Caras del prisma de la portada. Tiene que cuadrar con `ProductPrism`. */
const PRISM_SIDES = 6;

/**
 * Pide productos a la API.
 *
 * Devuelve `null` cuando la petición falla y `[]` cuando la API responde bien
 * pero no hay nada que servir. La diferencia importa: «la vitrina está vacía
 * porque nadie ha elegido» no es lo mismo que «el backend no contesta», y solo
 * el segundo caso justifica tirar de los productos de respaldo.
 */
async function fetchProducts(query: string): Promise<Product[] | null> {
  try {
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const res = await fetch(`${apiUrl}/products${query}`, {
      next: { revalidate: 60 },
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (json && json.success && Array.isArray(json.data)) {
      return json.data;
    }

    return null;
  } catch {
    // La API del backend está apagada.
    return null;
  }
}

export default async function HomePage() {
  // Dos peticiones, no una.
  //
  // El prisma necesita las elegidas para la vitrina, y el listado general
  // llega paginado (20 por defecto): filtrar `showcase` sobre esa página
  // perdería una elección que cayera más abajo. Con `?showcase=true&limit=6`
  // la elección la hace la base de datos, que es la única que ve el catálogo
  // entero. En paralelo: la segunda no depende de la primera.
  const [catalog, chosen] = await Promise.all([
    fetchProducts(""),
    fetchProducts(`?showcase=true&limit=${PRISM_SIDES}`),
  ]);

  const products = catalog ?? FALLBACK_PRODUCTS;
  // Sin nada elegido —o sin backend— la vitrina cae al catálogo, y el reparto
  // de caras lo acaba de resolver `prism/faces.ts`.
  const showcase = chosen && chosen.length > 0 ? chosen : products;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fuera de todo bloque `.vp-glitch`: un `filter` en un ancestro se
          convierte en bloque contenedor de sus descendientes `position: fixed`,
          y los dos son fijos. El botón glitchea igualmente, pero con el filtro
          aplicado a sí mismo (`.vp-glitch-chip`). */}
      <AgeVerificationModal />
      <WhatsappFab />

      {/* Cursor táctil. Va aquí y no en el `layout`, que es compartido con la
          consola de administración: el gesto es solo del sitio público. Y
          fuera de todo bloque `.vp-glitch` por lo mismo que el botón de
          WhatsApp: su capa es `position: fixed` y un `filter` en un ancestro
          la anclaría al contenido filtrado en lugar de al viewport. */}
      <TouchCursor />

      {/* El glitch NO se aplica aquí. Lo llevan los bloques de dentro, cada
          uno de la altura de una pantalla como mucho: un filtro sobre este
          envoltorio abarcaría el documento entero y el navegador lo descarta
          en un teléfono. Ver `globals.css` §GLITCH RGB DE PÁGINA. */}
      <div className="flex flex-1 flex-col">
        <Navbar />
        <main className="flex-1">
          {/*
            Capa del render 3D. Va de borde a borde de la pantalla y abarca la
            intro y la banda de confianza; sin marco visible, solo es el área
            sobre la que se dibuja.

            El lienzo se monta aquí y no dentro del hero porque cubre las dos
            secciones. Lo que mantiene al vaporizador en la columna derecha del
            hero, en lugar de centrarlo en todo el bloque, es el ancla
            (`vaporizer/anchor.ts`).

            `isolate` le da su propio contexto de apilamiento, y el contenido
            va en un hijo `relative` para quedar por encima del lienzo sin
            tener que repartir z-index por los componentes.
          */}
          <div className="relative isolate">
            {/* SIN `vp-glitch`, Y NO POR RECORTAR EL EFECTO: LA NUBE YA
                GLITCHEA, PERO EN EL SHADER.

                `vaporizer/scene.tsx` lee la misma señal que el resto de la
                página (`readGlitchShift()`, de `lib/glitch.ts`) y la aplica
                como desgarro por bandas dentro del material —`uGlitch`,
                `uGlitchBands`, `uGlitchSeed`—, así que la pieza se rompe en el
                mismo instante y con la misma fuerza que las franjas de
                alrededor. Filtrar además el contenedor era hacer dos veces el
                mismo efecto, y la cara.

                LO QUE COSTABA, MEDIDO en un Moto G15 (DPR 2,5): este bloque
                cubre la intro Y la banda, o sea casi dos pantallas, y el filtro
                obliga a rasterizarlo entero en una superficie aparte. Peor
                todavía: dentro hay un lienzo WebGL, de modo que CADA FOTOGRAMA
                de 3D invalidaba esa superficie. En la traza del recorrido
                completo aparecía como un `FinishPaintRenderPass` de 450 ms en
                la GPU —medio segundo de imagen congelada— cada vez que una
                ráfaga coincidía con el scroll. Ver
                `docs/performance-optimization-plan.md`. */}
            <VaporizerPointCloud
              className="absolute inset-0"
              anchorSelector={VAPORIZER_ANCHOR_SELECTOR}
            />
            {/*
              Las dos bandas, a la misma altura.

              El alto del hero lo manda su columna 3D, que es `aspect-square`,
              o su columna de texto cuando la rejilla estrecha la otra. El de
              la banda, sus tres tarjetas, que miden 559px fijos. Medido a
              1920px: 754 contra 559, y el prisma apretado en la diferencia.

              Se igualan con dos filas `1fr`: en una rejilla de alto
              automático, las filas flexibles se reparten por igual el mayor de
              sus contenidos, así que las dos acaban midiendo lo que mida la
              más alta. No hay número escrito en ninguna parte y la regla
              sobrevive a cualquier cambio del hero o de las tarjetas.

              LA REGLA ES SIMÉTRICA, y tiene que serlo: entre ~1200 y ~1400 el
              cruce se invierte —a 1280 el hero mide 510 y la banda 559, porque
              ahí la columna 3D del hero se ha encogido más que el texto— y en
              ese tramo es el hero el que crece hasta la banda. Igualar siempre
              en una sola dirección exigiría encoger la banda por debajo de sus
              tarjetas, que es recortarlas. Entre las dos, crecer.

              `1fr` y no `grid-rows-2`: la utilidad de Tailwind genera
              `minmax(0, 1fr)`, cuyo mínimo es cero y deja que una fila quede
              por debajo de su contenido. Aquí el mínimo tiene que ser el
              contenido, que es lo que significa `1fr` a secas
              (`minmax(auto, 1fr)`).

              A TODOS LOS ANCHOS, y antes solo desde `lg`. La excepción venía
              de cuando el prisma estaba oculto en el teléfono: allí la banda
              eran tres tarjetas apiladas y estirarlas era hueco muerto. Desde
              que la vitrina 3D se ve también en móvil, el sobrante no es
              hueco: se lo queda el prisma, que es la pieza que más gana con
              él. El coste es scroll —en una pantalla de 390px la banda pasa de
              ~452px a igualar los ~706px del hero— y se acepta a cambio de que
              la vitrina se vea entera.
            */}
            <div className="relative grid grid-rows-[1fr_1fr]">
              <Hero />
              <TrustBand showcase={showcase} />
            </div>
          </div>

          <ProductCatalog initialProducts={products} />
          <FAQ />
        </main>
        <Footer />
      </div>
    </div>
  );
}
