import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  asyncHandler,
  parsePagination,
  isValidUUID,
  BadRequestError,
  NotFoundError,
} from '../utils/errors.js';

const router = Router();

/**
 * GET /api/recovery-cases
 * Query params: page, limit, status, terminal
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);

    const where: Prisma.RecoveryCaseWhereInput = {};

    // Status filter
    if (typeof req.query.status === 'string' && req.query.status.trim() !== '') {
      where.status = req.query.status.trim();
    }

    // Terminal boolean filter
    if (req.query.terminal !== undefined) {
      const terminalParam = String(req.query.terminal).toLowerCase().trim();
      if (terminalParam === 'true') {
        where.terminal = true;
      } else if (terminalParam === 'false') {
        where.terminal = false;
      } else {
        throw new BadRequestError(
          'Query parameter "terminal" must be either "true" or "false"',
          'INVALID_FILTER'
        );
      }
    }

    const [total, records] = await Promise.all([
      prisma.recoveryCase.count({ where }),
      prisma.recoveryCase.findMany({
        where,
        skip,
        take: limit,
        include: {
          paymentEvent: true,
        },
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

/**
 * Helper to ensure RecoveryCase exists by UUID
 */
async function ensureRecoveryCaseExists(id: string) {
  if (!isValidUUID(id)) {
    throw new BadRequestError(
      `Invalid UUID format for recovery case ID: "${id}"`,
      'INVALID_UUID'
    );
  }

  const existingCase = await prisma.recoveryCase.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingCase) {
    throw new NotFoundError(
      `Recovery case with ID "${id}" was not found`,
      'RECOVERY_CASE_NOT_FOUND'
    );
  }

  return existingCase;
}

/**
 * GET /api/recovery-cases/:id
 * Single RecoveryCase by UUID with linked PaymentEvent
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      throw new BadRequestError(
        `Invalid UUID format for recovery case ID: "${id}"`,
        'INVALID_UUID'
      );
    }

    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id },
      include: {
        paymentEvent: true,
      },
    });

    if (!recoveryCase) {
      throw new NotFoundError(
        `Recovery case with ID "${id}" was not found`,
        'RECOVERY_CASE_NOT_FOUND'
      );
    }

    res.status(200).json(recoveryCase);
  })
);

/**
 * GET /api/recovery-cases/:id/audit-log
 * Full AuditLogEntry trail ordered by created_at ascending
 */
router.get(
  '/:id/audit-log',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await ensureRecoveryCaseExists(id);

    const auditLogs = await prisma.auditLogEntry.findMany({
      where: { recovery_case_id: id },
      orderBy: { created_at: 'asc' },
    });

    res.status(200).json({
      recovery_case_id: id,
      total: auditLogs.length,
      data: auditLogs,
    });
  })
);

/**
 * GET /api/recovery-cases/:id/decisions
 * All AgentDecision records ordered by created_at ascending
 */
router.get(
  '/:id/decisions',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await ensureRecoveryCaseExists(id);

    const decisions = await prisma.agentDecision.findMany({
      where: { recovery_case_id: id },
      orderBy: { created_at: 'asc' },
    });

    res.status(200).json({
      recovery_case_id: id,
      total: decisions.length,
      data: decisions,
    });
  })
);

export default router;
