import crypto from 'crypto';
import type { RecoveryCase } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { classifyFailure } from './classifier.js';
import { decideAction } from './decisionEngine.js';
import { NotFoundError, isValidUUID, BadRequestError } from '../utils/errors.js';

/**
 * Generates a human-readable unique recovery case number.
 * Example: RC-M9A1B2C-F4A12B
 */
function generateCaseNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RC-${timestamp}-${randomSuffix}`;
}

/**
 * Maps the classifier source to a model identifier string for AgentDecision.
 */
function mapModelUsed(source: 'rule' | 'llm' | 'mock'): string {
  switch (source) {
    case 'llm':
      return 'gemini-3.6-flash';
    case 'rule':
      return 'rule';
    case 'mock':
      return 'mock';
    default:
      return source;
  }
}

/**
 * Processes a PaymentEvent by orchestrating classification, action decision,
 * recovery case lifecycle management, agent decision logging, and audit logging.
 *
 * @param paymentEventId - UUID of the PaymentEvent to process.
 * @param options - Optional configuration such as reference timestamp for testing.
 * @returns The updated RecoveryCase record.
 */
export async function processPaymentEvent(
  paymentEventId: string,
  options?: { now?: Date }
): Promise<RecoveryCase> {
  if (!isValidUUID(paymentEventId)) {
    throw new BadRequestError(
      `Invalid UUID format for payment event ID: "${paymentEventId}"`,
      'INVALID_UUID'
    );
  }

  // Step 1: Fetch the PaymentEvent by ID
  const paymentEvent = await prisma.paymentEvent.findUnique({
    where: { id: paymentEventId },
  });

  if (!paymentEvent) {
    throw new NotFoundError(
      `PaymentEvent with ID "${paymentEventId}" was not found`,
      'PAYMENT_EVENT_NOT_FOUND'
    );
  }

  const now = options?.now instanceof Date ? options?.now : new Date();

  // Step 3: Classify the failure (Fast-path rule, LLM fallback, or Mock fallback)
  const classification = await classifyFailure(paymentEvent);

  // Wrap steps 2-7 in a Prisma transaction for atomic consistency
  const updatedCase = await prisma.$transaction(async (tx) => {
    // Step 2: Find or create the RecoveryCase for this payment_event_id
    let recoveryCase = await tx.recoveryCase.findFirst({
      where: { payment_event_id: paymentEventId },
    });

    const isNewCase = !recoveryCase;
    const previousStatus = recoveryCase ? recoveryCase.status : 'OPEN';

    if (!recoveryCase) {
      recoveryCase = await tx.recoveryCase.create({
        data: {
          payment_event_id: paymentEventId,
          case_number: generateCaseNumber(),
          status: 'OPEN',
          retry_count: 0,
          nudge_count: 0,
          max_retries: 3,
          terminal: false,
        },
      });
    }

    // Step 4: Decide the next action based on failure classification and current case state
    const decision = decideAction({
      failure_reason: classification.failure_reason,
      confidence: classification.confidence,
      case: recoveryCase,
      now,
    });

    // Step 5: Determine state updates for RecoveryCase
    let newStatus = recoveryCase.status;
    let isTerminal = recoveryCase.terminal;
    let newRetryCount = recoveryCase.retry_count;
    let newNudgeCount = recoveryCase.nudge_count;
    let newNextRetryAt: Date | null = recoveryCase.next_retry_at;
    let newCooldownUntil: Date | null = recoveryCase.cooldown_until;

    const actionTaken =
      decision.action === 'RETRY_SCHEDULED' || decision.action === 'NUDGE_SENT';

    if (actionTaken) {
      newCooldownUntil = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    }

    if (decision.action === 'RETRY_SCHEDULED') {
      newRetryCount += 1;
      newNextRetryAt = decision.params?.retry_at
        ? new Date(decision.params.retry_at)
        : new Date(now.getTime() + 24 * 60 * 60 * 1000);
      newStatus = 'OPEN';
      isTerminal = false;
    } else if (decision.action === 'NUDGE_SENT') {
      newNudgeCount += 1;
      newNextRetryAt = null;
      newStatus = 'OPEN';
      isTerminal = false;
    } else if (decision.action === 'STOPPED') {
      newStatus = 'STOPPED';
      isTerminal = true;
      newNextRetryAt = null;
    } else if (decision.action === 'ESCALATE_HUMAN') {
      newStatus = 'ESCALATED';
      isTerminal = true;
      newNextRetryAt = null;
    } else if (decision.action === 'NO_ACTION') {
      // Retain current status and cooldown
    }

    // Update RecoveryCase
    const updated = await tx.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: {
        status: newStatus,
        confidence: classification.confidence,
        failure_reason: classification.failure_reason,
        retry_count: newRetryCount,
        nudge_count: newNudgeCount,
        next_retry_at: newNextRetryAt,
        cooldown_until: newCooldownUntil,
        terminal: isTerminal,
      },
    });

    // Step 6: Write an AgentDecision row
    const agentDecision = await tx.agentDecision.create({
      data: {
        recovery_case_id: updated.id,
        agent_name: 'RecoveryAgent',
        model_used: mapModelUsed(classification.source),
        action: decision.action,
        confidence_score: classification.confidence,
        reasoning: decision.reasoning,
        parameters: decision.params,
        guardrail_checks: decision.guardrail_checks,
        execution_status: 'COMPLETED',
        execution_result: {
          action: decision.action,
          params: decision.params,
          previous_status: previousStatus,
          new_status: newStatus,
        },
      },
    });

    // Step 7: Write an AuditLogEntry row
    await tx.auditLogEntry.create({
      data: {
        recovery_case_id: updated.id,
        from_state: previousStatus,
        to_state: newStatus,
        action: decision.action,
        actor_type: 'agent',
        actor_id: 'RecoveryAgent',
        metadata: {
          decision_id: agentDecision.id,
          confidence: classification.confidence,
          failure_reason: classification.failure_reason,
          source: classification.source,
          is_new_case: isNewCase,
        },
      },
    });

    return updated;
  });

  // Step 8: Return the updated RecoveryCase
  return updatedCase;
}
