import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Razorpay Payment Recovery service running on http://localhost:${PORT}`);
});

// Graceful shutdown handling
const handleShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Database disconnected. Process terminated.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
