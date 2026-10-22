# Plan de Mejora Integral y Evolución Arquitectónica - Vapeupar

Este documento detalla el plan de acción ejecutado para subsanar los puntos frágiles detectados durante la auditoría técnica inicial, así como la hoja de ruta para las siguientes iteraciones.

---

## Fase 1: Robustecimiento Inmediato (Ejecución Actual)

### 1.1 Backend: Seguridad y Validación Rigurosa
- **Instalación de Dependencias de Seguridad**:
  - `helmet`: Protección de cabeceras HTTP contra XSS, clickjacking y MIME-sniffing.
  - `express-rate-limit`: Prevención de saturación y ataques de denegación de servicio con ventana deslizante (100 peticiones por minuto por IP).
- **Validación con Esquemas Zod (`backend/src/schemas/`)**:
  - `ProductQuerySchema`: Valida `category` como enum estricto, `minPrice` y `maxPrice` como enteros positivos sin aceptar `NaN`, `search` con longitud máxima sanitizada, `nicotine` como filtro opcional, `page` y `limit` con topes seguros (máx 50 por página), `sortBy` (`price`, `name`, `puffs`) y `sortOrder` (`asc`, `desc`).
  - `ProductSlugSchema`: Valida formato alfanumérico seguro para prevenir inyecciones o reflejos en respuestas 404.
- **Evolución del Servicio (`ProductService`)**:
  - Soporte de ordenamiento dinámico.
  - Paginación con metadata (`total`, `page`, `limit`, `totalPages`).
  - Implementación del filtro por nivel de nicotina (`nicotine`).
  - Middleware de control de errores centralizado.

### 1.2 Frontend: Experiencia de Usuario, Accesibilidad y Cumplimiento Legal
- **Seguridad en `next/image`**:
  - Eliminación del comodín `**`. Restricción explícita únicamente a fuentes de confianza (`images.unsplash.com` y CDNs verificados).
- **Verificación de Edad Robusta con TTL**:
  - Almacenamiento con clave de expiración (ej. 30 días con timestamp numérico).
  - Si el timestamp superó el TTL, el modal vuelve a solicitar la confirmación de mayoría de edad.
  - Atributos de accesibilidad: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby` y captura de teclado.
- **Navegación Móvil Real (Mobile-First)**:
  - Componente Drawer / Menú Hamburguesa en `Navbar` para pantallas pequeñas con acceso rápido a categorías y soporte de WhatsApp.
- **Corrección de Enlaces y Secciones**:
  - Creación de anclas en el DOM para `#desechables`, `#pods`, `#liquidos` y sección interactiva `#faq` (Preguntas Frecuentes sobre envíos, medios de pago y originalidad).
- **Tarjeta de Producto (`ProductCard`) Accesible y Sincronizada con Stock**:
  - Conversión a elemento semántico `<article>`.
  - Verificación estricta de `inStock`: cuando es falso, desactiva el botón y muestra etiqueta "Agotado" en lugar de "Disponible".
  - Etiquetas descriptivas `aria-label` para lectores de pantalla.
- **SEO & Metadatos de Compartición (Social Previews)**:
  - Inclusión de metadatos `openGraph` y `twitter` en `layout.tsx` para generar vistas previas atractivas al compartir enlaces por WhatsApp o redes sociales.

---

## Fase 2: Persistencia y Escalabilidad (Próximos Pasos)
1. **Base de Datos Relacional**:
   - Migración de servicio en memoria a PostgreSQL con Prisma ORM o Drizzle.
   - Definición de tablas relacionales: `products`, `categories`, `brands`, `inventory_batches`, `orders`.
2. **Carrito de Compras Persistente & Checkout Avanzado**:
   - Integración de Zustand o React Context para el carrito de compras persistente en `localStorage`.
   - Generación de resumen de pedido estructurado con cálculo automático de costo de domicilio local en Valledupar.
3. **Panel de Administración (Backoffice Ligero)**:
   - Gestión de inventario rápido (actualizar stock, precio o activar/desactivar productos desde el móvil).
