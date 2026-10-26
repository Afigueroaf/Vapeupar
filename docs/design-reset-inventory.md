# Inventario de Reemplazo de Diseño (Design Reset)

> **Premisa del proyecto**: la interfaz actual es un **lienzo de trabajo**, no un diseño.
> Fue construida con los valores por defecto de `create-next-app` + Tailwind (fuentes Geist,
> paleta `zinc`/`emerald`/`cyan`, esquinas redondeadas, iconos Lucide) para validar la
> arquitectura, el flujo de datos y el cumplimiento legal.
>
> **Nada de la capa visual actual debe permanecer en el diseño terminado.**
> Este documento es el inventario exhaustivo de lo que se reemplaza, por qué, y qué lo sustituye.
> El plan de ejecución de los primeros cambios está en [`design-execution-plan.md`](./design-execution-plan.md).

---

## 0. Cómo leer este documento

| Marca | Significado |
|---|---|
| 🔴 **Reemplazar** | Se elimina por completo. No sobrevive al rediseño. |
| 🟡 **Rediseñar** | El elemento es necesario (función o requisito legal), pero su capa visual se rehace desde cero. |
| 🟢 **Conservar** | Lógica, accesibilidad o seguridad que **no** se toca. Solo cambia su presentación. |

---

## 1. Tipografía

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 1.1 | `Geist` y `Geist_Mono` (fuentes por defecto del template de Next.js) | `src/app/layout.tsx` | 🔴 Reemplazar | **Oxanium** (400/600/700) como fuente principal |
| 1.2 | No existe fuente secundaria ni voz decorativa | — | 🔴 Añadir | **Press Start 2P** (400) limitada a etiquetas cortas (10–15 % del texto) |
| 1.3 | No existe escala tipográfica. Cada componente inventa su tamaño: `text-[10px]`, `text-[11px]`, `text-xs`, `text-base`, `text-7xl` | `hero.tsx`, `product-card.tsx`, `footer.tsx`, `navbar.tsx` | 🔴 Reemplazar | Escala de tokens con jerarquía declarada (display / section / product / price / nav / label) |
| 1.4 | Pesos arbitrarios y contradictorios: `font-black`, `font-extrabold`, `font-bold`, `font-semibold`, `font-medium` mezclados sin regla | todos los componentes | 🔴 Reemplazar | Solo **700 / 600 / 400** con uso documentado por rol |
| 1.5 | `font-feature-settings: "rlig" 1, "calt" 1` heredado del template (ajuste pensado para Geist) | `src/app/globals.css` | 🔴 Eliminar | Ajustes propios de Oxanium (`letter-spacing` por nivel) |
| 1.6 | `tracking-tight` aplicado por inercia a casi todos los títulos | `hero.tsx`, `navbar.tsx`, `product-catalog.tsx`, `footer.tsx` | 🔴 Reemplazar | Tracking definido por token; Oxanium es angular y pide tracking distinto (incluido positivo en etiquetas) |

---

## 2. Color

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 2.1 | Paleta genérica de plantilla: `emerald-500` (primario), `cyan-400` (acento), escala `zinc-*` completa | `globals.css` + todos los componentes | 🔴 Reemplazar | Paleta VP: `#080808`, `#F5F5F5`, `#D7FF00`, `#8B35FF`, `#202020` |
| 2.2 | **Las variables CSS de `:root` no se usan.** `--background`, `--card`, `--primary`, `--accent`, `--muted`, `--border` están declaradas pero ningún componente las consume: todos usan clases `zinc-*`/`emerald-*` hardcodeadas | `globals.css` vs. componentes | 🔴 Reemplazar | Tokens reales vía `@theme` de Tailwind v4, consumidos por todos los componentes. Cero colores literales en JSX |
| 2.3 | Doble fuente de verdad del fondo: `body { background-color: var(--background) }` en CSS **y** `className="bg-zinc-950 text-zinc-100"` en el `<body>` | `globals.css` + `layout.tsx` | 🔴 Reemplazar | Una sola declaración basada en tokens |
| 2.4 | Gradientes de dos tonos como recurso principal de marca: logo (`from-emerald-500 to-cyan-400`), CTA del hero (`from-emerald-500 to-teal-400`), texto del H1 (`from-emerald-400 via-teal-300 to-cyan-400`), fondo de sección (`from-zinc-950 via-zinc-900 to-zinc-950`) | `navbar.tsx`, `hero.tsx` | 🔴 Reemplazar | Color plano + contraste geométrico. El gradiente degradado no pertenece a la identidad VP |
| 2.5 | Colores fuera de paleta usados como semántica ad-hoc: `amber-*` (badge "Top Ventas", advertencia legal), `red-500` (badge "Oferta") | `product-card.tsx`, `footer.tsx` | 🔴 Reemplazar | Sistema de etiquetas dentro de los 5 colores. Si se necesita un color de alerta, se añade a la paleta de forma explícita y documentada |
| 2.6 | `className="dark"` fijo en `<html>` sin modo claro ni estrategia de tema | `layout.tsx` | 🟡 Rediseñar | Decisión explícita: VP es dark-only por identidad → eliminar la clase huérfana y declararlo en los tokens |
| 2.7 | Transparencias decorativas sin sistema: `bg-zinc-900/60`, `/80`, `/85`, `/40`, `border-zinc-800/60`, `/80`, `shadow-emerald-950/20` | todos los componentes | 🔴 Reemplazar | Superficies opacas + bordes sólidos. La opacidad deja de ser el recurso de jerarquía |
| 2.8 | Focus rings en `emerald-400` | `product-card.tsx`, `product-catalog.tsx`, `faq.tsx` | 🟡 Rediseñar | Focus visible en verde lima `#D7FF00`, revalidado contra la nueva paleta |

