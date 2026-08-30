import type { PaymentEvent, RecoveryCase } from '@prisma/client';
import { razorpay } from './razorpay.js';

export interface PaymentLinkResponse {
  id: string;
  short_url: string;
  status: string;
}

export interface MinimalRecoveryCase {
  id: string;
  case_number?: string | null;
}

export interface MinimalPaymentEvent {
  amount: number | string | { toString(): string };
  currency?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
}

/**
 * Creates a real Razorpay Payment Link via the SDK (POST /v1/payment_links).
 *
 * @param recoveryCase - The RecoveryCase record or minimal representation containing id and case_number.
 * @param paymentEvent - The PaymentEvent containing amount, currency, and customer details.
 * @returns Real PaymentLinkResponse with id, short_url, and status.
 */
export async function createRecoveryPaymentLink(
  recoveryCase: MinimalRecoveryCase,
  paymentEvent: MinimalPaymentEvent
): Promise<PaymentLinkResponse> {
  const amountNumber = Number(paymentEvent.amount);
  const amountPaise = Math.round(amountNumber * 100);

  const customerEmail = paymentEvent.customer_email?.trim() || 'recovery-test@example.com';
  const customerContact = paymentEvent.customer_phone?.trim() || '+919876543210';
  const currency = paymentEvent.currency?.trim() || 'INR';

  const caseIdentifier = recoveryCase.case_number || recoveryCase.id;
  const description = `Payment recovery link for case ${caseIdentifier}`;

  const linkResponse = await razorpay.paymentLink.create({
    amount: amountPaise,
    currency,
    accept_partial: false,
    description,
    customer: {
      name: 'Recovery Customer',
      email: customerEmail,
      contact: customerContact,
    },
    notify: {
      sms: true,
      email: true,
    },
    notes: {
      recovery_case_id: recoveryCase.id,
      case_number: recoveryCase.case_number || '',
    },
  });

  return {
    id: linkResponse.id,
    short_url: linkResponse.short_url,
    status: linkResponse.status,
  };
}
