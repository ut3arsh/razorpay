import { describe, it, expect } from 'vitest';
import { decideAction, DecideActionInput } from './decisionEngine.js';

describe('decisionEngine - decideAction', () => {
  const baseNow = new Date('2026-08-30T12:00:00.000Z');

  describe('Rule 1: Confidence Guardrail (< 0.6 -> ESCALATE_HUMAN)', () => {
    it('returns ESCALATE_HUMAN when confidence is below 0.6 regardless of error reason or case state', () => {
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 0.59,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.params.threshold).toBe(0.6);
      expect(result.params.confidence).toBe(0.59);
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: false,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });

    it('confidence gate wins even when retry_count is 0 and failure_reason would otherwise qualify for a retry', () => {
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 0.3,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.guardrail_checks.confidence_above_threshold).toBe(false);
      expect(result.guardrail_checks.within_max_retries).toBe(true);
    });

    it('allows confidence of exactly 0.6 to pass the confidence gate', () => {
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 0.6,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.guardrail_checks.confidence_above_threshold).toBe(true);
    });
  });

  describe('Rule 2: Maximum Retries Limit (retry_count >= max_retries -> STOPPED)', () => {
    it('returns STOPPED when retry_count equals max_retries at high confidence', () => {
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 1.0,
        case: {
          retry_count: 3,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('STOPPED');
      expect(result.params.retry_count).toBe(3);
      expect(result.params.max_retries).toBe(3);
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: false,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });

    it('returns STOPPED when retry_count exceeds max_retries', () => {
      const input: DecideActionInput = {
        failure_reason: 'bank_decline',
        confidence: 1.0,
        case: {
          retry_count: 4,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('STOPPED');
      expect(result.guardrail_checks.within_max_retries).toBe(false);
    });
  });

  describe('Rule 3: Maximum Nudges Limit (nudge_count >= 2 -> ESCALATE_HUMAN)', () => {
    it('returns ESCALATE_HUMAN when nudge_count is 2 even for card_expired at high confidence', () => {
      const input: DecideActionInput = {
        failure_reason: 'card_expired',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 2,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.params.nudge_count).toBe(2);
      expect(result.params.max_nudges).toBe(2);
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: false,
        cooldown_respected: true,
      });
    });

    it('returns ESCALATE_HUMAN when nudge_count is greater than 2', () => {
      const input: DecideActionInput = {
        failure_reason: 'card_expired',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 5,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.guardrail_checks.nudge_limit_not_exceeded).toBe(false);
    });
  });

  describe('Rule 4: Cooldown Protection (future cooldown_until -> NO_ACTION)', () => {
    it('returns NO_ACTION when cooldown_until is in the future, blocking retry actions', () => {
      const futureCooldown = new Date('2026-08-30T13:00:00.000Z'); // 1h in future relative to baseNow
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: futureCooldown,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('NO_ACTION');
      expect(result.params.cooldown_until).toBe(futureCooldown.toISOString());
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: false,
      });
    });

    it('allows actions when cooldown_until timestamp is in the past', () => {
      const pastCooldown = new Date('2026-08-30T11:00:00.000Z'); // 1h in past relative to baseNow
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: pastCooldown,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.guardrail_checks.cooldown_respected).toBe(true);
    });

    it('allows actions when cooldown_until is exactly equal to now', () => {
      const exactNow = baseNow;
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: exactNow,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.guardrail_checks.cooldown_respected).toBe(true);
    });
  });

  describe('Rule 5: Insufficient Funds Recovery (RETRY_SCHEDULED +24h)', () => {
    it('schedules retry in 24 hours when retry_count < max_retries', () => {
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 1.0,
        case: {
          retry_count: 1,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.params.delay_hours).toBe(24);
      expect(result.params.retry_count).toBe(1);
      expect(result.params.max_retries).toBe(3);
      expect(result.params.retry_at).toBe('2026-08-31T12:00:00.000Z');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });
  });

  describe('Rule 6: Card Expired Recovery (NUDGE_SENT)', () => {
    it('schedules customer nudge for card_expired with valid guardrails', () => {
      const input: DecideActionInput = {
        failure_reason: 'card_expired',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 1,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('NUDGE_SENT');
      expect(result.params.channel).toBe('email_sms');
      expect(result.params.template).toBe('card_expired_update_request');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });
  });

  describe('Rule 7: Bank Decline Recovery (RETRY_SCHEDULED +6h)', () => {
    it('schedules retry in 6 hours when bank_decline and retry_count < 2', () => {
      const input: DecideActionInput = {
        failure_reason: 'bank_decline',
        confidence: 1.0,
        case: {
          retry_count: 1,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.params.delay_hours).toBe(6);
      expect(result.params.retry_at).toBe('2026-08-30T18:00:00.000Z');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });

    it('falls through to ESCALATE_HUMAN when bank_decline has retry_count >= 2', () => {
      const input: DecideActionInput = {
        failure_reason: 'bank_decline',
        confidence: 1.0,
        case: {
          retry_count: 2,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.params.failure_reason).toBe('bank_decline');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });
  });

  describe('Rule 8: Unrecognized / Unknown Failure Fallback', () => {
    it('falls through to ESCALATE_HUMAN for unknown failure_reason', () => {
      const input: DecideActionInput = {
        failure_reason: 'unknown',
        confidence: 0.9,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.params.failure_reason).toBe('unknown');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });

    it('falls through to ESCALATE_HUMAN for technical_error', () => {
      const input: DecideActionInput = {
        failure_reason: 'technical_error',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.params.failure_reason).toBe('technical_error');
    });

    it('falls through to ESCALATE_HUMAN for unmapped arbitrary failure string', () => {
      const input: DecideActionInput = {
        failure_reason: 'unmapped_reason_123',
        confidence: 0.95,
        case: null,
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('ESCALATE_HUMAN');
      expect(result.params.failure_reason).toBe('unmapped_reason_123');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });
  });

  describe('Deterministic Time Override (`now` parameter)', () => {
    it('uses explicit reference time for calculating 24h retry_at date', () => {
      const customNow = new Date('2027-01-15T08:30:00.000Z');
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: customNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.params.retry_at).toBe('2027-01-16T08:30:00.000Z');
    });

    it('uses explicit reference time for calculating 6h retry_at date', () => {
      const customNow = new Date('2027-05-20T22:15:00.000Z');
      const input: DecideActionInput = {
        failure_reason: 'bank_decline',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: null,
        },
        now: customNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.params.retry_at).toBe('2027-05-21T04:15:00.000Z');
    });

    it('correctly compares cooldown against explicit reference time', () => {
      const customNow = new Date('2026-12-01T10:00:00.000Z');
      const activeCooldownUntil = new Date('2026-12-01T10:00:01.000Z');

      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 1.0,
        case: {
          retry_count: 0,
          max_retries: 3,
          nudge_count: 0,
          cooldown_until: activeCooldownUntil,
        },
        now: customNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('NO_ACTION');
      expect(result.guardrail_checks.cooldown_respected).toBe(false);
    });
  });

  describe('Null / Partial Case Object Defaults', () => {
    it('handles null case object gracefully with standard defaults', () => {
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 0.9,
        case: null,
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });

    it('handles empty case object with standard defaults', () => {
      const input: DecideActionInput = {
        failure_reason: 'insufficient_funds',
        confidence: 0.9,
        case: {},
        now: baseNow,
      };

      const result = decideAction(input);

      expect(result.action).toBe('RETRY_SCHEDULED');
      expect(result.guardrail_checks).toEqual({
        confidence_above_threshold: true,
        within_max_retries: true,
        nudge_limit_not_exceeded: true,
        cooldown_respected: true,
      });
    });
  });
});
