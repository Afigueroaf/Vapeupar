import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { cn, formatNumberCO, formatPriceCOP } from "@/lib/utils";
import { waLink } from "@/lib/contact";

interface ProductCardProps {
  product: Product;
  eagerImage?: boolean;
}

/**
 * Tarjeta de producto del sistema VP (fase V4).
 *
 * Decisiones que conviene no deshacer sin releer el inventario:
 *
 * - **El CTA es `secondary`, no `primary`.** La regla del sistema es un solo
 *   CTA primario por vista (`docs/design-reset-inventory.md` §11, regla 2) y el
 *   hero ya lo gasta. Nueve rellenos lima en el grid anularían el lima como
 *   señal de acción y competirían con el brillo lima del hover.
 * - **El nombre no cambia de color al hover.** La tarjeta todavía no es un
 *   enlace: `/producto/[slug]` llega en V8 (§5.6). Encender el título
 *   prometería un destino que no existe.
 * - **La imagen no hace `scale` al hover** (§8.1). La micro-interacción del
 *   conjunto la lleva `.vp-card`: borde lima, desplazamiento duro y el brillo
 *   que sigue al puntero. Por la misma razón el contorno de la silueta no
 *   cambia de color al apuntar: la tarjeta ya responde como una pieza.
 * - **La foto no va dentro de un recuadro.** El marco de 2px sobre fondo negro
 *   metía un segundo borde a 20px del borde de la tarjeta y encajonaba un
 *   producto que ya viene recortado. Lo sustituye `.vp-silhouette`: un
 *   contorno de 1px que sigue la forma del producto (ver `globals.css`). El
 *   recuadro sobrevive solo en el hueco "SIN IMAGEN", donde no hay silueta que
 *   contornear y sin marco el texto quedaría flotando.
 * - **Modo compacto por debajo de `sm`.** El catálogo va a 2 columnas en
 *   móvil (`product-catalog.tsx`), lo que deja ~134px útiles por tarjeta en
 *   una pantalla de 360px. Press Start 2P tiene paso fijo y su mínimo de
 *   sistema son 10px (§11), así que una etiqueta pixel de 12 caracteres mide
 *   ~154px y se recortaría: por eso las caladas pasan a la línea de
 *   especificaciones en móvil y el resto de la tarjeta baja de escala. De `sm`
 *   en adelante la tarjeta es exactamente la de antes.
 * - Los iconos `Check` / `XCircle` desaparecen: el estado se dice con color
 *   (lima disponible) y con etiqueta pixel (`AGOTADO`), no con decoración
 *   (§4.6). `MessageCircle` se conserva de forma provisional (§4.5).
 */
/**
 * Redacción corta de las caladas para las tarjetas estrechas: 10.000 -> "10K".
 * Solo se abrevian los millares exactos, que es como vienen todos los
 * productos del catálogo; cualquier otro valor se escribe entero antes que
 * mentir sobre la cifra.
 */
function compactarCaladas(puffs: number): string {
  if (puffs >= 1000 && puffs % 1000 === 0) return `${puffs / 1000}K`;
  return formatNumberCO(puffs);
}

