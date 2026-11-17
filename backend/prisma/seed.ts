import 'dotenv/config';
import { extname, join, resolve } from 'node:path';
import { CATALOG, readVariants, requireFile } from '../src/catalog/catalog-assets.js';
import { imageKeys } from '../src/catalog/image-keys.js';
import { disconnectPrisma, getPrisma } from '../src/db/prisma.js';

/**
 * Semilla del catálogo desde `assets/brands/<marca>/products/<linea>/`
 * (plan A1.3).
 *
 * - Idempotente y conservadora: crea lo que falta y NO sobrescribe lo que ya
 *   existe, para no pisar lo que se edite después desde la consola. Volver a
 *   ejecutarla solo añade marcas, líneas o variantes nuevas.
 * - No inventa precios ni stock: las líneas nacen en `draft` sin precio, y el
 *   stock entra por la consola como movimientos de `inbound`.
 * - No envía correos ni crea usuarios.
 *
 * Corre como `vapeupar_app` (DATABASE_URL), así que también comprueba que el
 * rol de la aplicación tiene los permisos que necesita.
 */

const ASSETS_DIR = resolve(__dirname, '../../assets/brands');

// El catálogo de partida (marcas, líneas, carpetas) vive en
// `src/catalog/catalog-assets.ts`: lo comparte con la carga de imágenes al
// bucket (`scripts/upload-catalog-images.ts`), que deriva las mismas claves.

async function main(): Promise<void> {
  const prisma = getPrisma();
  const before = {
    brands: await prisma.brand.count(),
    products: await prisma.product.count(),
    variants: await prisma.variant.count(),
  };

  for (const brandSeed of CATALOG) {
    const brandDir = join(ASSETS_DIR, brandSeed.dir);
    requireFile(join(brandDir, brandSeed.logo));

    // Lectura de disco antes de abrir la transacción: si falta un archivo, no
    // se escribe nada de la marca.
    const lines = brandSeed.lines.map((line) => {
      const lineDir = join(brandDir, 'products', line.dir);
      requireFile(join(lineDir, line.lineImage));
      return { ...line, variants: readVariants(lineDir, line.lineImage) };
    });

    await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.upsert({
        where: { slug: brandSeed.slug },
        update: {},
        create: {
          slug: brandSeed.slug,
          name: brandSeed.name,
          isPartner: brandSeed.isPartner,
          logoKey: imageKeys.brandLogo(brandSeed.slug, extname(brandSeed.logo).toLowerCase()),
        },
      });

      for (const line of lines) {
        const product = await tx.product.upsert({
          where: { slug: line.slug },
          update: {},
          create: {
            slug: line.slug,
            name: line.name,
            brandId: brand.id,
            category: line.category,
            imageKey: imageKeys.productLine(line.slug, extname(line.lineImage).toLowerCase()),
          },
        });

        for (const [index, variant] of line.variants.entries()) {
          await tx.variant.upsert({
            where: { productId_slug: { productId: product.id, slug: variant.slug } },
            update: {},
            create: {
              productId: product.id,
              kind: line.variantKind,
              name: variant.name,
              slug: variant.slug,
              sortOrder: index,
              imageKey: imageKeys.variant(line.slug, variant.slug, variant.extension),
            },
          });
        }
      }
    }, { timeout: 60_000 });
  }

  const after = {
    brands: await prisma.brand.count(),
    products: await prisma.product.count(),
    variants: await prisma.variant.count(),
  };

  console.log('Semilla del catálogo aplicada:');
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    console.log(`  ${key}: ${after[key]} (${after[key] - before[key]} nuevos)`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
