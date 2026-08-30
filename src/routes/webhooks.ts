import { Router, Request, Response } from 'express';
import { Razorpay } from '../lib/razorpay.js';
import { prisma } from '../lib/prisma.js';
import { decideAction } from '../agent/decisionEngine.js';
import { createRecoveryPaymentLink } from '../lib/razorpayPaymentLinks.js';
import { isValidUUID } from '../utils/errors.js';

const router = Router();

// In-memory set for duplicate event tracking
const processedEventIds = new Set<string>();

router.post(['/', '/razorpay'], async (req: Request, res: Response): Promise<void> => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const eventId = req.headers['x-razorpay-event-id'] as string | undefined;

  if (!webhookSecret) {
    console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured.');
    res.status(500).json({ error: 'Webhook secret is not configured on server' });
    return;
  }

  if (!signature) {
    console.warn('[Razorpay Webhook] Request missing x-razorpay-signature header.');
    res.status(400).json({ error: 'Missing x-razorpay-signature header' });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body ?? {});

  const isValidSignature = Razorpay.validateWebhookSignature(
    rawBody,
    signature,
    webhookSecret
  );

  if (!isValidSignature) {
    console.warn(
      `[Razorpay Webhook] Signature mismatch with RAZORPAY_WEBHOOK_SECRET="${webhookSecret}".`
    );
    if (process.env.NODE_ENV === 'production') {
      res.status(400).json({ error: 'Invalid webhook signature' });
      return;
    }
    console.warn('[Razorpay Webhook] [DEV MODE] Proceeding with payload processing for local testing...');
  }

  // Duplicate event protection
  if (eventId) {
    if (processedEventIds.has(eventId)) {
      console.log(`[Razorpay Webhook] Duplicate event detected and ignored: ${eventId}`);
      res.status(200).json({ status: 'duplicate_ignored', eventId });
      return;
    }
    processedEventIds.add(eventId);

    // Keep memory bounded to recent 10,000 events
    if (processedEventIds.size > 10000) {
      const firstItem = processedEventIds.values().next().value;
      if (firstItem) {
        processedEventIds.delete(firstItem);
      }
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    payload = { raw: rawBody };
  }

  const eventType = payload?.event ?? 'unknown';

  console.log(`\n================== [Razorpay Webhook Event] ==================`);
  console.log(`Event:     ${eventType}`);
  console.log(`Event ID:  ${eventId ?? 'N/A'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`==============================================================\n`);

  try {
    const paymentLinkEntity =
      payload?.payload?.payment_link?.entity || payload?.payload?.payment_link || payload?.payment_link;
    const paymentEntity =
      payload?.payload?.payment?.entity || payload?.payload?.payment || payload?.payment;
    const notes = paymentLinkEntity?.notes || paymentEntity?.notes || payload?.notes || {};

    const recoveryCaseId = notes.recovery_case_id || notes.recoveryCaseId;
    const caseNumber = notes.case_number || notes.caseNumber;
    const plinkId = paymentLinkEntity?.id || null;

    let recoveryCase: any = null;

    if (recoveryCaseId && isValidUUID(recoveryCaseId)) {
      recoveryCase = await prisma.recoveryCase.findUnique({
        where: { id: recoveryCaseId },
        include: { paymentEvent: true },
      });
    }

    if (!recoveryCase && caseNumber) {
      recoveryCase = await prisma.recoveryCase.findFirst({
        where: { case_number: caseNumber },
        include: { paymentEvent: true },
      });
    }

    if (!recoveryCase && plinkId) {
      recoveryCase = await prisma.recoveryCase.findFirst({
        where: {
          metadata: {
            path: ['plink_id'],
            equals: plinkId,
          },
        },
        include: { paymentEvent: true },
      });
    }

    if (!recoveryCase) {
      console.warn(
        `[Razorpay Webhook] No matching RecoveryCase found for event '${eventType}' (recovery_case_id: ${recoveryCaseId}, plink_id: ${plinkId}).`
      );
      res.status(200).json({ status: 'ok', handled: false, message: 'Case not found' });
      return;
    }

    const now = new Date();

    if (eventType === 'payment_link.paid') {
      if (recoveryCase.status === 'RESOLVED') {
        console.log(`[Razorpay Webhook] RecoveryCase ${recoveryCase.case_number || recoveryCase.id} is already RESOLVED.`);
        res.status(200).json({ status: 'ok', handled: true, message: 'Already resolved' });
        return;
      }

      const amountPaise = Number(
        paymentLinkEntity?.amount_paid ?? paymentEntity?.amount ?? paymentLinkEntity?.amount ?? 0
      );
      const recoveredAmount =
        amountPaise > 0
          ? Number((amountPaise / 100).toFixed(2))
          : recoveryCase.paymentEvent?.amount
            ? Number(recoveryCase.paymentEvent.amount)
            : null;

      const recoveredAt = paymentLinkEntity?.updated_at
        ? new Date(paymentLinkEntity.updated_at * 1000)
        : now;

      await prisma.$transaction(async (tx) => {
        const previousStatus = recoveryCase.status;
        const existingMetadata =
          typeof recoveryCase.metadata === 'object' && recoveryCase.metadata !== null
            ? (recoveryCase.metadata as Record<string, any>)
            : {};

        const updatedMetadata = {
          ...existingMetadata,
          plink_id: plinkId || existingMetadata.plink_id,
          payment_id: paymentEntity?.id || null,
          paid_at: recoveredAt.toISOString(),
          webhook_event_id: eventId || null,
          plink_status: 'paid',
        };

        const updatedCase = await tx.recoveryCase.update({
          where: { id: recoveryCase.id },
          data: {
            status: 'RESOLVED',
            terminal: true,
            recovered_amount: recoveredAmount,
            recovered_at: recoveredAt,
            next_retry_at: null,
            cooldown_until: null,
            metadata: updatedMetadata,
          },
        });

        const agentDecision = await tx.agentDecision.create({
          data: {
            recovery_case_id: updatedCase.id,
            agent_name: 'RecoveryAgent',
            model_used: 'razorpay_webhook',
            action: 'PAYMENT_LINK_PAID',
            confidence_score: 1.0,
            reasoning: `Real payment link (${plinkId || 'N/A'}) was successfully paid by customer via Razorpay webhook.`,
            parameters: {
              source: 'razorpay_webhook',
              event: 'payment_link.paid',
              plink_id: plinkId,
              payment_id: paymentEntity?.id,
              amount_paid_paise: amountPaise,
              recovered_amount: recoveredAmount !== null ? String(recoveredAmount) : null,
            },
            guardrail_checks: {
              webhook_verified: true,
              payment_confirmed: true,
            },
            execution_status: 'COMPLETED',
            execution_result: {
              status: 'RESOLVED',
              recovered_amount: recoveredAmount !== null ? String(recoveredAmount) : null,
              payment_id: paymentEntity?.id,
            },
          },
        });

        await tx.auditLogEntry.create({
          data: {
            recovery_case_id: updatedCase.id,
            from_state: previousStatus,
            to_state: 'RESOLVED',
            action: 'PAYMENT_LINK_PAID',
            actor_type: 'razorpay_webhook',
            actor_id: 'RazorpayWebhook',
            metadata: {
              decision_id: agentDecision.id,
              event: 'payment_link.paid',
              plink_id: plinkId,
              payment_id: paymentEntity?.id,
              recovered_amount: recoveredAmount !== null ? String(recoveredAmount) : null,
            },
          },
        });
      });

      console.log(
        `[Razorpay Webhook] Successfully resolved RecoveryCase ${recoveryCase.case_number || recoveryCase.id} with recovered amount ${recoveredAmount}.`
      );
      res.status(200).json({ status: 'ok', handled: true, event: eventType });
      return;
    }

    if (eventType === 'payment_link.expired' || eventType === 'payment_link.cancelled') {
      if (recoveryCase.terminal) {
        console.log(
          `[Razorpay Webhook] RecoveryCase ${recoveryCase.case_number || recoveryCase.id} is already terminal (${recoveryCase.status}).`
        );
        res.status(200).json({ status: 'ok', handled: true, message: 'Case already terminal' });
        return;
      }

      const failureReason = recoveryCase.failure_reason || 'card_expired';
      const isCardExpired = failureReason === 'card_expired';
      const updatedRetryCount = isCardExpired ? recoveryCase.retry_count : recoveryCase.retry_count + 1;
      const updatedNudgeCount = isCardExpired ? recoveryCase.nudge_count + 1 : recoveryCase.nudge_count;

      const reevaluatedCaseState = {
        ...recoveryCase,
        retry_count: updatedRetryCount,
        nudge_count: updatedNudgeCount,
        cooldown_until: null,
      };

      const newDecision = decideAction({
        failure_reason: failureReason,
        confidence: recoveryCase.confidence ?? 0.8,
        case: reevaluatedCaseState,
        now,
      });

      let newStatus = 'OPEN';
      let isTerminal = false;
      let newNextRetryAt: Date | null = null;
      let newCooldownUntil: Date | null = null;
      let newPaymentLinkData: { id: string; short_url: string; status: string } | null = null;

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

        if (recoveryCase.paymentEvent) {
          try {
            newPaymentLinkData = await createRecoveryPaymentLink(
              reevaluatedCaseState,
              recoveryCase.paymentEvent
            );
          } catch (err: any) {
            console.error(
              `[Razorpay Webhook] Failed to create follow-up payment link for case ${recoveryCase.id}:`,
              err?.message || err
            );
          }
        }
      }

      await prisma.$transaction(async (tx) => {
        const previousStatus = recoveryCase.status;
        const existingMetadata =
          typeof recoveryCase.metadata === 'object' && recoveryCase.metadata !== null
            ? (recoveryCase.metadata as Record<string, any>)
            : {};

        const updatedMetadata = {
          ...existingMetadata,
          last_webhook_event: eventType,
          last_webhook_event_id: eventId || null,
          plink_status: eventType === 'payment_link.expired' ? 'expired' : 'cancelled',
          ...(newPaymentLinkData
            ? {
                plink_id: newPaymentLinkData.id,
                short_url: newPaymentLinkData.short_url,
                plink_status: newPaymentLinkData.status,
              }
            : {}),
        };

        const updatedCase = await tx.recoveryCase.update({
          where: { id: recoveryCase.id },
          data: {
            status: newStatus,
            terminal: isTerminal,
            retry_count: updatedRetryCount,
            nudge_count: updatedNudgeCount,
            next_retry_at: newNextRetryAt,
            cooldown_until: newCooldownUntil,
            metadata: updatedMetadata,
          },
        });

        const agentDecision = await tx.agentDecision.create({
          data: {
            recovery_case_id: updatedCase.id,
            agent_name: 'RecoveryAgent',
            model_used: 'razorpay_webhook',
            action: newDecision.action,
            confidence_score: recoveryCase.confidence ?? 0.8,
            reasoning: `Payment link ${eventType} received via Razorpay webhook. Re-evaluated action: ${newDecision.reasoning}`,
            parameters: {
              source: 'razorpay_webhook',
              event: eventType,
              previous_plink_id: plinkId,
              next_action: newDecision.action,
              params: newDecision.params,
              ...(newPaymentLinkData
                ? {
                    new_plink_id: newPaymentLinkData.id,
                    new_short_url: newPaymentLinkData.short_url,
                  }
                : {}),
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
            actor_type: 'razorpay_webhook',
            actor_id: 'RazorpayWebhook',
            metadata: {
              decision_id: agentDecision.id,
              event: eventType,
              previous_plink_id: plinkId,
            },
          },
        });
      });

      console.log(
        `[Razorpay Webhook] Successfully handled ${eventType} for RecoveryCase ${recoveryCase.case_number || recoveryCase.id}. New status: ${newStatus}, Action: ${newDecision.action}`
      );
      res.status(200).json({ status: 'ok', handled: true, event: eventType, action: newDecision.action });
      return;
    }

    // Default 200 OK for other unhandled Razorpay webhook events
    res.status(200).json({ status: 'ok', handled: false, event: eventType });
  } catch (error: any) {
    console.error(`[Razorpay Webhook] Error processing event ${eventType}:`, error?.message || error);
    res.status(500).json({ error: 'Failed to process webhook event', details: error?.message || String(error) });
  }
});

export default router;
