import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Helper to generate realistic Razorpay-like IDs
const randomAlphanumeric = (length: number): string => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

const generatePaymentId = () => `pay_${randomAlphanumeric(14)}`;
const generateOrderId = () => `order_${randomAlphanumeric(14)}`;
const generateCustomerId = () => `cust_${randomAlphanumeric(10)}`;
const generateMerchantId = () => `acc_${randomAlphanumeric(10)}`;

// Sample merchant pool & customer pool for realistic data distribution
const MERCHANTS = [
  'acc_mid_lifestyle_01',
  'acc_mid_edtech_02',
  'acc_mid_saas_03',
  'acc_mid_ecommerce_04',
  'acc_mid_gaming_05',
];

const CUSTOMER_POOL = Array.from({ length: 15 }, (_, i) => ({
  id: `cust_reg_${(i + 1).toString().padStart(3, '0')}`,
  email: `customer${i + 1}@example.com`,
  phone: `+9198765${(10000 + i).toString()}`,
}));

const getRandomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomAmount = (min: number = 499, max: number = 4999): number => {
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  return Number(base.toFixed(2));
};

// Error taxonomies for normal failure categories
const FAILURE_TEMPLATES = {
  insufficient_funds: [
    {
      error_code: 'BAD_REQUEST_PAYMENT_ACCOUNT_INSUFFICIENT_BALANCE',
      error_description: 'Your bank account has insufficient balance to complete this transaction.',
      error_source: 'customer',
      error_step: 'payment_authorization',
      error_reason: 'account_insufficient_balance',
      method: 'upi',
    },
    {
      error_code: 'BAD_REQUEST_PAYMENT_CARD_INSUFFICIENT_FUNDS',
      error_description: 'Card has insufficient credit limit or account balance.',
      error_source: 'bank',
      error_step: 'payment_authorization',
      error_reason: 'card_insufficient_funds',
      method: 'card',
    },
    {
      error_code: 'PAYMENT_ACCOUNT_LOW_BALANCE',
      error_description: 'Account balance is below the required transaction amount.',
      error_source: 'customer',
      error_step: 'payment_authentication',
      error_reason: 'low_balance',
      method: 'netbanking',
    },
  ],
  card_expired: [
    {
      error_code: 'BAD_REQUEST_PAYMENT_CARD_EXPIRED',
      error_description: 'The card expiry date is invalid or the card has expired.',
      error_source: 'customer',
      error_step: 'payment_authentication',
      error_reason: 'card_expired',
      method: 'card',
    },
    {
      error_code: 'BAD_REQUEST_PAYMENT_CARD_INVALID_EXPIRY_MONTH',
      error_description: 'Card validity expired. Please use an active card.',
      error_source: 'bank',
      error_step: 'payment_authorization',
      error_reason: 'invalid_expiry',
      method: 'card',
    },
  ],
  bank_decline: [
    {
      error_code: 'GATEWAY_ERROR_PAYMENT_FAILED',
      error_description: 'The issuing bank declined the transaction due to risk policies.',
      error_source: 'bank',
      error_step: 'payment_authorization',
      error_reason: 'bank_declined_transaction',
      method: 'card',
    },
    {
      error_code: 'BAD_REQUEST_PAYMENT_DECLINED_BY_BANK',
      error_description: 'Transaction declined by bank server. Please contact your issuing bank.',
      error_source: 'bank',
      error_step: 'payment_authentication',
      error_reason: 'declined_by_issuer',
      method: 'netbanking',
    },
    {
      error_code: 'BAD_REQUEST_PAYMENT_BANK_SYSTEM_ERROR',
      error_description: 'Bank servers are temporarily unable to process the request.',
      error_source: 'gateway',
      error_step: 'payment_authorization',
      error_reason: 'bank_system_unavailable',
      method: 'upi',
    },
  ],
};

