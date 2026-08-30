import 'dotenv/config';
import crypto from 'crypto';
import type { PaymentEvent, RecoveryCase } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import { processPaymentEvent } from '../src/agent/processPaymentEvent.js';
import { simulateOutcome } from '../src/agent/simulateOutcome.js';

import { computeBatchReport, type BatchReport } from '../src/agent/computeBatchReport.js';

export type { BatchReport };

interface ProcessedResult {
  event: PaymentEvent;
  recoveryCase: RecoveryCase;
  latestAction: string;
}

interface ProcessingFailure {
  paymentEventId: string;
  error: string;
}

export interface RunBatchRecoveryOptions {
  batchId?: string;
  silent?: boolean;
  persistRun?: boolean;
}

/**
 * Runs the batch recovery and outcome simulation across all eligible PaymentEvent records.
 */
export async function runBatchRecovery(options?: RunBatchRecoveryOptions): Promise<BatchReport> {
  const batchId = options?.batchId || `batch_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const isSilent = options?.silent ?? false;
  const shouldPersist = options?.persistRun ?? true;

  if (!isSilent) {
    console.log(`\n======================================================`);
    console.log(`🚀 Starting Batch Recovery & Outcome Simulation [${batchId}]`);
    console.log(`======================================================\n`);
  }

  // Step 1: Fetch all PaymentEvents without a RecoveryCase OR with a non-terminal RecoveryCase
  const eligibleEvents = await prisma.paymentEvent.findMany({
    where: {
      OR: [
        {
          recoveryCases: {
            none: {},
          },
        },
        {
          recoveryCases: {
            some: {
              terminal: false,
            },
          },
        },
      ],
    },
    include: {
      recoveryCases: true,
    },
    orderBy: {
      created_at: 'asc',
    },
  });

  if (!isSilent) {
    console.log(`Found ${eligibleEvents.length} eligible PaymentEvent records to process.\n`);
  }

  const results: ProcessedResult[] = [];
  const failures: ProcessingFailure[] = [];

  // Step 2: Process each event sequentially
  for (let i = 0; i < eligibleEvents.length; i++) {
    const event = eligibleEvents[i];
    const progress = `[${i + 1}/${eligibleEvents.length}]`;

    try {
      if (!isSilent) {
        console.log(
          `${progress} Processing PaymentEvent: ${event.id} (error_code: ${event.error_code || 'N/A'}, amount: ${event.amount} ${event.currency})...`
        );
      }

      // Phase 1: Process initial failure event
      const initialCase = await processPaymentEvent(event.id);

      // Phase 2: Simulate recovery outcome (simulated retry/nudge execution)
      const finalCase = await simulateOutcome(initialCase.id);

      // Retrieve the latest decision for reporting
      const latestDecision = await prisma.agentDecision.findFirst({
        where: { recovery_case_id: finalCase.id },
        orderBy: { created_at: 'desc' },
      });

      const latestAction = latestDecision?.action || 'UNKNOWN';
      if (!isSilent) {
        console.log(
          `  ➔ Case: ${finalCase.case_number} | Action: ${latestAction} | Status: ${finalCase.status} | Recovered: ${finalCase.recovered_amount ? `${finalCase.recovered_amount} ${event.currency}` : 'No'}`
        );
      }

      results.push({
        event,
        recoveryCase: finalCase,
        latestAction,
      });
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      if (!isSilent) {
        console.error(`  ❌ Failed to process PaymentEvent ${event.id}: ${errorMessage}`);
      }
      failures.push({
        paymentEventId: event.id,
        error: errorMessage,
      });
    }
  }

  // Step 3: Compute complete report metrics using shared module
  const report = await computeBatchReport({ batchId });

  // Persist computed batch report to batch_runs table if enabled
  if (shouldPersist) {
    await prisma.batchRun.create({
      data: {
        batch_id: batchId,
        total_cases: report.total_cases,
        resolved: report.resolved,
        escalated: report.escalated,
        stopped_max_retries: report.stopped_max_retries,
        no_action: report.no_action,
        retry_scheduled_pending: report.retry_scheduled_pending,
        nudge_sent_pending: report.nudge_sent_pending,
        amount_recovered_paise: BigInt(report.amount_recovered_paise),
        amount_at_risk_paise: BigInt(report.amount_at_risk_paise),
        recovery_rate_pct: report.recovery_rate_pct,
        false_escalation_rate_pct: report.false_escalation_rate_pct,
        created_at: new Date(report.generated_at),
      },
    });
  }

  // Print BatchReport
  if (!isSilent) {
    console.log(`\n======================================================`);
    console.log(`📊 BATCH RECOVERY & SIMULATION REPORT [${batchId}]`);
    console.log(`======================================================`);
    console.log(JSON.stringify(report, null, 2));
    console.log(`======================================================`);
    console.log(`Total Processed Successfully : ${results.length}`);
    console.log(`Total Failures Encountered    : ${failures.length}`);
    console.log(`Bucket Breakdown Check:`);
    console.log(`  • Resolved                 : ${report.resolved}`);
    console.log(`  • Escalated (Human)        : ${report.escalated}`);
    console.log(`  • Stopped (Max Retries)    : ${report.stopped_max_retries}`);
    console.log(`  • Retry Scheduled Pending  : ${report.retry_scheduled_pending}`);
    console.log(`  • Nudge Sent Pending       : ${report.nudge_sent_pending}`);
    console.log(`  • No Action                : ${report.no_action}`);
    console.log(`  • Sum of buckets           : ${report.resolved + report.escalated + report.stopped_max_retries + report.retry_scheduled_pending + report.nudge_sent_pending + report.no_action} / ${report.total_cases}`);
    if (failures.length > 0) {
      console.log(`\nFailures detail:`);
      failures.forEach((f) => console.log(`  - Event ${f.paymentEventId}: ${f.error}`));
    }
    console.log(`======================================================\n`);
  }

  return report;
}

// Execute batch recovery if run directly
if (process.argv[1]?.endsWith('run-batch-recovery.ts') || process.argv[1]?.endsWith('run-batch-recovery.js')) {
  runBatchRecovery()
    .catch((err) => {
      console.error('Fatal batch recovery error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