---

## 3. Forma, geometría y profundidad

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 3.1 | Lenguaje de esquinas blandas en toda la interfaz: `rounded-xl`, `rounded-2xl`, `rounded-lg`, `rounded-full`, `rounded-md` | todos los componentes | 🔴 Reemplazar | **Tarjetas geométricas**: esquina recta o chaflán, radio mínimo |
| 3.2 | Bordes de 1px translúcidos (`border-zinc-800/60`) como única separación | todos los componentes | 🔴 Reemplazar | **Bordes gruesos** (2px+) y sólidos como recurso estructural |
| 3.3 | Sombras de color difusas: `shadow-emerald-500/20`, `shadow-emerald-500/25`, `shadow-xl` | `navbar.tsx`, `hero.tsx`, `product-card.tsx` | 🔴 Eliminar | Profundidad por desplazamiento duro (offset) o por contraste de borde, no por glow |
| 3.4 | "Ambient glows": dos `div` decorativos con `size-96`/`size-80` + `blur-3xl` en emerald y cyan | `hero.tsx` | 🔴 Eliminar | Composición geométrica; el protagonismo visual pasa a producto/3D |
| 3.5 | `backdrop-blur-lg` + fondo semitransparente en la barra fija | `navbar.tsx` | 🟡 Rediseñar | Barra con tratamiento propio (sólida o con regla gruesa inferior) |
| 3.6 | Pills redondeadas (`rounded-full`) como contenedor de todas las etiquetas | `hero.tsx`, `product-card.tsx`, `faq.tsx` | 🔴 Reemplazar | Etiquetas rectangulares tipo HUD/arcade con Press Start 2P |
| 3.7 | No existe sistema de espaciado. Valores ad-hoc: `py-16 sm:py-24`, `py-3`, `p-4`, `px-4 sm:px-6`, `mt-14`, `gap-2.5`, `pb-4` | todos los componentes | 🔴 Reemplazar | Escala de espaciado basada en tokens |

---

## 4. Marca, logo e iconografía

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 4.1 | **El logo es un icono genérico**: `Flame` de Lucide dentro de un cuadrado con gradiente | `navbar.tsx`, `footer.tsx` | 🔴 Reemplazar | Logo **VP®** real como SVG en `public/` |
| 4.2 | Bloque de marca "VAPEUPAR" + pill "Valledupar" en verde | `navbar.tsx` | 🔴 Reemplazar | Lockup tipográfico VP definido por el sistema de marca |
| 4.3 | `favicon.ico` por defecto del template de Next.js | `src/app/favicon.ico` | 🔴 Reemplazar | Favicon + icon set VP (incluye `apple-icon` y versión maskable) |
| 4.4 | Basura del template en `public/`: `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` | `frontend/public/` | 🔴 Eliminar | Solo assets VP |
| 4.5 | **22 iconos de Lucide** con estilo lineal redondeado neutro: `Flame`, `MessageCircle`, `ShoppingBag`, `Menu`, `X`, `ArrowDown`, `Zap`, `ShieldCheck`, `Truck`, `Sparkles`, `Check`, `XCircle`, `Search`, `SlidersHorizontal`, `PackageSearch`, `ChevronDown`, `HelpCircle`, `ShieldAlert`, `MapPin`, `Phone`, `Clock`, `CheckCircle`, `Ban`, `AlertTriangle` | todos los componentes | 🟡 Rediseñar | Decisión de set: iconografía angular/geométrica coherente con Oxanium (o Lucide con `strokeWidth` y tamaños normalizados por token). Ningún icono se deja "porque venía incluido" |
| 4.6 | Iconos decorativos dentro de etiquetas (`Sparkles` en el badge del hero, `HelpCircle` en FAQ) | `hero.tsx`, `faq.tsx` | 🔴 Eliminar | La etiqueta pixel sustituye al icono decorativo |

