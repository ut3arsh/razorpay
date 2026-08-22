import { prisma } from '../lib/prisma.js';

export interface BatchReport {
  batch_id?: string;
  total_cases: number;
  resolved: number;
  escalated: number;
  stopped_max_retries: number;
  no_action: number;
  retry_scheduled_pending: number;
  nudge_sent_pending: number;
  amount_recovered_paise: number;
  amount_at_risk_paise: number;
  recovery_rate_pct: number;
  false_escalation_rate_pct: number;
  generated_at: string;
}

export interface ComputeBatchReportOptions {
  batchId?: string;
}

/**
 * Computes the aggregated BatchReport live from all current RecoveryCase records in the database.
 *
 * @param options - Optional configuration, such as an explicit batchId.
 * @returns The computed BatchReport object.
 */
export async function computeBatchReport(
  options?: ComputeBatchReportOptions
): Promise<BatchReport> {
  const recoveryCases = await prisma.recoveryCase.findMany({
    include: {
      paymentEvent: true,
      decisions: {
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  });

  let resolvedCount = 0;
  let escalatedCount = 0;
  let stoppedMaxRetriesCount = 0;
  let noActionCount = 0;
  let retryScheduledPendingCount = 0;
  let nudgeSentPendingCount = 0;
  let amountRecoveredPaise = 0;
  let amountAtRiskPaise = 0;
  let falseEscalationsCount = 0;

  for (const recoveryCase of recoveryCases) {
    const event = recoveryCase.paymentEvent;
    const latestAction = recoveryCase.decisions[0]?.action || 'UNKNOWN';
    const eventAmountPaise = event ? Math.round(Number(event.amount) * 100) : 0;

    if (recoveryCase.status === 'RESOLVED') {
      resolvedCount++;
      const recoveredPaise = Math.round(
        Number(recoveryCase.recovered_amount || event?.amount || 0) * 100
      );
      amountRecoveredPaise += recoveredPaise;
    } else {
      amountAtRiskPaise += eventAmountPaise;

      if (recoveryCase.status === 'ESCALATED') {
        escalatedCount++;

        // Note on limitation: True false-escalation rate requires ground truth resolution labels
        // from merchant operations that are not available at this stage. As a proxy metric,
        // any case escalated to human review despite having high confidence (>= 0.6)
        // is classified as a "false escalation".
        if ((recoveryCase.confidence ?? 0) >= 0.6) {
          falseEscalationsCount++;
        }
      } else if (recoveryCase.status === 'STOPPED') {
        stoppedMaxRetriesCount++;
      } else if (recoveryCase.status === 'OPEN') {
        if (latestAction === 'RETRY_SCHEDULED') {
          retryScheduledPendingCount++;
        } else if (latestAction === 'NUDGE_SENT') {
          nudgeSentPendingCount++;
        } else {
          noActionCount++;
        }
      } else {
        noActionCount++;
      }
    }
  }

  const totalCases = recoveryCases.length;
  const recoveryRatePct =
    totalCases > 0 ? Number(((resolvedCount / totalCases) * 100).toFixed(2)) : 0;
  const falseEscalationRatePct =
    totalCases > 0 ? Number(((falseEscalationsCount / totalCases) * 100).toFixed(2)) : 0;

  const report: BatchReport = {
    ...(options?.batchId ? { batch_id: options.batchId } : {}),
    total_cases: totalCases,
    resolved: resolvedCount,
    escalated: escalatedCount,
    stopped_max_retries: stoppedMaxRetriesCount,
    no_action: noActionCount,
    retry_scheduled_pending: retryScheduledPendingCount,
    nudge_sent_pending: nudgeSentPendingCount,
    amount_recovered_paise: amountRecoveredPaise,
    amount_at_risk_paise: amountAtRiskPaise,
    recovery_rate_pct: recoveryRatePct,
    false_escalation_rate_pct: falseEscalationRatePct,
    generated_at: new Date().toISOString(),
  };

  return report;
}
