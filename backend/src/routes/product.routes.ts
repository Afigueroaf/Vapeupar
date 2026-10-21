import { Router, Request, Response } from 'express';
import { productService } from '../services/product.service.js';
import { ProductCategory } from '../types/product.types.js';

export const productRouter = Router();

// GET /api/products
productRouter.get('/', (req: Request, res: Response) => {
  try {
    const { category, brand, minPrice, maxPrice, search, featured } = req.query;

    const products = productService.getAll({
      category: category ? (category as ProductCategory) : undefined,
      brand: brand ? String(brand) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      search: search ? String(search) : undefined,
      featured: featured !== undefined ? featured === 'true' : undefined
    });

    res.json({
      success: true,
      data: products,
      total: products.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener productos',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/products/categories
productRouter.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = productService.getCategories();
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener categorías',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/products/:slug
productRouter.get('/:slug', (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const product = productService.getBySlug(slug);

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Producto '${slug}' no encontrado`
      });
      return;
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al consultar producto',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
