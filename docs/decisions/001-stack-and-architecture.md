# ADR-001: Elección de Stack y Arquitectura Desacoplada

## Estado
Aprobado

## Contexto
Se requiere desarrollar una plataforma web para una tienda de vaporizadores ("Vapeupar") en Valledupar. La plataforma necesita presentar una landing page atractiva, un catálogo de productos con filtrado ágil (categorías, marcas, niveles de nicotina, sabores), soporte para verificación de edad (+18) y un flujo de compra rápido adaptado al mercado local.

## Decisión
1. **Frontend**:
   - **Next.js 16 (App Router) + React 19 + TypeScript**: Para lograr renderizado optimizado en servidor (SSR) para SEO orgánico, componentes interactivos de catálogo con Client Components, y estilos con **Tailwind CSS v4**.
2. **Backend**:
   - **Node.js + Express + TypeScript**: Para proporcionar una API REST desacoplada que gestione el catálogo, filtros y estado de inventario de forma independiente.
3. **Flujo de Conversión**:
   - Botón directo de compra por WhatsApp complementado con catálogo interactivo y carrito local. Esto maximiza la conversión en Colombia y evita problemas de rechazo en pasarelas de pago tradicionales por políticas de restricción de nicotina.
4. **Cumplimiento Legal**:
   - Implementación de un Age Verification Modal bloqueante y advertencias sanitarias en el footer conforme a las regulaciones de venta de productos con nicotina.

## Consecuencias
- Desacoplamiento total entre frontend y backend: la API puede servir en el futuro tanto a la web como a aplicaciones móviles o sistemas de punto de venta (POS).
- Rendimiento ultra rápido y SEO indexable gracias a Next.js Server Components.
- Facilidad de escalado hacia bases de datos relacionales (PostgreSQL / Prisma) cuando el catálogo aumente.
