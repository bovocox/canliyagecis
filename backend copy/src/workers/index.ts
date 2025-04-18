import '../config/env'; // Environment variables'ları yükle
import { startWorkers } from '../queue/startWorkers';

console.log('🚀 Starting workers...');

// Start workers
const workerCount = parseInt(process.env.WORKER_COUNT || '5', 10);
console.log(`Starting ${workerCount} workers...`);
startWorkers();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📥 Shutting down workers...');
  process.exit(0);
});

// Handle unexpected errors
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception in worker process', error);
  // Don't exit - let the process continue and try to recover
});
