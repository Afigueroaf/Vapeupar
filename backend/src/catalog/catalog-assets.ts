import { existsSync, readdirSync } from 'node:fs';
import { extname, join, parse } from 'node:path';
import { ProductCategory, VariantKind } from '../generated/prisma/enums.js';
import { humanize, imageKeys, slugify } from './image-keys.js';

/**
 * Catálogo de partida tal como está en `assets/brands/<marca>/products/<linea>/`.
 *
 * Lo comparten la semilla (`prisma/seed.ts`, que crea marcas, líneas y
 * variantes) y la carga de imágenes (`scripts/upload-catalog-images.ts`, que
 * sube los archivos al bucket): las dos derivan las claves de aquí, con las
 * mismas funciones de `image-keys.ts`, así que no pueden desalinearse.
 */

export interface LineSeed {
  /** Carpeta dentro de `products/`. */
  dir: string;
  slug: string;
  name: string;
  /** Imagen de la línea dentro de la carpeta; el resto de archivos son variantes. */
  lineImage: string;
  category: ProductCategory;
  variantKind: VariantKind;
}

export interface BrandSeed {
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
export const CATALOG: BrandSeed[] = [
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

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export interface VariantFile {
  /** Nombre del archivo dentro de la carpeta de la línea. */
  file: string;
  name: string;
  slug: string;
  extension: string;
}

/** Variantes de una carpeta de línea: todo archivo de imagen salvo el de la línea. */
export function readVariants(lineDir: string, lineImage: string): VariantFile[] {
  const files = readdirSync(lineDir).filter(
    (file) => file !== lineImage && extname(file).toLowerCase() in CONTENT_TYPES,
  );

  const variants = files
    .map((file) => {
      const { name, ext } = parse(file);
      return { file, name: humanize(name), slug: slugify(name), extension: ext.toLowerCase() };
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

export function requireFile(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`No existe ${path}. ¿Está la carpeta assets/brands en el repositorio local?`);
  }
}

/** Una imagen del catálogo de partida: dónde está en disco y a qué fila y clave corresponde. */
export type CatalogAsset =
  | { target: 'brand'; brandSlug: string; path: string; key: string; contentType: string }
  | { target: 'product'; productSlug: string; path: string; key: string; contentType: string }
  | {
      target: 'variant';
      productSlug: string;
      variantSlug: string;
      path: string;
      key: string;
      contentType: string;
    };

function contentType(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Todas las imágenes de `assetsDir` (= `assets/brands`), con su clave canónica (sin versión). */
export function listCatalogAssets(assetsDir: string, catalog: BrandSeed[] = CATALOG): CatalogAsset[] {
  const assets: CatalogAsset[] = [];
  for (const brand of catalog) {
    const brandDir = join(assetsDir, brand.dir);
    const logo = join(brandDir, brand.logo);
    requireFile(logo);
    assets.push({
      target: 'brand',
      brandSlug: brand.slug,
      path: logo,
      key: imageKeys.brandLogo(brand.slug, extname(brand.logo).toLowerCase()),
      contentType: contentType(brand.logo),
    });

    for (const line of brand.lines) {
      const lineDir = join(brandDir, 'products', line.dir);
      const lineImage = join(lineDir, line.lineImage);
      requireFile(lineImage);
      assets.push({
        target: 'product',
        productSlug: line.slug,
        path: lineImage,
        key: imageKeys.productLine(line.slug, extname(line.lineImage).toLowerCase()),
        contentType: contentType(line.lineImage),
      });
      for (const variant of readVariants(lineDir, line.lineImage)) {
        assets.push({
          target: 'variant',
          productSlug: line.slug,
          variantSlug: variant.slug,
          path: join(lineDir, variant.file),
          key: imageKeys.variant(line.slug, variant.slug, variant.extension),
          contentType: contentType(variant.file),
        });
      }
    }
  }
  return assets;
}

/** Fila del catálogo con su imagen actual, para decidir qué rellenar. */
export interface ImageRow {
  target: CatalogAsset['target'];
  id: string;
  /** `brandSlug`, `productSlug` o `productSlug/variantSlug`. */
  ref: string;
  imageKey: string | null;
}

export function assetRef(asset: CatalogAsset): string {
  if (asset.target === 'brand') return asset.brandSlug;
  if (asset.target === 'product') return asset.productSlug;
  return `${asset.productSlug}/${asset.variantSlug}`;
}

export interface ImagePlan {
  /** Archivos cuya clave no está en el bucket. */
  uploads: CatalogAsset[];
  /** Filas sin imagen que pasan a apuntar a la clave canónica. */
  backfill: { row: ImageRow; key: string }[];
  /**
   * Filas con una clave que no existe en el bucket y que esta carga no
   * arregla (no es la canónica: la puso la consola o se borró el objeto).
   */
  broken: ImageRow[];
}

/**
 * Qué hay que hacer, sin hacer nada. Conservador como la semilla:
 *
 * - Sube solo lo que falta; nunca sobrescribe un objeto existente.
 * - Rellena `imageKey` solo en filas que lo tienen vacío. Una fila con clave
 *   no se toca aunque difiera de la canónica: puede ser una imagen subida
 *   desde la consola, con su versión en el nombre.
 * - Una fila sin archivo en `assets/` (creada desde la consola) no aparece.
 */
export function planImages(assets: CatalogAsset[], bucketKeys: Set<string>, rows: ImageRow[]): ImagePlan {
  const uploads = assets.filter((asset) => !bucketKeys.has(asset.key));
  const available = new Set([...bucketKeys, ...uploads.map((asset) => asset.key)]);
  const byRef = new Map(assets.map((asset) => [`${asset.target}:${assetRef(asset)}`, asset]));

  const backfill: ImagePlan['backfill'] = [];
  const broken: ImageRow[] = [];
  for (const row of rows) {
    if (!row.imageKey) {
      const asset = byRef.get(`${row.target}:${row.ref}`);
      if (asset) backfill.push({ row, key: asset.key });
    } else if (!available.has(row.imageKey)) {
      broken.push(row);
    }
  }
  return { uploads, backfill, broken };
}
