import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`🚀 Vapeupar Backend API running on http://localhost:${PORT}`);
  console.log(`🛡️  Security headers and rate limiting enabled`);
  console.log(`📦 Health endpoint: http://localhost:${PORT}/health`);
  console.log(`🛒 Products catalog: http://localhost:${PORT}/api/products`);
  console.log(`🔐 Admin console API: http://localhost:${PORT}/api/admin`);
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
