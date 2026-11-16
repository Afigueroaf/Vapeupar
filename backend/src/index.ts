import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
/**
 * Interfaz en la que escucha. Sin valor, todas (lo de siempre en local).
 *
 * En producción vale `127.0.0.1` (unidad de systemd, `infra/deploy/`): delante
 * está nginx en la misma máquina, así que nadie más tiene por qué llegar al
 * puerto 4000. El grupo de seguridad ya lo cierra hacia fuera, pero escuchar
 * solo en loopback hace que una regla mal puesta en AWS no baste para exponer
 * la API saltándose nginx —y con él, la IP real que necesita el límite de
 * peticiones—.
 */
const HOST = process.env.HOST;
const app = createApp();

const onListening = () => {
  console.log(`🚀 Vapeupar Backend API running on http://${HOST ?? 'localhost'}:${PORT}`);
  console.log(`🛡️  Security headers and rate limiting enabled`);
  console.log(`📦 Health endpoint: http://localhost:${PORT}/health`);
  console.log(`🛒 Products catalog: http://localhost:${PORT}/api/products`);
  console.log(`🔐 Admin console API: http://localhost:${PORT}/api/admin`);
};

const server = HOST ? app.listen(PORT, HOST, onListening) : app.listen(PORT, onListening);

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