---

## 5. Composición y layout

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 5.1 | Estructura de landing genérica: secciones apiladas full-width, todas `max-w-7xl` centradas | `page.tsx` + secciones | 🔴 Reemplazar | Composición editorial con jerarquía, asimetría intencional y ritmo propio |
| 5.2 | Hero centrado con `text-center` y todo el contenido en columna | `hero.tsx` | 🔴 Reemplazar | Composición con etiqueta superior, titular de gran escala y **espacio reservado para modelo 3D de producto** |
| 5.3 | Grid de catálogo uniforme 1 / 2 / 3 columnas, todas las tarjetas idénticas | `product-catalog.tsx` | 🔴 Reemplazar | Grid con jerarquía (destacados a mayor escala), densidad revisada |
| 5.4 | Barra de filtros como fila de pills con scroll horizontal + dos `<select>` nativos | `product-catalog.tsx` | 🟡 Rediseñar | Controles con lenguaje VP; los `<select>` nativos no son estilizables de forma consistente |
| 5.5 | Anclas invisibles (`<div id="desechables" />`, `#pods`, `#liquidos`) como parche de navegación | `product-catalog.tsx` | 🟡 Rediseñar | Navegación real por categoría (rutas o secciones con identidad propia) |
| 5.6 | **La aplicación tiene una sola ruta** (`/`). No hay página de producto, ni colecciones, ni "nosotros" | `src/app/` | 🔴 Añadir | Mínimo: `/producto/[slug]`, `/coleccion/[categoria]`, `/nosotros` (la navegación propuesta ya los nombra) |
| 5.7 | Hero: módulo de 3 "value props" con icono + 2 líneas de texto y borde superior | `hero.tsx` | 🔴 Reemplazar | Módulo de confianza rediseñado (o reubicado fuera del hero) |

---

## 6. Contenido y copy

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 6.1 | H1 descriptivo de catálogo: *"Los mejores vaporizadores, pods y sales con entrega inmediata"* | `hero.tsx` | 🔴 Reemplazar | Titular de marca, corto y en voz VP (dirección propuesta: **"LEVEL UP YOUR STYLE."**) |
| 6.2 | Badge superior: *"Vape Shop Líder en Valledupar • Domicilios Inmediatos"* | `hero.tsx` | 🔴 Reemplazar | Etiqueta pixel tipo **`[ SYSTEM ONLINE ]`** |
| 6.3 | Navegación: Catálogo / Desechables / Pods Recargables / Líquidos & Sales / Preguntas | `navbar.tsx` | 🔴 Reemplazar | **VP® · TIENDA · COLECCIONES · NOSOTROS** |
| 6.4 | CTAs: "Explorar Catálogo", "Hablar con un Asesor", "Pedir por WhatsApp" | `hero.tsx`, `navbar.tsx`, `product-card.tsx` | 🔴 Reemplazar | **"EXPLORAR TIENDA ↗"** y sistema de CTA coherente en Oxanium 700 |
| 6.5 | Badges de producto en español mezclado: "Top Ventas", "Oferta", "Disponible (24 un.)", "Agotado" | `product-card.tsx` | 🔴 Reemplazar | Sistema de etiquetas: **`NEW DROP`**, **`LVL 01`**, estados de stock con voz unificada |
| 6.6 | Flag `isNewArrival` definido en el tipo **pero nunca renderizado** | `types/product.ts`, `product-card.tsx` | 🟡 Rediseñar | Alimenta la etiqueta `NEW DROP` |
| 6.7 | Nombres de producto largos cortados con `line-clamp-1` | `product-card.tsx` | 🟡 Rediseñar | Jerarquía de nombre (marca / modelo / sabor) en lugar de truncado |
| 6.8 | Footer de 4 columnas con estructura de plantilla corporativa | `footer.tsx` | 🔴 Reemplazar | Footer VP |
| 6.9 | **Datos de contacto son placeholders**: `+573001234567` (teléfono y WhatsApp por defecto en 4 archivos), `https://vapeupar.com` sin verificar | `footer.tsx`, `navbar.tsx`, `hero.tsx`, `product-card.tsx`, `layout.tsx` | 🔴 Reemplazar | Datos reales vía variables de entorno; eliminar todos los valores por defecto hardcodeados |
| 6.10 | `const currentYear = 2026;` hardcodeado | `footer.tsx` | 🔴 Reemplazar | Año calculado o campo de contenido |
| 6.11 | Copy de las 5 preguntas de FAQ escrito como relleno de validación | `faq.tsx` | 🟡 Rediseñar | Contenido revisado con el negocio |

