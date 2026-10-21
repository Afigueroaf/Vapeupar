import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { productRouter } from './routes/product.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Request logging simple middleware
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'vapeupar-backend',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/products', productRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Endpoint no encontrado' });
});

app.listen(PORT, () => {
  console.log(`🚀 Vapeupar Backend API running on http://localhost:${PORT}`);
  console.log(`📦 Health endpoint: http://localhost:${PORT}/health`);
  console.log(`🛒 Products catalog: http://localhost:${PORT}/api/products`);
});
