import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError | Prisma.PrismaClientKnownRequestError | any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // 1. Custom AppError (BadRequestError, NotFoundError, etc.)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // 2. Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2025':
        res.status(404).json({
          error: 'Requested record not found',
          code: 'NOT_FOUND',
        });
        return;
      case 'P2002':
        res.status(409).json({
          error: 'A unique constraint violation occurred',
          code: 'DUPLICATE_RECORD',
        });
        return;
      case 'P2003':
        res.status(400).json({
          error: 'Foreign key constraint violation',
          code: 'FOREIGN_KEY_VIOLATION',
        });
        return;
      default:
        res.status(400).json({
          error: 'Database operation failed',
          code: err.code,
        });
        return;
    }
  }

  // 3. Prisma Validation Errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      error: 'Invalid query or validation failed on database layer',
      code: 'DATABASE_VALIDATION_ERROR',
    });
    return;
  }

  // 4. Express SyntaxError (e.g., malformed JSON payload)
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({
      error: 'Malformed JSON payload in request body',
      code: 'INVALID_JSON',
    });
    return;
  }

  // 5. Unhandled / Server Errors
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
  });
};

export default errorHandler;
