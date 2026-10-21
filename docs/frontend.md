# Frontend - Vapeupar (Next.js & React)

## Propósito
El frontend de Vapeupar es la interfaz web del cliente y catálogo interactivo construido con **Next.js 16** (App Router), **React 19**, **Tailwind CSS v4** y **TypeScript**.

## Principales Funcionalidades
1. **Modal de Control de Edad (+18)**:
   - Bloquea la navegación de usuarios no verificados.
   - Guarda el estado en `localStorage` (`vapeupar_age_verified`).
   - Redirige en caso de rechazo para cumplimiento legal.
2. **Hero y Propuesta de Valor**:
   - Domicilio express local en Valledupar.
   - Garantía de originalidad con códigos QR verificables.
   - Pago contra entrega (Efectivo, Nequi, Daviplata).
3. **Catálogo Interactivo de Ventas**:
   - Filtrado en tiempo real por categoría (Desechables, Pods, Sales, E-líquidos, Resistencias).
   - Búsqueda instantánea por nombre de producto, marca o perfil de sabor (ej. Sandía, Mango, Mentol).
   - Filtro por marcas populares.
4. **Checkout Directo Asistido por WhatsApp**:
   - Botón de pedido instantáneo en cada producto con mensaje precargado codificado en URL.
   - Ideal para ventas en mercados latinoamericanos con alta conversión y bajo abandono de carrito.
5. **Advertencia Obligatoria de Salud**:
   - Aviso persistente en el footer sobre el consumo de nicotina y restricción para menores de 18 años.

## Estructura de Componentes
```
frontend/src/
├── app/
│   ├── layout.tsx                # Layout raíz con metadata, fonts y viewport
│   ├── page.tsx                  # Landing page principal con catálogo
│   └── globals.css               # Import de Tailwind v4 y variables CSS
├── components/
│   ├── age-verification-modal.tsx# Modal obligatorio +18
│   ├── navbar.tsx                # Barra de navegación con logo y accesos directos
│   ├── hero.tsx                  # Sección principal de alto impacto visual
│   ├── product-catalog.tsx       # Catálogo con filtros y estados
│   ├── product-card.tsx          # Tarjeta de producto con specs y botón WhatsApp
│   └── footer.tsx                # Pie de página con advertencia legal y cobertura
├── lib/
│   └── utils.ts                  # Utilidades (cn, formateo de moneda COP)
└── types/
    └── product.ts                # Interfaces de datos de productos y categorías
```

## Ejecución Local
- Iniciar en desarrollo (con Turbopack):
  ```bash
  npm run dev --workspace=frontend
  # O dentro de la carpeta frontend:
  npm run dev
  ```
  Acceso: `http://localhost:3000`
