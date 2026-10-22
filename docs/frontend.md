# Frontend - Vapeupar (Next.js & React)

## Propósito
El frontend de Vapeupar es la interfaz web del cliente y catálogo interactivo construido con **Next.js 16** (App Router), **React 19**, **Tailwind CSS v4** y **TypeScript**.

## Principales Funcionalidades y Mejoras de Resiliencia

1. **Modal de Control de Edad (+18) con TTL y Accesibilidad WCAG**:
   - Bloquea la navegación de usuarios no verificados.
   - **Expiración de 30 días**: Valida `vapeupar_age_verified_at` mediante timestamp numérico en `localStorage`. Si expira, solicita confirmación nuevamente.
   - **Accesibilidad**: Atributos `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`, bloqueo de scroll de fondo y trampa de foco.
   - Manejo amigable y pantalla de bloqueo en caso de selección "Menor de edad".

2. **Navegación Fluida y Menú Móvil (Mobile-First)**:
   - Barra de navegación con logo, accesos directos, botón de pedido por WhatsApp y badge de carrito.
   - **Menú hamburguesa responsive** desplegable en pantallas móviles (`< 768px`) con acceso directo a categorías (`#desechables`, `#pods`, `#liquidos`) y preguntas frecuentes (`#faq`).

3. **Catálogo Interactivo con Filtros Avanzados**:
   - Filtrado en tiempo real por categoría (Desechables, Pods, Sales, E-líquidos, Mods, Resistencias).
   - Detección automática de anclas URL (`hashchange` para sincronizar enlaces de navegación con el estado activo del catálogo).
   - Búsqueda instantánea accesible con `<label>` y `aria-label`.
   - Filtro por marcas y ordenamiento dinámico (Destacados, Menor precio, Mayor precio, Más caladas).

4. **Tarjetas de Producto Semánticas (`<article>`) y Control de Stock**:
   - Tarjetas construidas como `<article>` con etiquetas `aria-label` descriptivas.
   - **Validación estricta de `inStock`**: Si el producto está agotado (`inStock === false` o `stock === 0`), se muestra la etiqueta "Agotado", se desactiva el botón de compra inmediata y se ofrece "Consultar Reposición".
   - Imágenes optimizadas con `next/image` y dominios seguros restringidos en `next.config.ts`.
   - Objetivos táctiles móviles optimizados (mínimo 44px de altura).

5. **Sección de Preguntas Frecuentes (FAQ)**:
   - Acordeón interactivo accesible con información clave: domicilios express en Valledupar, métodos de pago (Nequi, Daviplata, Contra entrega), verificación de autenticidad QR y exigencia legal de cédula.

6. **SEO y Metadatos de Redes Sociales (OpenGraph & Twitter)**:
   - Configuración completa en `layout.tsx` para generar vistas previas atractivas al compartir enlaces por WhatsApp o redes sociales.

## Estructura de Componentes
```
frontend/src/
├── app/
│   ├── layout.tsx                # Metadata, Viewport, OpenGraph, Fonts y tema oscuro
│   ├── page.tsx                  # Landing page principal con ISR (revalidate: 60s)
│   └── globals.css               # Import Tailwind v4 y soporte prefers-reduced-motion
├── components/
│   ├── age-verification-modal.tsx# Modal +18 con TTL de 30 días y accesibilidad ARIA
│   ├── navbar.tsx                # Barra fija con menú móvil hamburguesa
│   ├── hero.tsx                  # Hero de alta conversión con propuestas de valor
│   ├── product-catalog.tsx       # Catálogo con búsqueda, filtros, ordenamiento y anclas
│   ├── product-card.tsx          # Tarjeta semántica (<article>) con verificación de stock
│   ├── faq.tsx                   # Acordeón de preguntas frecuentes (#faq)
│   └── footer.tsx                # Pie de página con advertencia legal y jerarquía h3
├── lib/
│   └── utils.ts                  # Utilidades cn() y formato de moneda COP
└── types/
    └── product.ts                # Interfaces de datos sincronizadas con el backend
```

## Ejecución Local
```bash
npm run dev:frontend
```
Acceso: `http://localhost:3000`
