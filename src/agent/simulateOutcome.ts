// SIMULATION ONLY — in production this would be a real webhook callback from Razorpay confirming retry success/failure, not a synthetic probability model.

import crypto from 'crypto';
import type { RecoveryCase } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { decideAction } from './decisionEngine.js';
import { NotFoundError, isValidUUID, BadRequestError } from '../utils/errors.js';

/**
 * Computes a deterministic, reproducible pseudo-random float in [0, 1)
 * based on a seed string (e.g. case_number hash).
 */
function getDeterministicProbability(seed: string): number {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const intVal = parseInt(hash.substring(0, 8), 16);
  return intVal / 0xffffffff;
}

/**
 * Realistic synthetic recovery probabilities by failure category.
 */
const RECOVERY_ODDS: Record<string, number> = {
  insufficient_funds: 0.55, // 55% chance resolved on retry
  bank_decline: 0.40,       // 40% chance resolved on retry
  card_expired: 0.35,       // 35% chance resolved after customer card update nudge
};

/**
 * Simulates the payment recovery outcome for an active RecoveryCase.
 *
 * SIMULATION ONLY — in production this would be a real webhook callback from Razorpay
 * confirming retry success/failure, not a synthetic probability model.
 *
 * @param recoveryCaseId - UUID of the RecoveryCase to simulate.
 * @param options - Optional configuration like reference timestamp.
 * @returns The updated RecoveryCase after outcome simulation.
 */