export function ProductCard({ product, eagerImage = false }: ProductCardProps) {
  const isAvailable = product.inStock && product.stock > 0;
  const isOnSale = Boolean(product.compareAtPrice && product.compareAtPrice > product.price);

  const buyHref = waLink(
    `Hola Vapeupar! Quiero pedir el producto: *${product.name}* (Precio: ${formatPriceCOP(product.price)}). ¿Tienen disponibilidad inmediata en Valledupar?`
  );

  const inquireHref = waLink(
    `Hola Vapeupar! Me interesa el producto agotado: *${product.name}*. ¿Cuándo les llega nuevo stock?`
  );

  const actionHref = isAvailable ? buyHref : inquireHref;

  // Ficha técnica como una línea de especificaciones, no como pills: el
  // separador lima hace de marca HUD y evita bordes de 2px alrededor de
  // fragmentos de 3 caracteres.
  const specs: { label: string; value: string }[] = [];
  if (product.specs.nicotineStrength && product.specs.nicotineStrength !== "N/A") {
    specs.push({ label: "Nicotina", value: product.specs.nicotineStrength });
  }
  if (product.specs.flavorProfile) {
    specs.push({ label: "Sabor", value: product.specs.flavorProfile });
  }
  return (
    <Surface
      as="article"
      aria-label={`${product.brand} ${product.name}`}
      className="vp-card vp-glitch-card flex flex-col p-3 sm:p-5"
    >
      {/* LA COLUMNA 3D. Ya no gira —el giro está en la tarjeta, para que el
          borde se incline con él—, pero sigue siendo necesaria: las capas
          `.vp-plano` solo se proyectan si son hijas DIRECTAS de un elemento
          con `preserve-3d`, y esta es la única que reúne a todas. Ver la
          tabla de medidas en `globals.css`.

          `flex-1` para que ocupe todo el hueco y el `mt-auto` del pie siga
          empujando contra el borde de abajo. */}
      <div className="vp-escena flex flex-1 flex-col">
        {/* Lámina holográfica. Va fuera del flujo (`position: absolute` en
          `globals.css`), de modo que no mueve ni un píxel de la distribución
          de la tarjeta. Decorativa: `aria-hidden`. */}
        <span className="vp-holo" aria-hidden="true" />

        {/* UNA SOLA ETIQUETA EN LA CABECERA, siempre de una línea.
          Antes aquí convivían marca, caladas y "Top Ventas", y como cada
          producto trae un juego distinto de esas tres, la fila medía 30px en
          una tarjeta y 106px en la de al lado: ese desnivel empujaba imagen,
          nombre y todo lo demás, y la fila dejaba de leerse como una rejilla.
          Las otras dos etiquetas se han ido sobre la imagen, donde flotan sin
          ocupar sitio en el flujo.

          `whitespace-normal` por debajo de `sm`: a 320px la tarjeta deja 114px
          útiles y una etiqueta pixel de 10 caracteres mide 120px. Como 10px es
          el mínimo del sistema (§11), parte en dos líneas en vez de recortarse. */}
        <PixelLabel
          variant="outline"
          className="vp-plano vp-plano-sombra [--vp-plano:48px] self-start whitespace-normal px-1.5 sm:whitespace-nowrap sm:px-2.5"
        >
          {product.brand}
        </PixelLabel>

        {/* Sin recuadro: la foto se apoya directamente en la superficie de la
          tarjeta y su contorno lo da `.vp-silhouette` (globals.css), que sigue
          la forma del producto. Por eso tampoco hay `overflow-hidden`: ese
          contorno se dibuja en el canto y un recorte lo cortaría. */}
        {/* El producto es la capa que manda: es lo que tiene que parecer que
          sale de la tarjeta. */}
        <div className="vp-plano [--vp-plano:72px] relative mt-3 aspect-square w-full sm:mt-5">
          {/*
          Una línea publicada puede no tener imagen todavía (la clave del bucket
          se carga en la consola, y las imágenes son A8). `next/image` lanza
          error con `src=""`, y al pintarse esto en el servidor eso romperia la
          página entera, así que el hueco se dibuja a mano.
        */}
          {product.imageUrl ? (
            /* Envoltorio que solo existe para llevar la sombra proyectada. El
               contorno de silueta va en la imagen y la sombra aquí: separados,
               el contorno —que no depende del puntero— deja de recalcularse en
               cada fotograma del gesto. Ver `.vp-silhouette` en `globals.css`.

               `absolute inset-0` y no un envoltorio en flujo: la imagen usa
               `fill`, que se posiciona contra el ancestro posicionado más
               cercano, y este envoltorio pasa a serlo sin cambiar la caja. */
            <div className="vp-silhouette-sombra absolute inset-0">
              <Image
                src={product.imageUrl}
                alt={`${product.name} - ${product.brand} (${product.specs.flavorProfile || product.category})`}
                fill
                // Debe seguir a las columnas del grid (2 / 3 / 4), o el
                // navegador descarga una imagen del doble de lo necesario en
                // móvil.
                sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw"
                /* `object-contain`, no `object-cover`: un recorte comería los
                 bordes del producto y el contorno quedaría truncado contra el
                 canto del hueco en vez de cerrar la silueta. */
                className="vp-silhouette object-contain object-center"
                loading={eagerImage ? "eager" : "lazy"}
              />
            </div>
          ) : (
            <div
              className="flex h-full w-full items-center justify-center border-2 border-muted bg-background rounded-vp"
              role="img"
              aria-label={`${product.name} - sin imagen`}
            >
              <span className="vp-label text-muted">SIN IMAGEN</span>
            </div>
          )}

          {/* OJO CON LA PROFUNDIDAD AQUÍ: estas piezas viven DENTRO del hueco de
            la imagen, y la proyección 3D solo alcanza a los hijos DIRECTOS de
            `.vp-escena`. Medido: un hijo anidado a Z=200 no mueve su caja ni un
            píxel (276.46px con Z=0 y con Z=200), mientras que el mismo valor en
            un hijo directo la lleva de 274.25 a 304.72. Darle a una etiqueta
            anidada su propia altura sería escribir un número que no hace nada,
            así que viajan en el plano de la imagen (72px) y se despegan con su
            sombra, que sí funciona a cualquier nivel. `--vp-plano` se conserva
            aquí porque de él sale esa sombra.

            Banderas y caladas flotan SOBRE la imagen, en capa aparte: así un
            producto en oferta, uno más vendido y uno sin nada miden lo mismo.
            El producto viene recortado y centrado, de modo que las esquinas
            quedan libres. */}
          {(isOnSale || product.isBestSeller) && (
            <div className="vp-plano-sombra [--vp-plano:108px] absolute left-2 top-2 flex flex-col items-start gap-1.5 sm:left-3 sm:top-3">
              {isOnSale && (
                <PixelLabel
                  variant="lime"
                  className="whitespace-normal px-1.5 sm:whitespace-nowrap sm:px-2.5"
                >
                  Oferta
                </PixelLabel>
              )}

              {product.isBestSeller && (
                <PixelLabel
                  variant="lime"
                  className="whitespace-normal px-1.5 sm:whitespace-nowrap sm:px-2.5"
                >
                  Top Ventas
                </PixelLabel>
              )}
            </div>
          )}

          {/* Las caladas, abajo a la izquierda, a todos los anchos.
            DOS REDACCIONES, Y LA DE MÓVIL NO ES UN CAPRICHO: medido a 390px,
            la tarjeta de rejilla deja 145px y "10.000 Puffs" en Press Start 2P
            a 10px mide 146. Por ese píxel la etiqueta se partía en tres
            renglones de 48px que tapaban un tercio de la imagen, justo encima
            del producto. La forma corta mide 114px y entra de una.

            Y por debajo de `xs` (360px) se queda solo la cifra, porque a 320px
            la tarjeta deja 114px justos: la forma corta cabría por los pelos y
            volvía a partirse en dos renglones que tapaban el 44% de la imagen.
            "10K" mide 49px y se lee como una chapa en la esquina.

            De `sm` en adelante hay sitio de sobra y se escribe el número
            entero. Las tres redacciones salen de medir, no de tantear.

            `bg-background` NO es decoración: la variante violeta es solo borde
            y texto, y aquí la etiqueta flota sobre la foto del producto. Sobre
            un producto oscuro se leía; sobre uno rosa claro, el texto blanco
            se perdía contra el envás. Con fondo sólido se lee igual encima de
            cualquier producto, que es lo que exige una etiqueta superpuesta. */}
          {product.specs.puffCount && (
            <PixelLabel
              variant="violet"
              className="vp-plano-sombra [--vp-plano:108px] absolute bottom-0 left-0 max-w-full whitespace-normal bg-background px-1.5 sm:whitespace-nowrap sm:px-2.5"
            >
              <span className="xs:hidden">
                {compactarCaladas(product.specs.puffCount)}
              </span>
              <span className="hidden xs:inline sm:hidden">
                {compactarCaladas(product.specs.puffCount)} Puffs
              </span>
              <span className="hidden sm:inline">
                {formatNumberCO(product.specs.puffCount)} Puffs
              </span>
            </PixelLabel>
          )}
        </div>

        {/* Sin renglones reservados. Lo que mantiene la rejilla alineada no es
          este bloque: el nombre está anclado arriba (todo lo que lleva encima
          mide igual en todas las tarjetas) y el pie está anclado abajo por
          `mt-auto`, así que un nombre de dos líneas crece hacia el hueco
          elástico del medio sin mover ni la imagen ni el filete. Reservar aquí
          solo dejaba 27px en blanco en los nombres de una línea. */}
        <h3 className="vp-plano vp-plano-texto [--vp-plano:56px] mt-4 text-lg font-bold uppercase leading-tight line-clamp-2 sm:mt-5 sm:text-[1.375rem]">
          {product.name}
        </h3>

        {/* La descripción es opcional en el catálogo y hoy ningún producto la
          trae. Sin la guarda se pintaba un párrafo vacío con su margen. */}
        {product.shortDescription && (
          <p className="vp-plano [--vp-plano:44px] mt-2 text-sm leading-relaxed text-muted line-clamp-2 sm:text-base">
            {product.shortDescription}
          </p>
        )}

        {/* Solo si hay algo que decir: un renglón reservado en vacío era parte
          del hueco muerto entre el nombre y el filete. No hace falta para
          alinear, por lo mismo que el nombre: vive en el hueco elástico. */}
        {specs.length > 0 && (
          <p className="vp-plano [--vp-plano:38px] mt-3 text-xs text-muted sm:mt-4 sm:text-sm">
            {specs.map((spec, index) => (
              <span key={spec.label}>
                {index > 0 && (
                  <span className="text-action" aria-hidden="true">
                    {" · "}
                  </span>
                )}
                {spec.label} <span className="font-semibold text-foreground">{spec.value}</span>
              </span>
            ))}
          </p>
        )}

        {/* `mt-auto` fija el bloque de precio y acción al pie, de modo que las
          tarjetas de una misma fila alinean sus botones aunque el nombre o la
          descripción ocupen distinto número de líneas. */}
        {/* EL PIE SUBE A 44px: dentro va el precio, y el texto también tiene que
          proyectarse. A esa altura se dibuja un 2.2% más grande
          (2000 / (2000 - 44)): relieve suficiente sin deformar la cifra. El
          CTA ya no lleva altura propia porque está anidado aquí dentro y ahí
          no surte efecto (ver la nota de las banderas); viaja en este plano.

          Sin `vp-plano-sombra`: una sombra dura detrás de un párrafo se lee
          como texto mal impreso, no como relieve. La sombra se reserva para
          las piezas con borde —etiquetas y chapas— y para el producto, que
          proyecta la suya con su propia silueta.

          El pie vuela más bajo que el nombre (44 contra 56) porque aquí
          dentro viven el tachado y la disponibilidad, que son texto pequeño:
          medido, a 44px el borde de las letras pierde un 4.7% de nitidez y
          0.15 de contraste, y a 120px la caída ya es del 39% y la cifra se ve
          blanda. 44 es el techo con el que el precio sigue limpio. */}
        <div className="vp-plano [--vp-plano:44px] mt-auto border-t-2 border-muted pt-3 sm:pt-4">
          {/* PIE DE TRES LÍNEAS FIJAS: tachado, precio y disponibilidad.
            Antes era una fila `flex-wrap` con `justify-between`, y el envoltorio
            dependía de los datos: un producto con precio anterior y otro sin él
            rompían por sitios distintos, así que el pie medía diferente y el
            filete superior aparecía a tres alturas distintas en la misma fila
            (454 / 478 / 444px medidos). Reservando las tres líneas, el pie mide
            igual en todas las tarjetas, con oferta o sin ella. */}
          <p className="min-h-[1lh] text-sm font-normal text-muted line-through sm:text-base">
            {product.compareAtPrice
              ? formatPriceCOP(product.compareAtPrice)
              : null}
          </p>

          {/* La sombra dura va en el precio y en el nombre, no en el resto
              del pie: el tachado y la disponibilidad son texto gris pequeño y
              oscurecerles el borde se los come. */}
          <p className="vp-plano-texto text-xl font-bold sm:text-[1.75rem]">
            {formatPriceCOP(product.price)}
          </p>

          {/* `min-h-8`: la etiqueta pixel "Agotado" mide 30px (10px de fuente a
            1.8 de interlineado, más `py-1` y 2px de borde) y el texto de stock
            28px. Con `min-h-7` esa diferencia de 2px dejaba el filete de una
            tarjeta 2px por debajo del de sus vecinas. */}
          <div className="mt-2 flex min-h-8 items-center">
            {isAvailable ? (
              <span className="text-xs font-semibold text-action sm:text-sm">
                {formatNumberCO(product.stock)} disponibles
              </span>
            ) : (
              <PixelLabel variant="outline" className="px-1.5 sm:px-2.5">
                Agotado
              </PixelLabel>
            )}
          </div>
        </div>

      {/* EL BOTÓN ES HIJO DIRECTO DE LA ESCENA, NO DEL PIE.
          Estaba dentro del pie, y ahí su altura no hacía nada: la proyección
          3D solo baja un nivel desde `.vp-escena`. Medido sobre esta misma
          tarjeta, con el botón anidado y `translateZ(200px)` encima, su caja
          se queda en 280.42px —la misma que sin Z— incluso poniendo
          `transform-style: preserve-3d` en el pie y comprobando que el valor
          computado es `preserve-3d` y que el botón tiene su `matrix3d`. La
          misma Z aplicada al pie, que sí es hijo directo, lo lleva de 280.42 a
          304.72. Sacarlo del pie es lo único que hace que la Z surta efecto.

          Mover un botón en el DOM no es gratis, así que: sigue siendo el
          último elemento de la tarjeta, en el mismo punto del orden de
          tabulación y del orden de lectura, con el mismo `aria-label`. El pie
          conserva `mt-auto`, que sigue empujando pie y botón contra el borde
          inferior.

          VUELA MÁS ALTO QUE NADA (60px): es el único CTA primario de la
          tarjeta y lo que se pulsa. El área táctil viaja con él —es la misma
          caja transformada—, así que los 44px de alto mínimo se respetan donde
          se ve el botón, no donde estaría sin proyectar.

          Lleva `vp-plano-sombra` y no `vp-plano-texto` porque tiene borde: la
          sombra dura de caja es para las piezas con contorno —etiquetas,
          chapas y este botón— y la de texto para los bloques que no lo
          tienen. */}
      {actionHref && (
        <Button
          variant="secondary"
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={
            isAvailable
              ? `Pedir por WhatsApp ${product.name}`
              : `Consultar reposición de ${product.name}`
          }
          className={cn(
            // `px-1.5` sobrescribe el `px-6` de la variante (vía `twMerge`):
            // 48px de relleno horizontal no caben en una tarjeta de 2
            // columnas. El alto mínimo de 44px no se toca.
            "vp-plano vp-plano-sombra [--vp-plano:60px] mt-4 w-full px-1.5 sm:px-6",
            !isAvailable && "border-muted text-muted",
          )}
        >
          {/* El icono es decorativo (`aria-hidden`) y es lo primero que se
            sacrifica: por debajo de 360px el contenido del botón mide
            112px (16 + 8 + 88) contra 94px útiles, y al estar centrado el
            desborde recorta el rótulo por los dos lados. */}
          <MessageCircle
            className="hidden size-4 shrink-0 xs:block"
            aria-hidden="true"
          />
          {/* Rótulo corto en móvil. El `aria-label` del botón mantiene la
            frase completa, así que el lector de pantalla no pierde nada. */}
          <span className="sm:hidden">
            {isAvailable ? "Pedir" : "Consultar"}
          </span>
          <span className="hidden sm:inline">
            {isAvailable ? "Pedir por WhatsApp" : "Consultar reposición"}
          </span>
        </Button>
      )}
      </div>
    </Surface>
  );
}
