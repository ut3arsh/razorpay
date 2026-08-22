import type { RecoveryCase } from '@prisma/client';

export type DecisionAction =
  | 'RETRY_SCHEDULED'
  | 'NUDGE_SENT'
  | 'ESCALATE_HUMAN'
  | 'NO_ACTION'
  | 'STOPPED';

export interface GuardrailChecks {
  confidence_above_threshold: boolean;
  within_max_retries: boolean;
  nudge_limit_not_exceeded: boolean;
  cooldown_respected: boolean;
  [key: string]: boolean;
}

export interface DecisionResult {
  action: DecisionAction;
  params: Record<string, any>;
  guardrail_checks: GuardrailChecks;
  reasoning: string;
}

export interface DecideActionInput {
  failure_reason: string;
  confidence: number;
  case: Partial<RecoveryCase> | RecoveryCase | null;
  now?: Date;
}

/**
 * Pure decision engine that determines the next automated recovery action
 * based on the failure classification, recovery case state, and safety guardrails.
 *
 * Rules are applied in strict priority order (first match wins):
 * 1. Confidence < 0.6 -> ESCALATE_HUMAN
 * 2. Case retry_count >= max_retries (default 3) -> STOPPED
 * 3. Case nudge_count >= 2 -> ESCALATE_HUMAN
 * 4. Case cooldown_until in the future -> NO_ACTION
 * 5. failure_reason === 'insufficient_funds' && retry_count < max_retries -> RETRY_SCHEDULED (+24h)
 * 6. failure_reason === 'card_expired' -> NUDGE_SENT
 * 7. failure_reason === 'bank_decline' && retry_count < 2 -> RETRY_SCHEDULED (+6h)
 * 8. Default -> ESCALATE_HUMAN
 *
 * @param input - Contains failure_reason, confidence, recovery case, and optional reference timestamp.
 * @returns DecisionResult containing action, params, guardrail_checks, and reasoning.
 */
export function decideAction(input: DecideActionInput): DecisionResult {
  const { failure_reason, confidence, case: recoveryCase, now: referenceNow } = input;
  const now = referenceNow instanceof Date ? referenceNow : new Date();

  const retryCount = recoveryCase?.retry_count ?? 0;
  const maxRetries = recoveryCase?.max_retries ?? 3;
  const nudgeCount = recoveryCase?.nudge_count ?? 0;

  // Evaluate individual guardrails
  const confidenceAboveThreshold = confidence >= 0.6;
  const withinMaxRetries = recoveryCase ? retryCount < maxRetries : true;
  const nudgeLimitNotExceeded = recoveryCase ? nudgeCount < 2 : true;

  const isCooldownActive = recoveryCase?.cooldown_until
    ? new Date(recoveryCase.cooldown_until).getTime() > now.getTime()
    : false;
  const cooldownRespected = !isCooldownActive;

  const guardrailChecks: GuardrailChecks = {
    confidence_above_threshold: confidenceAboveThreshold,
    within_max_retries: withinMaxRetries,
    nudge_limit_not_exceeded: nudgeLimitNotExceeded,
    cooldown_respected: cooldownRespected,
  };

  // Rule 1: Confidence guardrail (< 0.6 -> ESCALATE_HUMAN)
  if (!confidenceAboveThreshold) {
    return {
      action: 'ESCALATE_HUMAN',
      params: {
        reason: 'Confidence below safety threshold (0.6)',
        confidence,
        threshold: 0.6,
      },
      guardrail_checks: guardrailChecks,
      reasoning: `Confidence score (${confidence}) is below the required 0.6 threshold; escalating to human agent to prevent erroneous automated actions.`,
    };
  }

  // Rule 2: Max retries exceeded (retry_count >= max_retries -> STOPPED)
  if (recoveryCase && !withinMaxRetries) {
    return {
      action: 'STOPPED',
      params: {
        retry_count: retryCount,
        max_retries: maxRetries,
        reason: 'Maximum retries limit reached',
      },
      guardrail_checks: guardrailChecks,
      reasoning: `Maximum retry limit of ${maxRetries} reached (current retries: ${retryCount}); terminating automated recovery flow.`,
    };
  }

  // Rule 3: Max nudges exceeded (nudge_count >= 2 -> ESCALATE_HUMAN)
  if (recoveryCase && !nudgeLimitNotExceeded) {
    return {
      action: 'ESCALATE_HUMAN',
      params: {
        nudge_count: nudgeCount,
        max_nudges: 2,
        reason: 'Nudge limit reached',
      },
      guardrail_checks: guardrailChecks,
      reasoning: `Customer nudge limit of 2 reached (current nudges: ${nudgeCount}); escalating to human agent for high-touch outreach.`,
    };
  }

  // Rule 4: Cooldown active (cooldown_until in future -> NO_ACTION)
  if (recoveryCase && !cooldownRespected) {
    return {
      action: 'NO_ACTION',
      params: {
        cooldown_until: recoveryCase.cooldown_until ? new Date(recoveryCase.cooldown_until).toISOString() : null,
        reason: 'Cooldown period active between automated actions',
      },
      guardrail_checks: guardrailChecks,
      reasoning: `Cooldown period is active until ${new Date(recoveryCase.cooldown_until!).toISOString()}; withholding automated actions to respect retry pacing.`,
    };
  }

  // Rule 5: Insufficient funds with retry_count < max_retries -> RETRY_SCHEDULED (now + 24h)
  if (failure_reason === 'insufficient_funds' && retryCount < maxRetries) {
    const retryAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return {
      action: 'RETRY_SCHEDULED',
      params: {
        retry_at: retryAt.toISOString(),
        delay_hours: 24,
        retry_count: retryCount,
        max_retries: maxRetries,
      },
      guardrail_checks: guardrailChecks,
      reasoning: `Insufficient funds detected with retry count ${retryCount} < ${maxRetries}; scheduling automated payment retry in 24 hours to allow customer to fund account.`,
    };
  }

  // Rule 6: Card expired -> NUDGE_SENT
  if (failure_reason === 'card_expired') {
    return {
      action: 'NUDGE_SENT',
      params: {
        channel: 'email_sms',
        template: 'card_expired_update_request',
        reason: 'Card expired; automated retries will fail until customer updates card details.',
      },
      guardrail_checks: guardrailChecks,
      reasoning: 'Card has expired; immediate retry is ineffective. Sending customer nudge requesting updated card details.',
    };
  }

  // Rule 7: Bank decline with retry_count < 2 -> RETRY_SCHEDULED (now + 6h)
  if (failure_reason === 'bank_decline' && retryCount < 2) {
    const retryAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    return {
      action: 'RETRY_SCHEDULED',
      params: {
        retry_at: retryAt.toISOString(),
        delay_hours: 6,
      },
      guardrail_checks: guardrailChecks,
      reasoning: `Bank decline detected with retry count ${retryCount} < 2; scheduling automated retry in 6 hours for transient gateway/bank recovery.`,
    };
  }

  // Rule 8: Default fallback -> ESCALATE_HUMAN
  return {
    action: 'ESCALATE_HUMAN',
    params: {
      failure_reason,
      confidence,
      retry_count: retryCount,
      reason: 'No automated recovery rule matched the event state',
    },
    guardrail_checks: guardrailChecks,
    reasoning: `No automated recovery rule matched for failure reason '${failure_reason}' and current case state; escalating to human agent.`,
  };
}
