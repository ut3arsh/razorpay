import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import paymentEventsRouter from './routes/paymentEvents.js';
import recoveryCasesRouter from './routes/recoveryCases.js';
import metricsRouter from './routes/metrics.js';
import exceptionsRouter from './routes/exceptions.js';
import webhooksRouter from './routes/webhooks.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './utils/errors.js';

export const createApp = (): Express => {
  const app = express();

  // Core Middleware
  app.use(cors());

  // Webhook Routes (Must be mounted before global express.json() to preserve raw body for signature verification)
  app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);
  app.post('/', express.raw({ type: 'application/json' }), (req, res, next) => {
    if (req.headers['x-razorpay-signature'] || req.headers['user-agent']?.includes('Razorpay')) {
      return webhooksRouter(req, res, next);
    }
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Root & Health Check Endpoints
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'Razorpay Payment Recovery Engine',
      version: '1.0.0',
      status: 'operational',
    });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // API Resource Routes
  app.use('/api/payment-events', paymentEventsRouter);
  app.use('/api/recovery-cases', recoveryCasesRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/exceptions', exceptionsRouter);

  // 404 Catch-All Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
};

export default createApp;