---

## 7. Imágenes y assets

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 7.1 | **Las 6 imágenes de producto son fotos de stock de Unsplash que no corresponden a los productos** (`images.unsplash.com/photo-1527661591475…`, etc.) | `page.tsx`, `backend/src/data/mock-products.ts` | 🔴 Reemplazar | Fotografía real del inventario + **renders 3D** de dispositivos |
| 7.2 | Imagen de OpenGraph/Twitter apunta a la misma foto de Unsplash | `layout.tsx` | 🔴 Reemplazar | OG image propia con el lockup VP |
| 7.3 | `remotePatterns` solo autoriza `images.unsplash.com` | `next.config.ts` | 🔴 Reemplazar | Dominio del CDN/almacenamiento real de VP |
| 7.4 | Tratamiento de imagen: `object-cover` en contenedor `aspect-square` con `bg-zinc-950/80` | `product-card.tsx` | 🔴 Reemplazar | Tratamiento de producto definido (fondo, recorte, sombra, ángulo) |
| 7.5 | No existe infraestructura ni espacio de layout para modelos 3D, que son un pilar de la dirección visual | — | 🔴 Añadir | Decisión técnica (secuencia de imágenes, `<model-viewer>` o React Three Fiber) + presupuesto de peso |

---

## 8. Interacción y movimiento

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 8.1 | Hovers genéricos de plantilla: `hover:scale-105`, `active:scale-[0.98]`, `hover:opacity-95`, `group-hover:scale-105` | `navbar.tsx`, `hero.tsx`, `product-card.tsx` | 🔴 Reemplazar | Micro-interacciones con carácter (desplazamiento duro, inversión de color, glitch contenido) |
| 8.2 | `transition` sin duración ni easing declarados en la mayoría de elementos | todos los componentes | 🔴 Reemplazar | Tokens de duración y easing |
| 8.3 | No hay estados de carga, skeletons ni animación de entrada del catálogo | `product-catalog.tsx` | 🔴 Añadir | Estados de carga con identidad |
| 8.4 | Estado vacío del catálogo: caja de borde discontinuo con icono `PackageSearch` | `product-catalog.tsx` | 🔴 Reemplazar | Estado vacío con voz VP |
| 8.5 | `prefers-reduced-motion` ya implementado | `globals.css` | 🟢 Conservar | Debe cubrir también el movimiento y el 3D que se añadan |

---

