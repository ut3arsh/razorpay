import { Request, Response, NextFunction, RequestHandler } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', code: string = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', code: string = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: { page?: unknown; limit?: unknown }): PaginationParams {
  const rawPage = query.page !== undefined ? Number(query.page) : 1;
  const rawLimit = query.limit !== undefined ? Number(query.limit) : 20;

  if (isNaN(rawPage) || rawPage < 1 || !Number.isInteger(rawPage)) {
    throw new BadRequestError('Query parameter "page" must be a positive integer', 'INVALID_PAGINATION');
  }

  if (isNaN(rawLimit) || rawLimit < 1 || !Number.isInteger(rawLimit)) {
    throw new BadRequestError('Query parameter "limit" must be a positive integer', 'INVALID_PAGINATION');
  }

  const page = rawPage;
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
