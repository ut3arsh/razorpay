import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyFailure } from './classifier.js';

describe('classifier - Rule-based fast path & safety fallback', () => {
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;

  let warnSpy: any;

  beforeEach(() => {
    // Ensure no real API keys leak into unit tests so tests are strictly offline and deterministic
    delete process.env.GEMINI_API_KEY;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    if (originalGeminiApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  describe('Deterministic Rule Matching: Insufficient Funds', () => {
    const insufficientFundsCodes = [
      'BAD_REQUEST_PAYMENT_ACCOUNT_INSUFFICIENT_BALANCE',
      'BAD_REQUEST_PAYMENT_CARD_INSUFFICIENT_FUNDS',
      'PAYMENT_ACCOUNT_LOW_BALANCE',
      'INSUFFICIENT_FUNDS',
      'INSUFFICIENT_BALANCE',
      // Pattern matches & case insensitivity
      'custom_error_insufficient_funds_detected',
      'CUSTOMER_ACCOUNT_LOW_BALANCE',
      '  BAD_REQUEST_PAYMENT_ACCOUNT_INSUFFICIENT_BALANCE  ',
    ];

    it.each(insufficientFundsCodes)(
      'classifies error_code "%s" as insufficient_funds with confidence 1.0 and source "rule"',
      async (errorCode) => {
        const result = await classifyFailure({
          error_code: errorCode,
          error_description: 'Customer account had insufficient balance',
        });

        expect(result.failure_reason).toBe('insufficient_funds');
        expect(result.confidence).toBe(1.0);
        expect(result.source).toBe('rule');
        expect(result.reasoning).toBeTruthy();
      }
    );
  });

  describe('Deterministic Rule Matching: Card Expired', () => {
    const cardExpiredCodes = [
      'BAD_REQUEST_PAYMENT_CARD_EXPIRED',
      'BAD_REQUEST_PAYMENT_CARD_INVALID_EXPIRY_MONTH',
      'BAD_REQUEST_PAYMENT_CARD_INVALID_EXPIRY_YEAR',
      'CARD_EXPIRED',
      // Pattern matches & case insensitivity
      'card_expired_on_file',
      'TRANSACTION_INVALID_EXPIRY_DATE',
      'EXPIRED_CARD_SUBMISSION',
      '  bad_request_payment_card_expired  ',
    ];

    it.each(cardExpiredCodes)(
      'classifies error_code "%s" as card_expired with confidence 1.0 and source "rule"',
      async (errorCode) => {
        const result = await classifyFailure({
          error_code: errorCode,
          error_description: 'The card expiration date is in the past',
        });

        expect(result.failure_reason).toBe('card_expired');
        expect(result.confidence).toBe(1.0);
        expect(result.source).toBe('rule');
        expect(result.reasoning).toBeTruthy();
      }
    );
  });

  describe('Deterministic Rule Matching: Bank Decline', () => {
    const bankDeclineCodes = [
      'GATEWAY_ERROR_PAYMENT_FAILED',
      'BAD_REQUEST_PAYMENT_DECLINED_BY_BANK',
      'BAD_REQUEST_PAYMENT_BANK_SYSTEM_ERROR',
      'DECLINED_BY_BANK',
      // Pattern matches & case insensitivity
      'PAYMENT_DECLINED_BY_BANK_RISK_CHECK',
      'ISSUER_BANK_SYSTEM_ERROR_DOWN',
      '  declined_by_bank  ',
    ];

    it.each(bankDeclineCodes)(
      'classifies error_code "%s" as bank_decline with confidence 1.0 and source "rule"',
      async (errorCode) => {
        const result = await classifyFailure({
          error_code: errorCode,
          error_description: 'Issuing bank declined transaction',
        });

        expect(result.failure_reason).toBe('bank_decline');
        expect(result.confidence).toBe(1.0);
        expect(result.source).toBe('rule');
        expect(result.reasoning).toBeTruthy();
      }
    );
  });

  describe('Unrecognized Error Code Fallback (Mock Fallback without API Key)', () => {
    const unrecognizedCodes = [
      'GATEWAY_TIMEOUT_ERROR',
      'NETWORK_DISCONNECTED',
      'AUTHENTICATION_FAILED_OTP',
      'UNEXPECTED_INTERNAL_SERVER_ERROR',
      'RANDOM_CUSTOM_CODE_12345',
    ];

    it.each(unrecognizedCodes)(
      'falls through to safe mock fallback for unrecognized error_code "%s"',
      async (errorCode) => {
        const result = await classifyFailure({
          error_code: errorCode,
          error_description: 'Something unexpected happened',
        });

        expect(result.failure_reason).toBe('unknown');
        expect(result.confidence).toBe(0.3);
        expect(result.source).toBe('mock');
        expect(result.reasoning).toContain('No API key configured or LLM call failed');
      }
    );
  });

  describe('Robustness with Malformed, Null, or Empty Descriptions & Codes', () => {
    it('does not crash when error_description is null', async () => {
      const result = await classifyFailure({
        error_code: 'BAD_REQUEST_PAYMENT_CARD_EXPIRED',
        error_description: null,
      });

      expect(result.failure_reason).toBe('card_expired');
      expect(result.confidence).toBe(1.0);
      expect(result.source).toBe('rule');
    });

    it('does not crash when error_description is empty string', async () => {
      const result = await classifyFailure({
        error_code: 'INSUFFICIENT_FUNDS',
        error_description: '',
      });

      expect(result.failure_reason).toBe('insufficient_funds');
      expect(result.confidence).toBe(1.0);
      expect(result.source).toBe('rule');
    });

    it('does not crash when error_description is undefined or whitespace', async () => {
      const result = await classifyFailure({
        error_code: 'DECLINED_BY_BANK',
        error_description: '   ',
      });

      expect(result.failure_reason).toBe('bank_decline');
      expect(result.confidence).toBe(1.0);
      expect(result.source).toBe('rule');
    });

    it('gracefully handles null error_code by falling back to mock when no LLM key is set', async () => {
      const result = await classifyFailure({
        error_code: null,
        error_description: 'Some failure description without code',
      });

      expect(result.failure_reason).toBe('unknown');
      expect(result.confidence).toBe(0.3);
      expect(result.source).toBe('mock');
    });

    it('gracefully handles undefined error_code and empty event object', async () => {
      const result = await classifyFailure({});

      expect(result.failure_reason).toBe('unknown');
      expect(result.confidence).toBe(0.3);
      expect(result.source).toBe('mock');
    });

    it('gracefully handles whitespace-only error_code', async () => {
      const result = await classifyFailure({
        error_code: '     ',
      });

      expect(result.failure_reason).toBe('unknown');
      expect(result.confidence).toBe(0.3);
      expect(result.source).toBe('mock');
    });
  });
});
