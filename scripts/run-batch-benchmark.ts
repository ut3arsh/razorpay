import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { generateSyntheticEvents } from './generate-synthetic-events.js';
import { runBatchRecovery } from './run-batch-recovery.js';
import type { BatchReport } from '../src/agent/computeBatchReport.js';

interface IterationResult {
  iteration: number;
  batch_id: string;
  total_cases: number;
  resolved: number;
  escalated: number;
  stopped_max_retries: number;
  amount_recovered_paise: number;
  amount_recovered_inr: number;
  amount_at_risk_paise: number;
  amount_at_risk_inr: number;
  recovery_rate_pct: number;
  false_escalation_rate_pct: number;
  duration_ms: number;
}

interface MetricSummary {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
}

function calculateSummary(values: number[]): MetricSummary {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;

  if (values.length === 1) {
    return { min, max, mean, stdDev: 0 };
  }

  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
  const stdDev = Math.sqrt(variance);

  return { min, max, mean, stdDev };
}

function formatINR(inr: number): string {
  return '₹' + inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function runBenchmark(iterations: number = 10): Promise<{
  results: IterationResult[];
  summary: {
    recovery_rate: MetricSummary;
    amount_recovered_inr: MetricSummary;
    resolved: MetricSummary;
    escalated: MetricSummary;
    stopped: MetricSummary;
  };
}> {
  console.log(`\n========================================================================`);
  console.log(`🏁 STARTING RECOVERY ENGINE BATCH BENCHMARK (${iterations} ITERATIONS)`);
  console.log(`========================================================================`);
  console.log(`• Environment: RAZORPAY_LIVE_MODE=false (Synthetic outcomes only)`);
  console.log(`• LLM Classification: Google Gemini 3.6 Flash (Real API inference)`);
  console.log(`• Pure Decision Engine: Hard-coded safety guardrails`);
  console.log(`• Data: Fresh synthetic reseed per iteration\n`);

  // Ensure RAZORPAY_LIVE_MODE is explicitly false for benchmark runs
  process.env.RAZORPAY_LIVE_MODE = 'false';

  const results: IterationResult[] = [];
  const benchmarkStartTime = Date.now();

  for (let i = 1; i <= iterations; i++) {
    console.log(`------------------------------------------------------------------------`);
    console.log(`▶ [Iteration ${i}/${iterations}] Starting fresh reseed & recovery run...`);
    const iterStartTime = Date.now();

    // Step 1: Wipe and reseed PaymentEvents directly
    await generateSyntheticEvents({ force: true, silent: true });

    // Step 2: Run batch recovery pipeline
    const batchId = `benchmark_run_${i}_${Date.now().toString(36)}`;
    const report: BatchReport = await runBatchRecovery({
      batchId,
      silent: true,
      persistRun: false,
    });

    const iterDuration = Date.now() - iterStartTime;
    const amountRecoveredINR = Number(report.amount_recovered_paise) / 100;
    const amountAtRiskINR = Number(report.amount_at_risk_paise) / 100;

    const iterResult: IterationResult = {
      iteration: i,
      batch_id: batchId,
      total_cases: report.total_cases,
      resolved: report.resolved,
      escalated: report.escalated,
      stopped_max_retries: report.stopped_max_retries,
      amount_recovered_paise: Number(report.amount_recovered_paise),
      amount_recovered_inr: amountRecoveredINR,
      amount_at_risk_paise: Number(report.amount_at_risk_paise),
      amount_at_risk_inr: amountAtRiskINR,
      recovery_rate_pct: report.recovery_rate_pct,
      false_escalation_rate_pct: report.false_escalation_rate_pct,
      duration_ms: iterDuration,
    };

    results.push(iterResult);

    console.log(
      `✔ [Iteration ${i}/${iterations}] Completed in ${(iterDuration / 1000).toFixed(1)}s: ` +
        `Recovery Rate: ${iterResult.recovery_rate_pct.toFixed(2)}% | ` +
        `Recovered: ${formatINR(amountRecoveredINR)} | ` +
        `Resolved: ${iterResult.resolved} | Escalated: ${iterResult.escalated} | Stopped: ${iterResult.stopped_max_retries}`
    );
  }

  const totalBenchmarkDuration = (Date.now() - benchmarkStartTime) / 1000;

  // Compute metrics summaries
  const recoveryRates = results.map((r) => r.recovery_rate_pct);
  const amountsRecoveredINR = results.map((r) => r.amount_recovered_inr);
  const resolvedCounts = results.map((r) => r.resolved);
  const escalatedCounts = results.map((r) => r.escalated);
  const stoppedCounts = results.map((r) => r.stopped_max_retries);

  const recoverySummary = calculateSummary(recoveryRates);
  const amountSummary = calculateSummary(amountsRecoveredINR);
  const resolvedSummary = calculateSummary(resolvedCounts);
  const escalatedSummary = calculateSummary(escalatedCounts);
  const stoppedSummary = calculateSummary(stoppedCounts);

  // Print Results Table
  console.log(`\n========================================================================`);
  console.log(`📊 BENCHMARK INDIVIDUAL ITERATIONS SUMMARY (${iterations} RUNS)`);
  console.log(`========================================================================`);
  console.log(
    `Run  | Total | Resolved | Escalated | Stopped | Recovered (INR) | Recovery Rate`
  );
  console.log(`-----+-------+----------+-----------+---------+-----------------+--------------`);
  for (const r of results) {
    const runCol = `#${r.iteration}`.padEnd(4);
    const totalCol = `${r.total_cases}`.padStart(5);
    const resCol = `${r.resolved}`.padStart(8);
    const escCol = `${r.escalated}`.padStart(9);
    const stopCol = `${r.stopped_max_retries}`.padStart(7);
    const amtCol = formatINR(r.amount_recovered_inr).padStart(15);
    const rateCol = `${r.recovery_rate_pct.toFixed(2)}%`.padStart(13);
    console.log(`${runCol} | ${totalCol} | ${resCol} | ${escCol} | ${stopCol} | ${amtCol} | ${rateCol}`);
  }

  console.log(`\n========================================================================`);
  console.log(`📈 AGGREGATE STATISTICAL SUMMARY (${iterations} RUNS)`);
  console.log(`========================================================================`);
  console.log(
    `Metric                   | Min       | Max       | Mean      | Std Dev (±)`
  );
  console.log(`-------------------------+-----------+-----------+-----------+--------------`);
  console.log(
    `Recovery Rate (%)        | ${recoverySummary.min.toFixed(2).padStart(7)}%  | ${recoverySummary.max.toFixed(2).padStart(7)}%  | ${recoverySummary.mean.toFixed(2).padStart(7)}%  | ±${recoverySummary.stdDev.toFixed(2).padStart(5)}%`
  );
  console.log(
    `Amount Recovered (INR)   | ${formatINR(amountSummary.min).padStart(9)} | ${formatINR(amountSummary.max).padStart(9)} | ${formatINR(amountSummary.mean).padStart(9)} | ±${formatINR(amountSummary.stdDev).padStart(9)}`
  );
  console.log(
    `Resolved Cases           | ${resolvedSummary.min.toFixed(1).padStart(9)} | ${resolvedSummary.max.toFixed(1).padStart(9)} | ${resolvedSummary.mean.toFixed(1).padStart(9)} | ±${resolvedSummary.stdDev.toFixed(2).padStart(6)}`
  );
  console.log(
    `Escalated Cases          | ${escalatedSummary.min.toFixed(1).padStart(9)} | ${escalatedSummary.max.toFixed(1).padStart(9)} | ${escalatedSummary.mean.toFixed(1).padStart(9)} | ±${escalatedSummary.stdDev.toFixed(2).padStart(6)}`
  );
  console.log(
    `Stopped (Max Retries)    | ${stoppedSummary.min.toFixed(1).padStart(9)} | ${stoppedSummary.max.toFixed(1).padStart(9)} | ${stoppedSummary.mean.toFixed(1).padStart(9)} | ±${stoppedSummary.stdDev.toFixed(2).padStart(6)}`
  );
  console.log(`========================================================================`);
  console.log(
    `🎯 CANONICAL METRIC BENCHMARK STATEMENT:\n` +
      `   Recovery Rate : ${recoverySummary.mean.toFixed(1)}% ± ${recoverySummary.stdDev.toFixed(1)}% across ${iterations} runs ` +
      `(range: ${recoverySummary.min.toFixed(1)}% - ${recoverySummary.max.toFixed(1)}%)\n` +
      `   Recovered Rev : ${formatINR(amountSummary.mean)} ± ${formatINR(amountSummary.stdDev)} per 56-case batch ` +
      `(range: ${formatINR(amountSummary.min)} - ${formatINR(amountSummary.max)})\n` +
      `   Total Time    : ${(totalBenchmarkDuration / 60).toFixed(2)} minutes`
  );
  console.log(`========================================================================\n`);

  return {
    results,
    summary: {
      recovery_rate: recoverySummary,
      amount_recovered_inr: amountSummary,
      resolved: resolvedSummary,
      escalated: escalatedSummary,
      stopped: stoppedSummary,
    },
  };
}

// Execute benchmark if run directly from CLI
if (
  process.argv[1]?.endsWith('run-batch-benchmark.ts') ||
  process.argv[1]?.endsWith('run-batch-benchmark.js')
) {
  const argIterations = parseInt(process.argv[2], 10);
  const iterationsCount = !isNaN(argIterations) && argIterations > 0 ? argIterations : 10;

  runBenchmark(iterationsCount)
    .catch((err) => {
      console.error('Fatal benchmark error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
