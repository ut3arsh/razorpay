import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parsePagination } from '../utils/errors.js';

const router = Router();

/**
 * GET /api/payment-events
 * Query params: page, limit, status
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);

    const where: Prisma.PaymentEventWhereInput = {};

    if (typeof req.query.status === 'string' && req.query.status.trim() !== '') {
      where.status = req.query.status.trim();
    }

    const [total, records] = await Promise.all([
      prisma.paymentEvent.count({ where }),
      prisma.paymentEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      total,
      page,
      limit,
      total_pages: totalPages,
      data: records,
    });
  })
);

export default router;
