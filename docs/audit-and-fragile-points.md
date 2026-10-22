# Auditoría Técnica y Diagnóstico de Puntos Frágiles - Vapeupar

Fecha de Auditoría: 21 de Octubre de 2026  
Estado del Proyecto: Fase Inicial (Setup e Infraestructura Base)  
Alcance: Backend (`backend/`), Frontend (`frontend/`), Documentación (`docs/`) y Skills (`.agents/skills/`, `.claude/skills/`).

---

## 1. Resumen Ejecutivo

El setup inicial montó con éxito una estructura desacoplada con Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind CSS v4 y un servicio Express estructurado. Sin embargo, una auditoría profunda de código, seguridad y arquitectura reveló **14 puntos frágiles clave** categorizados por severidad que deben subsanarse para garantizar resiliencia, seguridad jurídica y escalabilidad técnica.

---

## 2. Matriz de Puntos Frágiles Identificados

### A. Puntos Críticos / Alta Severidad (🔴 MAJOR)

| ID | Área | Descripción del Punto Frágil | Impacto Técnico / Negocio |
|:---|:-----|:-----------------------------|:--------------------------|
| **F-01** | Backend | **Dependencia Zod instalada pero no implementada**. Las rutas Express reciben `query` y `params` sin validación de esquemas Zod, violando la regla mandatoria del proyecto. | Parámetros inválidos, tipos forzados (`as ProductCategory`) que silenciosamente retornan vacío o fallan. |
| **F-02** | Backend | **Ausencia de Rate Limiting y Cabeceras de Seguridad**. No existen middlewares de limitación de tasa (`express-rate-limit`) ni `helmet`. | Vulnerabilidad a saturación por DoS/fuerza bruta, carencia de protecciones XSS/Clickjacking en cabeceras HTTP. |
| **F-03** | Frontend | **Comodín peligroso `hostname: "**"` en `next.config.ts`**. Permite que `next/image` procese URLs de cualquier dominio remoto arbitrario. | Vector potencial de SSRF (Server-Side Request Forgery) a través de imágenes manipuladas. |
| **F-04** | Frontend / Legal | **Mecanismo de Verificación +18 sin Expiración (TTL) ni Accesibilidad**. `localStorage` guarda `true` indefinidamente sin validar timestamp ni vigencia legal; falta trampa de foco y atributos `aria-modal="true"`, `role="dialog"`. | Incumplimiento de la promesa técnica documentada en `docs/security.md` y barrera de accesibilidad WCAG. |
| **F-05** | Frontend | **Ausencia de Menú de Navegación Móvil (Responsive)**. Los enlaces de categoría (`#desechables`, `#pods`, etc.) están ocultos en `<md` (`hidden md:flex`) sin menú hamburguesa. | Más del 85% del público meta navega en smartphones; los usuarios móviles quedan sin acceso a la navegación. |
| **F-06** | Frontend / UX | **Enlaces ancla rotos en Navbar**. La barra navega a `#desechables`, `#pods`, `#liquidos`, `#faq`, pero dichas secciones no tenían identificadores `id` correspondientes en el DOM. | Clics que no desplazan la página ni filtran la vista, deteriorando la experiencia de usuario. |
| **F-07** | Arquitectura | **Duplicación masiva de datos (135 líneas de `FALLBACK_PRODUCTS` en `page.tsx`)**. Hay divergencias de texto ("sabor refrescante a sandía helada" vs "sabor refrescante a sandía") entre el mock de frontend y backend. | Pérdida del principio de Fuente Única de Verdad (Single Source of Truth). |

---

### B. Puntos Moderados / Media Severidad (🟡 MINOR)

| ID | Área | Descripción del Punto Frágil |
|:---|:-----|:-----------------------------|
| **F-08** | Backend | **Falta de Paginación y Ordenamiento**. `getAll()` retorna siempre el arreglo completo sin soporte para `page`, `limit`, `sortBy`, `sortOrder`. |
| **F-09** | Backend | **Filtro `nicotine` definido en tipos pero no implementado**. `ProductFilters.nicotine` existía en TypeScript pero no en el servicio ni en la ruta. |
| **F-10** | Backend | **Falta de Middleware Global de Errores**. Los catch-blocks devuelven `error.message` directamente al cliente sin enmascaramiento en producción. |
| **F-11** | Frontend | **Tarjeta de Producto no valida `inStock`**. Muestra "Disponible" incondicionalmente aunque `stock === 0` o `inStock === false`. |
| **F-12** | Frontend | **Falta de Metadatos OpenGraph y Twitter Cards**. Enlaces compartidos en WhatsApp o redes sociales no generan previsualización rica (preview thumbnail). |
| **F-13** | Frontend | **Falta de Accesibilidad en Formularios y Tarjetas**. Input de búsqueda y selector de marca sin `<label>` o `aria-label`; tarjetas como `div` en vez de `<article>`. |
| **F-14** | Docs | **Discrepancias documentales**. Mención a carpeta inexistente `backend/src/config/`, lista incompleta de skills en `GEMINI.md`. |

---

## 3. Plan de Mitigación Inmediata

1. **Backend**:
   - Instalar `helmet` y `express-rate-limit`.
   - Crear esquemas Zod en `backend/src/schemas/product.schema.ts`.
   - Implementar validación middleware estricta de query params y slug.
   - Añadir paginación (`page`, `limit`), ordenamiento (`sortBy`, `sortOrder`) y filtro `nicotine` en `ProductService`.
   - Añadir middleware global de manejo de excepciones y sanitización.
2. **Frontend**:
   - Restringir dominios de imágenes en `next.config.ts`.
   - Implementar TTL de 30 días en `AgeVerificationModal` con accesibilidad ARIA completa (`role="dialog"`, trampa de foco).
   - Añadir menú hamburguesa responsive desplegable para dispositivos móviles en `Navbar`.
   - Añadir secciones e identificadores en la página principal (`#catalogo`, `#desechables`, `#pods`, `#liquidos`, `#faq`).
   - Corregir estado `inStock` en `ProductCard`.
   - Añadir OpenGraph y Twitter metadata en `layout.tsx`.
   - Centralizar el dataset fallback para evitar divergencias con el backend.
3. **Documentación & Skills**:
   - Actualizar `docs/backend.md`, `docs/frontend.md`, `docs/security.md` y `GEMINI.md` reflejando las implementaciones reales.
