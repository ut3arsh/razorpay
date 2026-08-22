import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parsePagination, BadRequestError } from '../utils/errors.js';

const router = Router();

/**
 * GET /api/exceptions
 * Query params: page, limit, status (optional: 'ESCALATED' | 'STOPPED')
 * Returns all RecoveryCase records with status IN ('ESCALATED', 'STOPPED'), paginated,
 * sorted by created_at descending, including latest AgentDecision reasoning.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);

    const where: Prisma.RecoveryCaseWhereInput = {};

    // Status filter: optional 'ESCALATED' or 'STOPPED', defaults to both
    if (typeof req.query.status === 'string' && req.query.status.trim() !== '') {
      const statusParam = req.query.status.trim().toUpperCase();
      if (statusParam === 'ESCALATED' || statusParam === 'STOPPED') {
        where.status = statusParam;
      } else {
        throw new BadRequestError(
          'Query parameter "status" must be either "ESCALATED" or "STOPPED"',
          'INVALID_FILTER'
        );
      }
    } else {
      where.status = { in: ['ESCALATED', 'STOPPED'] };
    }

    const [total, records] = await Promise.all([
      prisma.recoveryCase.count({ where }),
      prisma.recoveryCase.findMany({
        where,
        skip,
        take: limit,
        include: {
          paymentEvent: true,
          decisions: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const formattedRecords = records.map((rc) => ({
      case_id: rc.id,
      case_number: rc.case_number,
      status: rc.status,
      failure_reason: rc.failure_reason,
      confidence: rc.confidence,
      retry_count: rc.retry_count,
      nudge_count: rc.nudge_count,
      amount: rc.paymentEvent ? Number(rc.paymentEvent.amount) : null,
      currency: rc.paymentEvent?.currency ?? 'INR',
      reasoning: rc.decisions[0]?.reasoning ?? null,
      created_at: rc.created_at,
    }));

    res.status(200).json({
      total,
      page,
      limit,
      total_pages: totalPages,
      data: formattedRecords,
    });
  })
);

export default router;
