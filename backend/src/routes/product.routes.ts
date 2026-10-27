import { Router, Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service.js';
import { ProductQuerySchema, ProductSlugSchema } from '../schemas/product.schema.js';

export const productRouter = Router();

// GET /api/products
productRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = ProductQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: 'Parámetros de consulta inválidos',
        errors: parseResult.error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }

    const filters = parseResult.data;
    const paginatedResult = await productService.getAll(filters);

    res.json({
      success: true,
      data: paginatedResult.items,
      pagination: {
        total: paginatedResult.total,
        page: paginatedResult.page,
        limit: paginatedResult.limit,
        totalPages: paginatedResult.totalPages
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/categories
productRouter.get('/categories', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await productService.getCategories();
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/id/:id
productRouter.get('/id/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id).trim();
    const product = await productService.getById(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:slug
productRouter.get('/:slug', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = ProductSlugSchema.safeParse(req.params);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: 'Formato de slug inválido',
        errors: parseResult.error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }

    const { slug } = parseResult.data;
    const product = await productService.getBySlug(slug);

    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});
