import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PaymentEvent } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

export type FailureReason =
  | 'insufficient_funds'
  | 'card_expired'
  | 'bank_decline'
  | 'technical_error'
  | 'unknown';

export interface ClassificationResult {
  failure_reason: string;
  confidence: number;
  reasoning: string;
  source: 'rule' | 'llm' | 'mock';
}

const MOCK_FALLBACK_REASONING =
  'No API key configured or LLM call failed; defaulting to low-confidence unknown classification to force safe escalation.';

const MOCK_FALLBACK_RESULT: ClassificationResult = {
  failure_reason: 'unknown',
  confidence: 0.3,
  source: 'mock',
  reasoning: MOCK_FALLBACK_REASONING,
};

const VALID_FAILURE_REASONS: ReadonlySet<string> = new Set<FailureReason>([
  'insufficient_funds',
  'card_expired',
  'bank_decline',
  'technical_error',
  'unknown',
]);

/**
 * Step 1: Lookup table mapping known error_code patterns to failure_reason categories.
 */
const RULE_LOOKUP: Record<string, { failure_reason: FailureReason; reasoning: string }> = {
  // Insufficient funds
  BAD_REQUEST_PAYMENT_ACCOUNT_INSUFFICIENT_BALANCE: {
    failure_reason: 'insufficient_funds',
    reasoning: 'Deterministic rule match: Error code indicates insufficient account balance.',
  },
  BAD_REQUEST_PAYMENT_CARD_INSUFFICIENT_FUNDS: {
    failure_reason: 'insufficient_funds',
    reasoning: 'Deterministic rule match: Error code indicates insufficient card funds or credit limit.',
  },
  PAYMENT_ACCOUNT_LOW_BALANCE: {
    failure_reason: 'insufficient_funds',
    reasoning: 'Deterministic rule match: Error code indicates low account balance.',
  },
  INSUFFICIENT_FUNDS: {
    failure_reason: 'insufficient_funds',
    reasoning: 'Deterministic rule match: Error code directly indicates insufficient funds.',
  },
  INSUFFICIENT_BALANCE: {
    failure_reason: 'insufficient_funds',
    reasoning: 'Deterministic rule match: Error code directly indicates insufficient balance.',
  },

  // Card expired
  BAD_REQUEST_PAYMENT_CARD_EXPIRED: {
    failure_reason: 'card_expired',
    reasoning: 'Deterministic rule match: Error code indicates expired payment card.',
  },
  BAD_REQUEST_PAYMENT_CARD_INVALID_EXPIRY_MONTH: {
    failure_reason: 'card_expired',
    reasoning: 'Deterministic rule match: Error code indicates invalid or expired card expiry month.',
  },
  BAD_REQUEST_PAYMENT_CARD_INVALID_EXPIRY_YEAR: {
    failure_reason: 'card_expired',
    reasoning: 'Deterministic rule match: Error code indicates invalid or expired card expiry year.',
  },
  CARD_EXPIRED: {
    failure_reason: 'card_expired',
    reasoning: 'Deterministic rule match: Error code directly indicates card expiration.',
  },

  // Bank decline
  GATEWAY_ERROR_PAYMENT_FAILED: {
    failure_reason: 'bank_decline',
    reasoning: 'Deterministic rule match: Error code indicates payment declined at gateway / issuing bank.',
  },
  BAD_REQUEST_PAYMENT_DECLINED_BY_BANK: {
    failure_reason: 'bank_decline',
    reasoning: 'Deterministic rule match: Error code indicates transaction declined by issuing bank.',
  },
  BAD_REQUEST_PAYMENT_BANK_SYSTEM_ERROR: {
    failure_reason: 'bank_decline',
    reasoning: 'Deterministic rule match: Error code indicates bank system unavailable / declined.',
  },
  DECLINED_BY_BANK: {
    failure_reason: 'bank_decline',
    reasoning: 'Deterministic rule match: Error code directly indicates decline by bank.',
  },
};

/**
 * Checks deterministic rules based on the event's error_code.
 */
function matchDeterministicRule(errorCode: string | null | undefined): ClassificationResult | null {
  if (!errorCode || typeof errorCode !== 'string') {
    return null;
  }

  const normalized = errorCode.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  // Exact lookup match
  if (RULE_LOOKUP[normalized]) {
    const match = RULE_LOOKUP[normalized];
    return {
      failure_reason: match.failure_reason,
      confidence: 1.0,
      reasoning: match.reasoning,
      source: 'rule',
    };
  }

  // Pattern matching for specific keywords
  if (
    normalized.includes('INSUFFICIENT_BALANCE') ||
    normalized.includes('INSUFFICIENT_FUNDS') ||
    normalized.includes('LOW_BALANCE')
  ) {
    return {
      failure_reason: 'insufficient_funds',
      confidence: 1.0,
      reasoning: `Deterministic rule match: Error code '${errorCode}' matches insufficient funds pattern.`,
      source: 'rule',
    };
  }

  if (
    normalized.includes('CARD_EXPIRED') ||
    normalized.includes('INVALID_EXPIRY') ||
    normalized.includes('EXPIRED_CARD')
  ) {
    return {
      failure_reason: 'card_expired',
      confidence: 1.0,
      reasoning: `Deterministic rule match: Error code '${errorCode}' matches card expired pattern.`,
      source: 'rule',
    };
  }

  if (
    normalized.includes('DECLINED_BY_BANK') ||
    normalized.includes('BANK_SYSTEM_ERROR')
  ) {
    return {
      failure_reason: 'bank_decline',
      confidence: 1.0,
      reasoning: `Deterministic rule match: Error code '${errorCode}' matches bank decline pattern.`,
      source: 'rule',
    };
  }

  return null;
}

