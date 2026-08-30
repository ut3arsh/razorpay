import dotenv from 'dotenv';
dotenv.config();

import { razorpay } from '../src/lib/razorpay.js';

async function main() {
  console.log('🚀 Connecting to Razorpay API...');

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.error('❌ Error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in your .env file.');
    process.exit(1);
  }

  const PLAN_NAME = 'Recovery Pro Monthly';
  const PLAN_AMOUNT_PAISE = 49900; // ₹499.00
  const PLAN_CURRENCY = 'INR';

  let planId: string;
  let planName: string = PLAN_NAME;

  try {
    // 1. Check for existing test plan
    console.log('🔍 Checking existing plans...');
    const plansResponse = await razorpay.plans.all({ count: 20 });
    const existingPlan = plansResponse.items?.find(
      (p: any) =>
        p.item?.name === PLAN_NAME ||
        (p.item?.amount === PLAN_AMOUNT_PAISE && p.period === 'monthly')
    );

    if (existingPlan) {
      planId = existingPlan.id;
      planName = existingPlan.item.name;
      console.log(`✅ Found existing Plan: ${planId} ("${planName}" - ₹${existingPlan.item.amount / 100}/${existingPlan.period})`);
    } else {
      console.log('➕ No existing test plan found. Creating a new test Plan (₹499/month)...');
      const newPlan = await razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: PLAN_NAME,
          amount: PLAN_AMOUNT_PAISE,
          currency: PLAN_CURRENCY,
          description: 'Monthly SaaS recovery test plan for integration testing',
        },
        notes: {
          environment: 'test',
          created_by: 'razorpay-payment-recovery',
        },
      });
      planId = newPlan.id;
      console.log(`✅ Created Plan: ${planId} ("${PLAN_NAME}")`);
    }

    // 2. Create a test Subscription against the plan
    console.log(`📦 Creating test Subscription for Plan ${planId}...`);
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: 12,
      quantity: 1,
      customer_notify: 1,
      notes: {
        customer_name: 'Alex Rivera',
        customer_email: 'alex.rivera@example.com',
        test_case: 'payment_recovery_test_slice',
      },
    });

    console.log('\n==============================================================');
    console.log('🎉 Razorpay Test Subscription Created Successfully!');
    console.log('==============================================================');
    console.log(`Plan ID:         ${planId}`);
    console.log(`Plan Name:       ${planName} (₹${PLAN_AMOUNT_PAISE / 100}/month)`);
    console.log(`Subscription ID: ${subscription.id}`);
    console.log(`Status:          ${subscription.status}`);
    console.log(`Short URL:       ${subscription.short_url || 'N/A'}`);
    console.log(`Total Cycles:    ${subscription.total_count}`);
    console.log('==============================================================');
    console.log('👉 Use this Subscription ID to trigger test events or test failure');
    console.log(`   Subscription ID: ${subscription.id}`);
    console.log('==============================================================\n');
  } catch (error: any) {
    console.error('❌ Failed to create test plan/subscription:', error?.message || error);
    if (error?.error) {
      console.error('Details:', JSON.stringify(error.error, null, 2));
    }
    process.exit(1);
  }
}

main();