export async function simulateOutcome(
  recoveryCaseId: string,
  options?: { now?: Date }
): Promise<RecoveryCase> {
  if (!isValidUUID(recoveryCaseId)) {
    throw new BadRequestError(
      `Invalid UUID format for recovery case ID: "${recoveryCaseId}"`,
      'INVALID_UUID'
    );
  }

  const existingCase = await prisma.recoveryCase.findUnique({
    where: { id: recoveryCaseId },
    include: { paymentEvent: true },
  });

  if (!existingCase) {
    throw new NotFoundError(
      `RecoveryCase with ID "${recoveryCaseId}" was not found`,
      'RECOVERY_CASE_NOT_FOUND'
    );
  }

  // If case is already terminal, no outcome to simulate
  if (existingCase.terminal || existingCase.status === 'RESOLVED' || existingCase.status === 'STOPPED' || existingCase.status === 'ESCALATED') {
    return existingCase;
  }

  const now = options?.now instanceof Date ? options?.now : new Date();
  const failureReason = existingCase.failure_reason || 'unknown';
  const seed = `${existingCase.case_number || existingCase.id}_attempt_${existingCase.retry_count}_${existingCase.nudge_count}`;
  const roll = getDeterministicProbability(seed);
  const threshold = RECOVERY_ODDS[failureReason] ?? 0.0;
  const isSuccess = roll < threshold;

  return await prisma.$transaction(async (tx) => {
    const previousStatus = existingCase.status;

    if (isSuccess) {
      // Transition to RESOLVED
      const recoveredAmount = existingCase.paymentEvent?.amount ?? null;

      const updatedCase = await tx.recoveryCase.update({
        where: { id: existingCase.id },
        data: {
          status: 'RESOLVED',
          terminal: true,
          recovered_amount: recoveredAmount,
          recovered_at: now,
          next_retry_at: null,
          cooldown_until: null,
        },
      });

      const agentDecision = await tx.agentDecision.create({
        data: {
          recovery_case_id: updatedCase.id,
          agent_name: 'RecoveryAgent',
          model_used: 'simulation_engine',
          action: 'OUTCOME_SIMULATED',
          confidence_score: 1.0,
          reasoning: `Deterministic simulation resolved case for '${failureReason}' (roll: ${(roll * 100).toFixed(1)}% < ${threshold * 100}% threshold).`,
          parameters: {
            outcome: 'RESOLVED',
            failure_reason: failureReason,
            recovered_amount: recoveredAmount ? String(recoveredAmount) : null,
            roll,
            threshold,
          },
          guardrail_checks: {
            simulation_evaluated: true,
            resolved: true,
          },
          execution_status: 'COMPLETED',
          execution_result: {
            status: 'RESOLVED',
            recovered_amount: recoveredAmount ? String(recoveredAmount) : null,
          },
        },
      });

      await tx.auditLogEntry.create({
        data: {
          recovery_case_id: updatedCase.id,
          from_state: previousStatus,
          to_state: 'RESOLVED',
          action: 'OUTCOME_RESOLVED',
          actor_type: 'simulator',
          actor_id: 'OutcomeSimulator',
          metadata: {
            decision_id: agentDecision.id,
            failure_reason: failureReason,
            roll,
            threshold,
          },
        },
      });

      return updatedCase;
    } else {
      // Simulation failed: increment attempt counts and re-evaluate through decisionEngine
      const isCardExpired = failureReason === 'card_expired';
      const updatedRetryCount = isCardExpired ? existingCase.retry_count : existingCase.retry_count + 1;
      const updatedNudgeCount = isCardExpired ? existingCase.nudge_count + 1 : existingCase.nudge_count;

      const simulatedCaseState = {
        ...existingCase,
        retry_count: updatedRetryCount,
        nudge_count: updatedNudgeCount,
        cooldown_until: null, // Clear cooldown for subsequent decision evaluation
      };

      const newDecision = decideAction({
        failure_reason: failureReason,
        confidence: existingCase.confidence ?? 0.8,
        case: simulatedCaseState,
        now,
      });

      let newStatus = 'OPEN';
      let isTerminal = false;
      let newNextRetryAt: Date | null = null;
      let newCooldownUntil: Date | null = null;

      if (newDecision.action === 'STOPPED') {
        newStatus = 'STOPPED';
        isTerminal = true;
      } else if (newDecision.action === 'ESCALATE_HUMAN') {
        newStatus = 'ESCALATED';
        isTerminal = true;
      } else if (newDecision.action === 'RETRY_SCHEDULED') {
        newStatus = 'OPEN';
        isTerminal = false;
        newNextRetryAt = newDecision.params?.retry_at
          ? new Date(newDecision.params.retry_at)
          : new Date(now.getTime() + 6 * 60 * 60 * 1000);
        newCooldownUntil = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      } else if (newDecision.action === 'NUDGE_SENT') {
        newStatus = 'OPEN';
        isTerminal = false;
        newCooldownUntil = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      }

      const updatedCase = await tx.recoveryCase.update({
        where: { id: existingCase.id },
        data: {
          status: newStatus,
          terminal: isTerminal,
          retry_count: updatedRetryCount,
          nudge_count: updatedNudgeCount,
          next_retry_at: newNextRetryAt,
          cooldown_until: newCooldownUntil,
        },
      });

      const agentDecision = await tx.agentDecision.create({
        data: {
          recovery_case_id: updatedCase.id,
          agent_name: 'RecoveryAgent',
          model_used: 'simulation_engine',
          action: newDecision.action,
          confidence_score: existingCase.confidence ?? 0.8,
          reasoning: `Simulation attempt failed (roll: ${(roll * 100).toFixed(1)}% >= ${threshold * 100}% threshold). Re-evaluated decision: ${newDecision.reasoning}`,
          parameters: {
            simulation_outcome: 'FAILED_ATTEMPT',
            next_action: newDecision.action,
            params: newDecision.params,
            roll,
            threshold,
          },
          guardrail_checks: newDecision.guardrail_checks,
          execution_status: 'COMPLETED',
          execution_result: {
            status: newStatus,
            terminal: isTerminal,
          },
        },
      });

      await tx.auditLogEntry.create({
        data: {
          recovery_case_id: updatedCase.id,
          from_state: previousStatus,
          to_state: newStatus,
          action: newDecision.action,
          actor_type: 'simulator',
          actor_id: 'OutcomeSimulator',
          metadata: {
            decision_id: agentDecision.id,
            simulation_outcome: 'FAILED_ATTEMPT',
            roll,
            threshold,
          },
        },
      });

      return updatedCase;
    }
  });
}
