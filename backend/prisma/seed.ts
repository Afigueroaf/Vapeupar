import 'dotenv/config';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, parse, resolve } from 'node:path';
import { humanize, imageKeys, slugify } from '../src/catalog/image-keys.js';
import { disconnectPrisma, getPrisma } from '../src/db/prisma.js';
import { ProductCategory, VariantKind } from '../src/generated/prisma/enums.js';

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

interface LineSeed {
  /** Carpeta dentro de `products/`. */
  dir: string;
  slug: string;
  name: string;
  /** Imagen de la línea dentro de la carpeta; el resto de archivos son variantes. */
  lineImage: string;
  category: ProductCategory;
  variantKind: VariantKind;
}

interface BrandSeed {
  dir: string;
  slug: string;
  name: string;
  logo: string;
  isPartner: boolean;
  lines: LineSeed[];
}

// Categorías PROVISIONALES, deducidas de las imágenes de línea: ONE es un
// dispositivo que se vende por color; ECO 3, ECO PRO y FIT son equipos con
// cápsulas o líquido precargado que se venden por sabor. Confirmar con el
// catálogo del proveedor y corregir desde la consola: la semilla no
// sobrescribe ediciones posteriores.
const CATALOG: BrandSeed[] = [
  {
    dir: 'lifepod',
    slug: 'lifepod',
    name: 'LifePod',
    logo: 'logo_lifePod_white.svg',
    isPartner: true,
    lines: [
      { dir: 'eco-3', slug: 'lifepod-eco-3', name: 'LifePod ECO 3', lineImage: 'eco-3.webp',
        category: ProductCategory.disposables, variantKind: VariantKind.flavor },
      { dir: 'eco.pro', slug: 'lifepod-eco-pro', name: 'LifePod ECO PRO', lineImage: 'ECO-PRO.webp',
        category: ProductCategory.disposables, variantKind: VariantKind.flavor },
      { dir: 'ONE', slug: 'lifepod-one', name: 'LifePod ONE', lineImage: 'one.webp',
        category: ProductCategory.pod_systems, variantKind: VariantKind.color },
      { dir: 'fit', slug: 'lifepod-fit', name: 'LifePod FIT', lineImage: 'FIT.webp',
        category: ProductCategory.disposables, variantKind: VariantKind.flavor },
    ],
  },
];

const IMAGE_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.svg']);

interface VariantFile {
  name: string;
  slug: string;
  extension: string;
}

function readVariants(lineDir: string, lineImage: string): VariantFile[] {
  const files = readdirSync(lineDir).filter(
    (file) => file !== lineImage && IMAGE_EXTENSIONS.has(extname(file).toLowerCase()),
  );

  const variants = files
    .map((file) => {
      const { name, ext } = parse(file);
      return { name: humanize(name), slug: slugify(name), extension: ext.toLowerCase() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const seen = new Set<string>();
  for (const variant of variants) {
    if (seen.has(variant.slug)) {
      throw new Error(`Variante duplicada "${variant.slug}" en ${lineDir}`);
    }
    seen.add(variant.slug);
  }
  return variants;
}

function requireFile(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`No existe ${path}. ¿Está la carpeta assets/brands en el repositorio local?`);
  }
}

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