const AMBIGUOUS_TEMPLATES = [
  {
    error_code: 'PAYMENT_FAILED',
    error_description: 'Payment could not be processed',
    error_source: 'gateway',
    error_step: 'payment_execution',
    error_reason: 'general_failure',
  },
  {
    error_code: 'TRANSACTION_DECLINED',
    error_description: 'Transaction declined',
    error_source: 'gateway',
    error_step: 'payment_authorization',
    error_reason: 'declined',
  },
  {
    error_code: 'GATEWAY_ERROR',
    error_description: 'Something went wrong during payment authorization',
    error_source: 'gateway',
    error_step: 'payment_authorization',
    error_reason: 'gateway_error',
  },
  {
    error_code: 'PROCESSING_ERROR',
    error_description: 'Payment processing error occurred',
    error_source: 'system',
    error_step: 'payment_initialization',
    error_reason: 'processing_fault',
  },
  {
    error_code: 'UNABLE_TO_COMPLETE',
    error_description: 'System unable to complete transaction at this time',
    error_source: 'gateway',
    error_step: 'payment_execution',
    error_reason: 'incomplete_flow',
  },
  {
    error_code: 'UPSTREAM_FAILURE',
    error_description: 'Transaction terminated by upstream gateway',
    error_source: 'gateway',
    error_step: 'payment_authorization',
    error_reason: 'upstream_terminated',
  },
  {
    error_code: 'AUTH_FAILURE',
    error_description: 'Unable to verify transaction credentials',
    error_source: 'system',
    error_step: 'payment_authentication',
    error_reason: 'auth_verification_failure',
  },
];

interface GeneratedEventItem {
  data: Prisma.PaymentEventCreateInput;
  category: 'insufficient_funds' | 'card_expired' | 'bank_decline' | 'edge_case' | 'ambiguous';
  edgeCaseType?: string;
}