/**
 * Step 2: LLM Fallback using Google Gemini API (gemini-3.6-flash).
 */
async function classifyWithLLM(
  event: Partial<PaymentEvent> | PaymentEvent,
  apiKey: string
): Promise<ClassificationResult> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const systemInstruction = `You are an expert payment failure classifier for a payment gateway recovery system.
Analyze the payment failure event details and classify the failure into EXACTLY ONE of the following categories:
- insufficient_funds: The customer's account or card lacks sufficient balance or credit limit.
- card_expired: The card used has passed its expiration date or has an invalid expiration date.
- bank_decline: The issuing bank or card network declined the transaction due to risk, fraud check, policy, or authentication failure.
- technical_error: A technical timeout, network error, system crash, gateway malfunction, or infrastructure issue occurred.
- unknown: The failure reason cannot be determined or is completely unspecified.

You MUST return a strict JSON object with this exact schema:
{
  "failure_reason": "insufficient_funds" | "card_expired" | "bank_decline" | "technical_error" | "unknown",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<concise explanation of why this classification was chosen>"
}`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    systemInstruction,
    generationConfig: {
      maxOutputTokens: 1000,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const eventPayload = {
    payment_id: event.payment_id ?? null,
    order_id: event.order_id ?? null,
    method: event.method ?? null,
    amount: event.amount ? String(event.amount) : null,
    currency: event.currency ?? null,
    error_code: event.error_code ?? null,
    error_description: event.error_description ?? null,
    error_source: event.error_source ?? null,
    error_step: event.error_step ?? null,
    error_reason: event.error_reason ?? null,
    raw_payload: event.raw_payload ?? null,
  };

  const prompt = `Classify this payment failure event:\n${JSON.stringify(eventPayload, null, 2)}`;

  let responseText: string | undefined;
  try {
    const response = await model.generateContent(prompt);
    responseText = response.response.text();
  } catch (apiError: any) {
    console.error(`[Gemini API Error] Failed during model.generateContent:`, {
      message: apiError?.message,
      stack: apiError?.stack,
      status: apiError?.status,
      errorDetails: apiError?.errorDetails,
      raw: apiError,
    });
    throw apiError;
  }

  if (!responseText) {
    throw new Error('Empty response from Gemini API');
  }

  // Extract JSON object if wrapped in text or code fences
  let cleanJson = responseText.trim();
  const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanJson = jsonMatch[0];
  } else {
    cleanJson = cleanJson
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (parseError: any) {
    console.error(`[Gemini JSON Parse Error] Raw response was: "${responseText}"`, {
      message: parseError?.message,
      stack: parseError?.stack,
    });
    throw parseError;
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Parsed response is not an object. Raw response: "${responseText}"`);
  }

  const failureReason = String(parsed.failure_reason || '').trim();
  if (!VALID_FAILURE_REASONS.has(failureReason)) {
    throw new Error(
      `Invalid failure_reason returned by LLM: "${failureReason}". Raw response: "${responseText}"`
    );
  }

  const rawConfidence = Number(parsed.confidence);
  if (isNaN(rawConfidence) || rawConfidence < 0 || rawConfidence > 1) {
    throw new Error(
      `Invalid confidence score returned by LLM: "${parsed.confidence}". Raw response: "${responseText}"`
    );
  }

  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
    ? parsed.reasoning.trim()
    : `Classified as ${failureReason} with confidence ${rawConfidence.toFixed(2)}`;

  return {
    failure_reason: failureReason,
    confidence: Number(rawConfidence.toFixed(2)),
    reasoning,
    source: 'llm',
  };
}

/**
 * Classifies a payment failure event using deterministic rules, LLM fallback (Gemini), or mock fallback.
 *
 * @param event - The payment failure event to classify.
 * @returns Classification result with failure_reason, confidence, reasoning, and source ('rule' | 'llm' | 'mock').
 */
export async function classifyFailure(
  event: Partial<PaymentEvent> | PaymentEvent
): Promise<ClassificationResult> {
  // Step 1: Deterministic fast path
  const ruleResult = matchDeterministicRule(event.error_code);
  if (ruleResult) {
    return ruleResult;
  }

  // Step 2 & 3: LLM fallback with mock fallback
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    console.warn('[Classifier] GEMINI_API_KEY is not set in environment; using mock fallback.');
    return { ...MOCK_FALLBACK_RESULT };
  }

  try {
    return await classifyWithLLM(event, geminiApiKey);
  } catch (error: any) {
    console.error(`[LLM Classifier Fallback] Exception for event (id: ${event.id}, code: ${event.error_code}):`, {
      message: error?.message,
      stack: error?.stack,
      rawError: error,
    });
    // LLM call failed or JSON parsing/validation failed -> Step 3 Mock fallback
    return { ...MOCK_FALLBACK_RESULT };
  }
}
