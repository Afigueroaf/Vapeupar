import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CatalogAsset, ImageRow, assetRef, listCatalogAssets, planImages } from '../src/catalog/catalog-assets.js';
import { prismaAuditSink } from '../src/db/handle.js';
import { disconnectPrisma, getPrisma } from '../src/db/prisma.js';
import { recordAudit } from '../src/services/audit.service.js';

/**
 * Sube al bucket del catálogo las imágenes de `assets/brands/` que falten y
 * rellena la imagen de las filas que no tienen (plan A8, traspaso
 * `docs/session-handoff-2026-10-27-inventory-images.md` §4.6).
 *
 *   npm run db:upload-images -- --dry-run   # solo dice lo que haría
 *   npm run db:upload-images                # lo hace
 *
 * Idempotente y conservador, como la semilla: nunca sobrescribe un objeto del
 * bucket ni una clave que ya tenga una fila (puede ser una imagen subida desde
 * la consola). Cada clave rellenada queda en `AuditLog` como `image.backfill`,
 * sin usuario (proceso de mantenimiento).
 *
 * Necesita credenciales de AWS con `s3:ListBucket` y `s3:PutObject` sobre el
 * bucket, `S3_CATALOG_BUCKET` y `AWS_REGION` en `backend/.env`, y el túnel a la
 * base abierto (`npm run infra:db-tunnel`).
 */

const ASSETS_DIR = resolve(__dirname, '../../assets/brands');
const PREFIXES = ['marcas/', 'productos/'];

async function listBucketKeys(client: S3Client, bucket: string): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const prefix of PREFIXES) {
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) if (object.Key) keys.add(object.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  return keys;
}

async function loadRows(): Promise<ImageRow[]> {
  const prisma = getPrisma();
  const [brands, products, variants] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, slug: true, logoKey: true } }),
    prisma.product.findMany({ select: { id: true, slug: true, imageKey: true } }),
    prisma.variant.findMany({ select: { id: true, slug: true, imageKey: true, product: { select: { slug: true } } } }),
  ]);
  return [
    ...brands.map((b) => ({ target: 'brand' as const, id: b.id, ref: b.slug, imageKey: b.logoKey })),
    ...products.map((p) => ({ target: 'product' as const, id: p.id, ref: p.slug, imageKey: p.imageKey })),
    ...variants.map((v) => ({
      target: 'variant' as const,
      id: v.id,
      ref: `${v.product.slug}/${v.slug}`,
      imageKey: v.imageKey,
    })),
  ];
}

async function backfill(row: ImageRow, key: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    if (row.target === 'brand') {
      await tx.brand.update({ where: { id: row.id }, data: { logoKey: key } });
    } else if (row.target === 'product') {
      await tx.product.update({ where: { id: row.id }, data: { imageKey: key } });
    } else {
      await tx.variant.update({ where: { id: row.id }, data: { imageKey: key } });
    }
    await recordAudit(prismaAuditSink(tx), {
      userId: null,
      entity: row.target,
      entityId: row.id,
      action: 'image.backfill',
      before: { imageKey: row.imageKey },
      after: { imageKey: key },
    });
  });
}

function describe(asset: CatalogAsset): string {
  return `${asset.key}  (${assetRef(asset)})`;
}

async function main(): Promise<void> {
  dotenv.config();
  const dryRun = process.argv.includes('--dry-run');
  const bucket = process.env.S3_CATALOG_BUCKET;
  if (!bucket) throw new Error('Falta S3_CATALOG_BUCKET en backend/.env (npm run infra:backend-env)');

  const client = new S3Client({ region: process.env.AWS_REGION });
  const assets = listCatalogAssets(ASSETS_DIR);
  const [bucketKeys, rows] = await Promise.all([listBucketKeys(client, bucket), loadRows()]);
  const plan = planImages(assets, bucketKeys, rows);

  console.log(`Bucket ${bucket}: ${bucketKeys.size} objetos en ${PREFIXES.join(', ')}`);
  console.log(`assets/brands: ${assets.length} imágenes; filas en la base: ${rows.length}`);
  console.log(`\nA subir (${plan.uploads.length}):`);
  for (const asset of plan.uploads) console.log(`  + ${describe(asset)}`);
  console.log(`\nFilas sin imagen que se rellenan (${plan.backfill.length}):`);
  for (const { row, key } of plan.backfill) console.log(`  ~ ${row.target} ${row.ref} -> ${key}`);
  if (plan.broken.length > 0) {
    console.log(`\nFilas con una clave que no está en el bucket y esta carga NO arregla (${plan.broken.length}):`);
    for (const row of plan.broken) console.log(`  ! ${row.target} ${row.ref}: ${row.imageKey}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: no se ha subido ni escrito nada.');
    return;
  }

  for (const asset of plan.uploads) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: asset.key,
        Body: readFileSync(asset.path),
        ContentType: asset.contentType,
      }),
    );
    console.log(`subido ${asset.key}`);
  }
  for (const { row, key } of plan.backfill) {
    await backfill(row, key);
    console.log(`rellenado ${row.target} ${row.ref}`);
  }
  console.log(`\nListo: ${plan.uploads.length} subidas, ${plan.backfill.length} filas rellenadas.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