export async function generateSyntheticEvents(): Promise<void> {
  const isForce = process.argv.includes('--force');

  // Check if records already exist
  const existingCount = await prisma.paymentEvent.count();
  if (existingCount > 0) {
    if (!isForce) {
      console.warn(
        `Database already contains ${existingCount} PaymentEvent records — refusing to reseed. Pass --force to wipe and reseed anyway.`
      );
      return;
    }

    console.log(`--force passed: Wiping ${existingCount} existing PaymentEvent records...`);
    await prisma.paymentEvent.deleteMany({});
    console.log('Existing records deleted successfully.\n');
  }

  console.log('🚀 Starting synthetic PaymentEvent generation...\n');

  const now = Date.now();
  const eventList: GeneratedEventItem[] = [];

  // ==========================================
  // 1. 40 NORMAL FAILURES (~14, 13, 13)
  // ==========================================
  const normalDistribution: Array<{ category: 'insufficient_funds' | 'card_expired' | 'bank_decline'; count: number }> = [
    { category: 'insufficient_funds', count: 14 },
    { category: 'card_expired', count: 13 },
    { category: 'bank_decline', count: 13 },
  ];

  let normalIndex = 0;
  for (const group of normalDistribution) {
    for (let i = 0; i < group.count; i++) {
      normalIndex++;
      const template = getRandomElement(FAILURE_TEMPLATES[group.category]);
      const customer = getRandomElement(CUSTOMER_POOL);
      const merchantId = getRandomElement(MERCHANTS);
      const paymentId = generatePaymentId();
      const orderId = generateOrderId();
      const amount = getRandomAmount(499, 4999);
      const createdAt = new Date(now - Math.floor(Math.random() * 86400000 * 3)); // past 3 days

      const rawPayload = {
        entity: 'event',
        account_id: merchantId,
        event: 'payment.failed',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: Math.round(amount * 100),
              currency: 'INR',
              status: 'failed',
              order_id: orderId,
              method: template.method,
              description: `Checkout payment #${normalIndex}`,
              email: customer.email,
              contact: customer.phone,
              error_code: template.error_code,
              error_description: template.error_description,
              error_source: template.error_source,
              error_step: template.error_step,
              error_reason: template.error_reason,
            },
          },
        },
        created_at: Math.floor(createdAt.getTime() / 1000),
      };

      eventList.push({
        category: group.category,
        data: {
          payment_id: paymentId,
          order_id: orderId,
          merchant_id: merchantId,
          customer_id: customer.id,
          customer_email: customer.email,
          customer_phone: customer.phone,
          amount: new Prisma.Decimal(amount),
          currency: 'INR',
          status: 'failed',
          method: template.method,
          error_code: template.error_code,
          error_description: template.error_description,
          error_source: template.error_source,
          error_step: template.error_step,
          error_reason: template.error_reason,
          raw_payload: rawPayload,
          created_at: createdAt,
        },
      });
    }
  }

  // ==========================================
  // 2. 8 EDGE CASES (1 record each)
  // ==========================================

  // Edge 1: Duplicate payment_id for same customer_id (simulate webhook fired twice)
  const edge1PaymentId = generatePaymentId();
  const edge1CustomerId = 'cust_edge_dup_01';
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '1. Duplicate payment_id (webhook fired twice)',
    data: {
      payment_id: edge1PaymentId,
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[0],
      customer_id: edge1CustomerId,
      customer_email: 'dup.webhook@example.com',
      customer_phone: '+919876540001',
      amount: new Prisma.Decimal(1299.00),
      currency: 'INR',
      status: 'failed',
      method: 'upi',
      error_code: 'BAD_REQUEST_PAYMENT_TIMED_OUT',
      error_description: 'Payment request timed out at customer VPA bank',
      error_source: 'bank',
      error_step: 'payment_authorization',
      error_reason: 'timed_out',
      raw_payload: {
        event: 'payment.failed',
        delivery_attempt: 1,
        note: 'Simulated duplicate webhook scenario',
      },
      created_at: new Date(now - 3600000),
    },
  });

  // Edge 2: Missing/null error_code but status is "failed"
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '2. Missing/null error_code with failed status',
    data: {
      payment_id: generatePaymentId(),
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[1],
      customer_id: 'cust_edge_null_err_02',
      customer_email: 'null.error@example.com',
      customer_phone: '+919876540002',
      amount: new Prisma.Decimal(899.00),
      currency: 'INR',
      status: 'failed',
      method: 'card',
      error_code: null,
      error_description: null,
      error_source: null,
      error_step: null,
      error_reason: null,
      raw_payload: {
        event: 'payment.failed',
        note: 'Edge case: missing error code and description',
      },
      created_at: new Date(now - 7200000),
    },
  });

  // Edge 3: Zero or negative amount
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '3. Zero or negative amount',
    data: {
      payment_id: generatePaymentId(),
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[2],
      customer_id: 'cust_edge_neg_amt_03',
      customer_email: 'invalid.amount@example.com',
      customer_phone: '+919876540003',
      amount: new Prisma.Decimal(-499.00),
      currency: 'INR',
      status: 'failed',
      method: 'upi',
      error_code: 'BAD_REQUEST_PAYMENT_AMOUNT_INVALID',
      error_description: 'Payment amount must be greater than zero.',
      error_source: 'customer',
      error_step: 'payment_initialization',
      error_reason: 'amount_less_than_minimum',
      raw_payload: {
        event: 'payment.failed',
        amount: -49900,
        note: 'Edge case: negative transaction amount',
      },
      created_at: new Date(now - 10800000),
    },
  });

  // Edge 4: High retry-like scenario (same customer appearing in multiple records in short window)
  const highRetryCustId = 'cust_high_retry_04';
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '4. High retry-like scenario (rapid sequential failure)',
    data: {
      payment_id: generatePaymentId(),
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[3],
      customer_id: highRetryCustId,
      customer_email: 'frequent.retry@example.com',
      customer_phone: '+919876540004',
      amount: new Prisma.Decimal(2499.00),
      currency: 'INR',
      status: 'failed',
      method: 'card',
      error_code: 'BAD_REQUEST_PAYMENT_CARD_INSUFFICIENT_FUNDS',
      error_description: 'Card has insufficient credit limit or account balance.',
      error_source: 'bank',
      error_step: 'payment_authorization',
      error_reason: 'insufficient_funds',
      raw_payload: {
        event: 'payment.failed',
        attempt_sequence: 3,
        window_seconds: 120,
      },
      created_at: new Date(now - 1800000),
    },
  });

  // Edge 5: Malformed/ambiguous created_at (far future date)
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '5. Malformed/far-future created_at timestamp',
    data: {
      payment_id: generatePaymentId(),
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[4],
      customer_id: 'cust_edge_future_05',
      customer_email: 'future.date@example.com',
      customer_phone: '+919876540005',
      amount: new Prisma.Decimal(1999.00),
      currency: 'INR',
      status: 'failed',
      method: 'netbanking',
      error_code: 'BAD_REQUEST_PAYMENT_BANK_SYSTEM_ERROR',
      error_description: 'Bank servers are temporarily unable to process the request.',
      error_source: 'bank',
      error_step: 'payment_authorization',
      error_reason: 'system_error',
      raw_payload: {
        event: 'payment.failed',
        note: 'Edge case: corrupted client clock / far future timestamp',
      },
      created_at: new Date('2038-12-31T23:59:59Z'),
    },
  });

  // Edge 6: Unknown/unrecognized error_code not matching standard Razorpay taxonomy
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '6. Unknown/unrecognized non-standard error_code',
    data: {
      payment_id: generatePaymentId(),
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[0],
      customer_id: 'cust_edge_mystery_06',
      customer_email: 'mystery.err@example.com',
      customer_phone: '+919876540006',
      amount: new Prisma.Decimal(3499.00),
      currency: 'INR',
      status: 'failed',
      method: 'wallet',
      error_code: 'CUSTOM_VENDOR_PROTO_X99_ERR',
      error_description: 'Third-party vendor returned proprietary error code 0x99FF2',
      error_source: 'third_party_switch',
      error_step: 'route_resolution',
      error_reason: 'custom_vendor_code_unknown',
      raw_payload: {
        event: 'payment.failed',
        vendor_status: 99,
        internal_diagnostic_code: '0x99FF2',
      },
      created_at: new Date(now - 14400000),
    },
  });

  // Edge 7: Two PaymentEvents for the same order_id within 60 seconds (Record 1 of paired order)
  const sharedOrderId = `order_rapid_burst_${randomAlphanumeric(8)}`;
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '7. Same order_id burst within 60s (Event B)',
    data: {
      payment_id: generatePaymentId(),
      order_id: sharedOrderId,
      merchant_id: MERCHANTS[1],
      customer_id: 'cust_edge_rapid_order_07',
      customer_email: 'burst.order@example.com',
      customer_phone: '+919876540007',
      amount: new Prisma.Decimal(1499.00),
      currency: 'INR',
      status: 'failed',
      method: 'upi',
      error_code: 'BAD_REQUEST_PAYMENT_DECLINED_BY_BANK',
      error_description: 'Transaction declined by bank server. Please contact your issuing bank.',
      error_source: 'bank',
      error_step: 'payment_authentication',
      error_reason: 'bank_declined',
      raw_payload: {
        event: 'payment.failed',
        order_id: sharedOrderId,
        burst_retry: true,
        interval_seconds: 25,
      },
      created_at: new Date(now - 7200000 + 25000), // 25s after reference
    },
  });

  // Edge 8: A customer_id that appears in no other record in the dataset (isolated case)
  eventList.push({
    category: 'edge_case',
    edgeCaseType: '8. Isolated customer_id (no other records in dataset)',
    data: {
      payment_id: generatePaymentId(),
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[2],
      customer_id: 'cust_isolated_loner_unique_99999',
      customer_email: 'loner.isolated@example.com',
      customer_phone: '+919999900001',
      amount: new Prisma.Decimal(4299.00),
      currency: 'INR',
      status: 'failed',
      method: 'card',
      error_code: 'BAD_REQUEST_PAYMENT_CARD_EXPIRED',
      error_description: 'The card expiry date is invalid or the card has expired.',
      error_source: 'customer',
      error_step: 'payment_authentication',
      error_reason: 'card_expired',
      raw_payload: {
        event: 'payment.failed',
        customer_status: 'single_isolated_transaction',
      },
      created_at: new Date(now - 21600000),
    },
  });

  // ==========================================
  // 3. 7 AMBIGUOUS CASES (Vague descriptions)
  // ==========================================
  for (let i = 0; i < 7; i++) {
    const template = AMBIGUOUS_TEMPLATES[i];
    const customer = getRandomElement(CUSTOMER_POOL);
    const merchantId = getRandomElement(MERCHANTS);
    const paymentId = generatePaymentId();
    const orderId = generateOrderId();
    const amount = getRandomAmount(799, 4499);
    const createdAt = new Date(now - Math.floor(Math.random() * 86400000 * 2));

    eventList.push({
      category: 'ambiguous',
      data: {
        payment_id: paymentId,
        order_id: orderId,
        merchant_id: merchantId,
        customer_id: customer.id,
        customer_email: customer.email,
        customer_phone: customer.phone,
        amount: new Prisma.Decimal(amount),
        currency: 'INR',
        status: 'failed',
        method: getRandomElement(['card', 'upi', 'netbanking']),
        error_code: template.error_code,
        error_description: template.error_description,
        error_source: template.error_source,
        error_step: template.error_step,
        error_reason: template.error_reason,
        raw_payload: {
          event: 'payment.failed',
          ambiguous_test_case: i + 1,
          description_raw: template.error_description,
        },
        created_at: createdAt,
      },
    });
  }

  // ==========================================
  // INSERTION INTO DATABASE VIA PRISMA
  // ==========================================
  console.log(`Inserting ${eventList.length} synthetic PaymentEvent records into database...`);

  let insertedCount = 0;
  for (const item of eventList) {
    await prisma.paymentEvent.create({
      data: item.data,
    });
    insertedCount++;
  }

  // Simulate duplicate webhook delivery for Edge Case 1 (now stored in DB for application-level deduplication)
  console.log('\nTesting Edge Case 1: Inserting duplicate webhook delivery for payment_id:', edge1PaymentId);
  const duplicateWebhookEvent = await prisma.paymentEvent.create({
    data: {
      payment_id: edge1PaymentId,
      order_id: generateOrderId(),
      merchant_id: MERCHANTS[0],
      customer_id: edge1CustomerId,
      customer_email: 'dup.webhook@example.com',
      customer_phone: '+919876540001',
      amount: new Prisma.Decimal(1299.00),
      currency: 'INR',
      status: 'failed',
      method: 'upi',
      error_code: 'BAD_REQUEST_PAYMENT_TIMED_OUT',
      error_description: 'Payment request timed out at customer VPA bank',
      error_source: 'bank',
      error_step: 'payment_authorization',
      error_reason: 'timed_out',
      raw_payload: {
        event: 'payment.failed',
        delivery_attempt: 2,
        is_duplicate_webhook: true,
        note: 'Simulated duplicate webhook retry delivery',
      },
      created_at: new Date(now - 3600000 + 5000),
    },
  });
  insertedCount++;
  console.log('✓ Successfully inserted duplicate webhook event record into database (ID:', duplicateWebhookEvent.id, ').');


  // ==========================================
  // SUMMARY REPORT BREAKDOWN
  // ==========================================
  const summary = {
    totalRecords: insertedCount,
    categories: {
      insufficient_funds: eventList.filter((e) => e.category === 'insufficient_funds').length,
      card_expired: eventList.filter((e) => e.category === 'card_expired').length,
      bank_decline: eventList.filter((e) => e.category === 'bank_decline').length,
    },
    edgeCases: eventList.filter((e) => e.category === 'edge_case').length,
    ambiguousCases: eventList.filter((e) => e.category === 'ambiguous').length,
  };

  console.log('\n==================================================');
  console.log('📊 SYNTHETIC PAYMENT EVENTS SEED SUMMARY');
  console.log('==================================================');
  console.log(`Total Records Inserted : ${summary.totalRecords}`);
  console.log('--------------------------------------------------');
  console.log('Normal Failures (40 total):');
  console.log(`  • Insufficient Funds : ${summary.categories.insufficient_funds}`);
  console.log(`  • Card Expired       : ${summary.categories.card_expired}`);
  console.log(`  • Bank Decline       : ${summary.categories.bank_decline}`);
  console.log('--------------------------------------------------');
  console.log(`Edge Cases             : ${summary.edgeCases}`);
  eventList
    .filter((e) => e.category === 'edge_case')
    .forEach((e) => {
      console.log(`  - ${e.edgeCaseType}`);
    });
  console.log('--------------------------------------------------');
  console.log(`Ambiguous Cases        : ${summary.ambiguousCases}`);
  console.log('==================================================\n');
}

generateSyntheticEvents()
  .catch((err) => {
    console.error('❌ Error generating synthetic events:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
