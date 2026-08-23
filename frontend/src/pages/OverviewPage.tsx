import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Layers,
  HelpCircle,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { api, type BatchReport, type BatchRun } from '../lib/api';

function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

function formatShortTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

function formatFullTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

export const OverviewPage: React.FC = () => {
  const [report, setReport] = useState<BatchReport | null>(null);
  const [history, setHistory] = useState<BatchRun[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredRun, setHoveredRun] = useState<BatchRun | null>(null);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [batchReportRes, batchHistoryRes] = await Promise.all([
        api.getBatchReport(),
        api.getBatchHistory({ limit: 10 }),
      ]);
      setReport(batchReportRes);
      setHistory(batchHistoryRes.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to recovery engine API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="border border-[#2A2F3A] bg-[#1C2028] p-12 text-center space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-[#14171C] border border-[#2A2F3A] text-xs font-mono text-[#4FD1A5]">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#4FD1A5]" />
            <span>SCANNING_DATABASE // COMPUTING LIVE BATCH REPORT...</span>
          </div>
          <div className="font-mono text-xs text-[#5A6270]">
            Fetching real-time recovery metrics from :3000
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="border border-[#E1615A]/40 bg-[#1C2028] p-8 space-y-4">
          <div className="flex items-center space-x-3 text-[#E1615A]">
            <XCircle className="w-5 h-5" />
            <span className="font-mono text-sm font-bold tracking-wider">
              DISCONNECTED // UNABLE TO REACH API :3000
            </span>
          </div>
          <p className="text-sm font-mono text-[#8B93A1] bg-[#14171C] p-3 border border-[#2A2F3A]">
            {error || 'No report data returned by server'}
          </p>
          <button
            onClick={fetchOverviewData}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-[#232833] hover:bg-[#2A2F3A] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>RETRY CONNECTION</span>
          </button>
        </div>
      </div>
    );
  }

  const inProgressCount = (report.retry_scheduled_pending || 0) + (report.nudge_sent_pending || 0);
  const totalFinancialPaise = (report.amount_recovered_paise || 0) + (report.amount_at_risk_paise || 0);
  const recoverySharePct =
    totalFinancialPaise > 0
      ? Number(((report.amount_recovered_paise / totalFinancialPaise) * 100).toFixed(1))
      : 0;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      {/* ----------------- Top Header & Actions ----------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#2A2F3A] gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-[10px] tracking-widest text-[#4FD1A5] uppercase bg-[#4FD1A5]/10 px-1.5 py-0.5 border border-[#4FD1A5]/20">
              LIVE ENGINE STATE
            </span>
            <span className="font-mono text-xs text-[#5A6270]">
              GEN: {formatShortTimestamp(report.generated_at)}
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#E8EAED] tracking-tight mt-1">
            System Overview
          </h1>
          <p className="text-xs text-[#8B93A1] font-sans mt-0.5">
            Autonomous payment failure recovery and guardrailed human escalation metrics.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchOverviewData}
            className="flex items-center space-x-2 px-3 py-1.5 bg-[#1C2028] hover:bg-[#232833] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors rounded-[2px]"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#8B93A1]" />
            <span>RECOMPUTE LIVE</span>
          </button>
        </div>
      </div>

      {/* ----------------- 1. HERO SECTION ----------------- */}
      <section className="border border-[#2A2F3A] bg-[#1C2028] p-6 md:p-8 rounded-[2px]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Main Hero Number */}
          <div className="lg:col-span-5 space-y-2 border-b lg:border-b-0 lg:border-r border-[#2A2F3A] pb-6 lg:pb-0 lg:pr-8">
            <div className="flex items-center space-x-2 text-xs font-mono tracking-wider text-[#8B93A1]">
              <span className="w-2 h-2 bg-[#4FD1A5] inline-block" />
              <span className="text-[#4FD1A5] font-semibold">RECOVERY RATE</span>
              <span className="text-[#5A6270]">// SYSTEM SUCCESS</span>
            </div>

            <div className="flex items-baseline space-x-3">
              <span className="font-display text-5xl sm:text-6xl font-bold text-[#E8EAED] tracking-tight">
                {report.recovery_rate_pct.toFixed(2)}%
              </span>
              <TrendingUp className="w-7 h-7 text-[#4FD1A5] stroke-[2.5]" />
            </div>

            <p className="text-xs text-[#8B93A1] font-sans leading-relaxed pt-1">
              Percentage of automated and retried failure events successfully converted into terminal settled state.
            </p>
          </div>

          {/* Monetary Split Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount Recovered */}
            <div className="p-4 bg-[#14171C] border border-[#2A2F3A] rounded-[2px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold tracking-wider text-[#4FD1A5]">
                  RECOVERED AMOUNT
                </span>
                <span className="font-mono text-[10px] text-[#4FD1A5] bg-[#4FD1A5]/10 px-1.5 py-0.5 border border-[#4FD1A5]/20">
                  {recoverySharePct}% SHARE
                </span>
              </div>
              <div className="font-mono text-2xl font-bold text-[#4FD1A5]">
                {formatINR(report.amount_recovered_paise)}
              </div>
              <div className="w-full bg-[#1C2028] h-1.5 rounded-[1px] overflow-hidden border border-[#2A2F3A]">
                <div
                  className="bg-[#4FD1A5] h-full transition-all duration-500"
                  style={{ width: `${Math.min(recoverySharePct, 100)}%` }}
                />
              </div>
            </div>

            {/* Amount at Risk */}
            <div className="p-4 bg-[#14171C] border border-[#2A2F3A] rounded-[2px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold tracking-wider text-[#8B93A1]">
                  AMOUNT AT RISK
                </span>
                <span className="font-mono text-[10px] text-[#8B93A1] bg-[#232833] px-1.5 py-0.5 border border-[#2A2F3A]">
                  NON-TERMINAL / ESC
                </span>
              </div>
              <div className="font-mono text-2xl font-bold text-[#E8EAED]">
                {formatINR(report.amount_at_risk_paise)}
              </div>
              <div className="w-full bg-[#1C2028] h-1.5 rounded-[1px] overflow-hidden border border-[#2A2F3A]">
                <div
                  className="bg-[#5A6270] h-full transition-all duration-500"
                  style={{ width: `${Math.max(100 - recoverySharePct, 0)}%` }}
                />
              </div>
            </div>

            {/* Sub-stat: False Escalation Proxy with Safety Explanation */}
            <div className="sm:col-span-2 p-3 bg-[#14171C] border border-[#2A2F3A] flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[2px]">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-[#E8A33D]" />
                <span className="font-mono text-xs text-[#E8EAED]">
                  ESCALATION RATE: <strong className="text-[#E8A33D]">{report.false_escalation_rate_pct.toFixed(2)}%</strong>
                </span>
                <div className="relative inline-block">
                  <button
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    onClick={() => setShowTooltip(!showTooltip)}
                    className="text-[#5A6270] hover:text-[#8B93A1] transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                  {showTooltip && (
                    <div className="absolute left-0 bottom-full mb-2 w-72 p-2.5 bg-[#1C2028] border border-[#2A2F3A] text-[11px] font-sans text-[#8B93A1] z-20 shadow-xl leading-snug">
                      <strong className="text-[#E8EAED] block font-mono text-[10px] mb-1">
                        SAFETY BEHAVIOR EXPLANATION:
                      </strong>
                      Combines genuine low-confidence safe escalations plus legitimate simulated retries that did not recover funds. Represents safety gating, not error rate.
                    </div>
                  )}
                </div>
              </div>
              <div className="font-mono text-[11px] text-[#5A6270]">
                {report.escalated} of {report.total_cases} cases routed to human review
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------- 2. QUICK STATS ROW ----------------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] font-semibold tracking-widest text-[#5A6270] uppercase">
            Lifecycle Distribution // State Buckets
          </div>
          <div className="font-mono text-[10px] text-[#5A6270]">
            SUM: {report.resolved + report.escalated + report.stopped_max_retries + inProgressCount + report.no_action} / {report.total_cases} CASES
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total Cases */}
          <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] space-y-1">
            <div className="flex items-center justify-between text-[#8B93A1]">
              <span className="font-mono text-[10px] tracking-wider uppercase">Total Cases</span>
              <Layers className="w-3.5 h-3.5 text-[#5A6270]" />
            </div>
            <div className="font-mono text-2xl font-bold text-[#E8EAED]">
              {report.total_cases}
            </div>
            <div className="font-mono text-[10px] text-[#5A6270]">100% of dataset</div>
          </div>

          {/* Resolved */}
          <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] border-l-2 border-l-[#4FD1A5] rounded-[2px] space-y-1">
            <div className="flex items-center justify-between text-[#4FD1A5]">
              <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">Resolved</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4FD1A5]" />
            </div>
            <div className="font-mono text-2xl font-bold text-[#4FD1A5]">
              {report.resolved}
            </div>
            <div className="font-mono text-[10px] text-[#8B93A1]">
              {report.total_cases > 0 ? ((report.resolved / report.total_cases) * 100).toFixed(1) : 0}% settled
            </div>
          </div>

          {/* Escalated */}
          <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] border-l-2 border-l-[#E8A33D] rounded-[2px] space-y-1">
            <div className="flex items-center justify-between text-[#E8A33D]">
              <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">Escalated</span>
              <ShieldAlert className="w-3.5 h-3.5 text-[#E8A33D]" />
            </div>
            <div className="font-mono text-2xl font-bold text-[#E8A33D]">
              {report.escalated}
            </div>
            <div className="font-mono text-[10px] text-[#8B93A1]">
              {report.total_cases > 0 ? ((report.escalated / report.total_cases) * 100).toFixed(1) : 0}% human queue
            </div>
          </div>

          {/* Stopped */}
          <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] border-l-2 border-l-[#E1615A] rounded-[2px] space-y-1">
            <div className="flex items-center justify-between text-[#E1615A]">
              <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">Stopped</span>
              <XCircle className="w-3.5 h-3.5 text-[#E1615A]" />
            </div>
            <div className="font-mono text-2xl font-bold text-[#E1615A]">
              {report.stopped_max_retries}
            </div>
            <div className="font-mono text-[10px] text-[#8B93A1]">Max retries (3) hit</div>
          </div>

          {/* In Progress */}
          <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] border-l-2 border-l-[#6B8AFA] col-span-2 sm:col-span-1 rounded-[2px] space-y-1">
            <div className="flex items-center justify-between text-[#6B8AFA]">
              <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">In Progress</span>
              <Clock className="w-3.5 h-3.5 text-[#6B8AFA]" />
            </div>
            <div className="font-mono text-2xl font-bold text-[#6B8AFA]">
              {inProgressCount}
            </div>
            <div className="font-mono text-[10px] text-[#8B93A1]">Active retry / nudge</div>
          </div>
        </div>
      </section>

      {/* ----------------- 3. BATCH HISTORY STRIP ----------------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] font-semibold tracking-widest text-[#5A6270] uppercase">
              Persisted Batch Execution History // Reproducibility Strip
            </div>
            <p className="text-xs text-[#8B93A1] font-sans mt-0.5">
              Historical records from <code className="font-mono text-[11px] text-[#E8EAED]">batch_runs</code> table proving metric consistency across runs.
            </p>
          </div>

          <div className="font-mono text-xs text-[#5A6270]">
            RUNS LOGGED: <strong className="text-[#E8EAED]">{history.length}</strong>
          </div>
        </div>

        <div className="p-5 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] space-y-4">
          {history.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-[#5A6270] space-y-2 border border-dashed border-[#2A2F3A]">
              <Database className="w-5 h-5 mx-auto text-[#5A6270]" />
              <div>NO PERSISTED BATCH RUNS FOUND IN DATABASE</div>
              <p className="text-[11px] text-[#8B93A1]">
                Execute <code className="text-[#4FD1A5]">npm run batch:run</code> on the backend to record a snapshot.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Timeline Horizontal Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2">
                {history.map((run, idx) => {
                  const isSelected = hoveredRun?.id === run.id;
                  const barHeightPct = Math.max(Math.min(run.recovery_rate_pct, 100), 20);

                  return (
                    <div
                      key={run.id}
                      onMouseEnter={() => setHoveredRun(run)}
                      onClick={() => setHoveredRun(run)}
                      className={`cursor-pointer p-2.5 bg-[#14171C] border transition-all rounded-[2px] flex flex-col justify-between min-w-0 ${
                        isSelected
                          ? 'border-[#4FD1A5] bg-[#232833]'
                          : 'border-[#2A2F3A] hover:border-[#8B93A1]'
                      }`}
                    >
                      {/* Top Metric Bar */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#5A6270]">
                          <span className="truncate">#{idx + 1}</span>
                          <span className="text-[#4FD1A5] font-semibold">
                            {run.recovery_rate_pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-10 w-full bg-[#1C2028] flex items-end p-0.5 border border-[#2A2F3A]/60">
                          <div
                            className="w-full bg-[#4FD1A5] transition-all"
                            style={{ height: `${barHeightPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Bottom Timestamp */}
                      <div className="mt-2 pt-1 border-t border-[#2A2F3A]/50 min-w-0">
                        <div
                          className="font-mono text-[9px] text-[#8B93A1] truncate block w-full"
                          title={run.batch_id}
                        >
                          {run.batch_id.replace('batch_', '')}
                        </div>
                        <div className="font-mono text-[9px] text-[#5A6270] truncate block w-full">
                          {formatShortTimestamp(run.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hover / Selected Run Breakdown Card */}
              {hoveredRun ? (
                <div className="p-4 bg-[#14171C] border border-[#4FD1A5]/40 rounded-[2px] animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-[#2A2F3A] gap-2">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-[#4FD1A5]" />
                      <span className="font-mono text-xs text-[#E8EAED] font-semibold">
                        BATCH SNAPSHOT: <span className="text-[#4FD1A5]">{hoveredRun.batch_id}</span>
                      </span>
                    </div>
                    <span className="font-mono text-xs text-[#5A6270]">
                      EXECUTED: {formatFullTimestamp(hoveredRun.created_at)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
                    <div>
                      <div className="text-[#5A6270] text-[10px]">TOTAL CASES</div>
                      <div className="text-[#E8EAED] font-bold text-sm">{hoveredRun.total_cases}</div>
                    </div>
                    <div>
                      <div className="text-[#4FD1A5] text-[10px]">RESOLVED</div>
                      <div className="text-[#4FD1A5] font-bold text-sm">{hoveredRun.resolved}</div>
                    </div>
                    <div>
                      <div className="text-[#E8A33D] text-[10px]">ESCALATED</div>
                      <div className="text-[#E8A33D] font-bold text-sm">{hoveredRun.escalated}</div>
                    </div>
                    <div>
                      <div className="text-[#E1615A] text-[10px]">STOPPED</div>
                      <div className="text-[#E1615A] font-bold text-sm">{hoveredRun.stopped_max_retries}</div>
                    </div>
                    <div>
                      <div className="text-[#4FD1A5] text-[10px]">RECOVERED (₹)</div>
                      <div className="text-[#4FD1A5] font-bold text-sm">
                        {formatINR(hoveredRun.amount_recovered_paise)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#8B93A1] text-[10px]">RECOVERY RATE</div>
                      <div className="text-[#E8EAED] font-bold text-sm">
                        {hoveredRun.recovery_rate_pct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] font-mono text-[#5A6270] text-center pt-1">
                  Hover or click any batch run column above to inspect its persisted audit snapshot.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ----------------- Footer Info ----------------- */}
      <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-[#5A6270] border-t border-[#2A2F3A]/40">
        <div className="flex items-center space-x-2">
          <span>SOURCE: /api/metrics/batch-report</span>
          <span>•</span>
          <span>PERSISTENCE: /api/metrics/batch-history</span>
        </div>
        <div className="flex items-center space-x-1 hover:text-[#8B93A1] transition-colors cursor-pointer">
          <span>AUDIT COMPLIANT</span>
          <ArrowUpRight className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
};

export default OverviewPage;
