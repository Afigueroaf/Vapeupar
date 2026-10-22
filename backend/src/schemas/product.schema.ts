import { z } from 'zod';

export const CategoryEnum = z.enum([
  'disposables',
  'pod-systems',
  'mods-tanks',
  'salt-nic',
  'freebase-liquids',
  'coils-accessories'
]);

export const ProductQuerySchema = z.object({
  category: CategoryEnum.optional(),
  brand: z.string().trim().max(50).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  search: z.string().trim().max(100).optional(),
  nicotine: z.string().trim().max(30).optional(),
  featured: z.preprocess((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return val;
  }, z.boolean().optional()),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  sortBy: z.enum(['price', 'name', 'puffCount']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
}).refine(data => {
  if (data.minPrice !== undefined && data.maxPrice !== undefined) {
    return data.minPrice <= data.maxPrice;
  }
  return true;
}, {
  message: 'El precio mínimo no puede ser mayor que el precio máximo',
  path: ['minPrice']
});

export const ProductSlugSchema = z.object({
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/, {
    message: 'El slug debe contener solo caracteres alfanuméricos y guiones'
  })
});

export type ValidatedProductQuery = z.infer<typeof ProductQuerySchema>;