## 9. Modal +18, FAQ y accesibilidad

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 9.1 | **Lógica del modal +18**: TTL de 30 días con timestamp, `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, trampa de foco, bloqueo de scroll, pantalla de rechazo | `age-verification-modal.tsx` | 🟢 Conservar | Intacta. Es cumplimiento legal y accesibilidad ya ganada |
| 9.2 | Capa visual del modal +18 (iconos `ShieldAlert`/`CheckCircle`/`Ban`, esquinas redondeadas, paleta emerald/amber) | `age-verification-modal.tsx` | 🔴 Reemplazar | Es la primera pantalla que ve el usuario → debe ser la expresión más fuerte de la marca |
| 9.3 | Acordeón de FAQ: `aria-expanded` correcto, pero sin marcado `<dl>`/heading y el panel se desmonta al cerrar | `faq.tsx` | 🟡 Rediseñar | Marcado semántico y animación de apertura |
| 9.4 | Advertencia legal de salud (Ley 1335 de 2009) en el footer | `footer.tsx` | 🟢 Conservar (texto) / 🔴 Reemplazar (visual) | El texto es requisito legal y no se recorta. Su presentación en caja `amber` sí se rehace |
| 9.5 | Objetivos táctiles `min-h-[44px]` en CTAs e inputs | `product-card.tsx`, `product-catalog.tsx` | 🟢 Conservar | Se mantiene como regla del nuevo sistema |
| 9.6 | `maximumScale: 5` en viewport (permite zoom) | `layout.tsx` | 🟢 Conservar | — |
| 9.7 | Contraste: la paleta actual pasa AA. **La paleta nueva exige revalidación** | — | 🔴 Verificar | Ver §11 |

---

## 10. Deuda estructural que bloquea el rediseño

| # | Estado actual | Archivo | Acción | Destino |
|---|---|---|---|---|
| 10.1 | **160+ líneas de datos de producto (`FALLBACK_PRODUCTS`) incrustadas dentro del componente de página**, duplicando `backend/src/data/mock-products.ts` | `src/app/page.tsx` | 🔴 Reemplazar | Extraer a `src/data/fallback-products.ts`. La página debe ser composición visual, no almacén de datos |
| 10.2 | No existe capa de primitivas de UI. Cada componente repite `rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-bold…` | todos los componentes | 🔴 Añadir | `src/components/ui/` con primitivas (superficie, botón, etiqueta, campo) |
| 10.3 | Número de WhatsApp y textos de mensaje repetidos en 4 componentes con el mismo valor por defecto | `navbar.tsx`, `hero.tsx`, `product-card.tsx`, `footer.tsx` | 🔴 Reemplazar | Módulo único de configuración de contacto |
| 10.4 | `src/lib/utils.ts` expone `cn()` y `formatPriceCOP()`, pero **`cn()` no se usa en ningún componente** | `lib/utils.ts` | 🟡 Rediseñar | Las primitivas nuevas sí deben usarlo para resolver variantes |
| 10.5 | La documentación (`docs/frontend.md`) describe la capa visual actual como si fuera definitiva | `docs/frontend.md` | 🟡 Rediseñar | Separar "funcionalidad" de "diseño" y apuntar a este inventario |

---

## 11. Verificaciones de contraste de la paleta nueva

Ratios WCAG calculados sobre la paleta propuesta:

| Combinación | Ratio | Veredicto |
|---|---|---|
| `#F5F5F5` sobre `#080808` | **18.4 : 1** | ✅ AAA. Par de texto principal |
| `#D7FF00` sobre `#080808` | **17.4 : 1** | ✅ AAA. Apto para texto y acentos |
| `#080808` sobre `#D7FF00` | **17.4 : 1** | ✅ AAA. Botón lima con texto negro |
| `#8B35FF` sobre `#080808` | **3.9 : 1** | ⚠️ **Falla AA para texto normal.** Solo texto grande (≥24px, o ≥19px en bold), bordes y elementos decorativos |
| `#F5F5F5` sobre `#202020` | **14.9 : 1** | ✅ AAA. Texto sobre panel |
| `#202020` sobre `#080808` | **1.2 : 1** | ⚠️ El panel es casi indistinguible del fondo → **los paneles requieren borde visible**, lo cual es coherente con la dirección de bordes gruesos |

**Reglas que se derivan:**

1. El violeta `#8B35FF` nunca lleva texto pequeño encima ni se usa como texto pequeño sobre negro. Es acento Y2K, borde y relleno de bloque.
2. El verde lima `#D7FF00` es el color de acción. **Un solo CTA primario por vista.**
3. Las superficies `#202020` siempre se delimitan con borde, no por contraste de fondo.
4. **Press Start 2P a 8–10px es un riesgo real de legibilidad.** Regla del sistema: mínimo **10px** con `letter-spacing` positivo y `line-height` holgado; nunca para texto esencial, párrafos, nombres de producto, precios ni formularios.

---

## 12. Resumen de lo que sobrevive

Solo **lógica**, nunca presentación:

- Modal +18: TTL de 30 días, ARIA completo, trampa de foco, bloqueo de scroll.
- Texto de la advertencia legal sanitaria (Ley 1335 de 2009).
- Validación estricta de `inStock` / `stock` antes de ofrecer compra.
- Sincronización de estado del catálogo por `hashchange`.
- ISR con `revalidate: 60` y degradación a datos de respaldo si el backend está caído.
- `next/image` con `remotePatterns` explícitos (cambia el dominio, no la regla).
- `prefers-reduced-motion`.
- Objetivos táctiles de 44px y `maximumScale: 5`.
- Backend completo: Zod, Helmet, rate limit, paginación, ordenamiento.

Todo lo demás —fuentes, colores, radios, sombras, bordes, espaciado, iconos, imágenes, copy, composición y micro-interacciones— se rehace.
