import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parsePagination } from '../utils/errors.js';
import { computeBatchReport } from '../agent/computeBatchReport.js';

const router = Router();

/**
 * GET /api/metrics/batch-report
 * Recomputes the BatchReport live from current RecoveryCase data.
 */
router.get(
  '/batch-report',
  asyncHandler(async (_req: Request, res: Response) => {
    const report = await computeBatchReport();
    res.status(200).json(report);
  })
);

/**
 * GET /api/metrics/batch-history
 * Returns all persisted BatchRun records ordered by created_at descending, paginated.
 */
router.get(
  '/batch-history',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query);

    const [total, records] = await Promise.all([
      prisma.batchRun.count(),
      prisma.batchRun.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const formattedRecords = records.map((run) => ({
      id: run.id,
      batch_id: run.batch_id,
      total_cases: run.total_cases,
      resolved: run.resolved,
      escalated: run.escalated,
      stopped_max_retries: run.stopped_max_retries,
      no_action: run.no_action,
      retry_scheduled_pending: run.retry_scheduled_pending,
      nudge_sent_pending: run.nudge_sent_pending,
      amount_recovered_paise: Number(run.amount_recovered_paise),
      amount_at_risk_paise: Number(run.amount_at_risk_paise),
      recovery_rate_pct: run.recovery_rate_pct,
      false_escalation_rate_pct: run.false_escalation_rate_pct,
      created_at: run.created_at,
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
