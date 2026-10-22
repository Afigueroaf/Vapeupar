import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { productRouter } from './routes/product.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Security Headers with Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Rate Limiting (100 requests per 1-minute window per IP)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas solicitudes desde esta IP, por favor intenta nuevamente en un minuto.'
  }
});
app.use('/api', limiter);

// CORS Policy
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes sin origin (como apps móviles o curl en desarrollo)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por política CORS'));
    }
  },
  credentials: true
}));

// Safe JSON body parser with size cap
app.use(express.json({ limit: '20kb' }));

// Health check endpoint (outside rate limit for monitoring)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'vapeupar-backend',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/products', productRouter);

// 404 Catch-All Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado'
  });
});

// Centralized Global Error Handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = err instanceof Error ? err.message : 'Error interno del servidor';

  console.error(`[ERROR] ${new Date().toISOString()}:`, err);

  res.status(500).json({
    success: false,
    message: isProduction ? 'Ocurrió un error inesperado' : errorMessage
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Vapeupar Backend API running on http://localhost:${PORT}`);
  console.log(`🛡️  Security headers and rate limiting enabled`);
  console.log(`📦 Health endpoint: http://localhost:${PORT}/health`);
  console.log(`🛒 Products catalog: http://localhost:${PORT}/api/products`);
});

// Graceful Shutdown handlers
const shutdown = (signal: string) => {
  console.log(`\nRecibido ${signal}, cerrando servidor HTTP elegantemente...`);
  server.close(() => {
    console.log('Servidor HTTP cerrado.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
