import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ShieldAlert,
  XCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowUpRight,
  Clock,
  Terminal,
} from 'lucide-react';
import {
  api,
  type ExceptionsResponse,
} from '../lib/api';

function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatShortDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

function formatFullDate(isoString: string): string {
  try {
    return new Date(isoString).toISOString();
  } catch {
    return isoString;
  }
}

export const ExceptionsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ExceptionsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentStatusParam = searchParams.get('status') || '';
  const currentStatus =
    currentStatusParam === 'ESCALATED' || currentStatusParam === 'STOPPED'
      ? currentStatusParam
      : undefined;
  const currentLimit = 12;

  const fetchExceptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getExceptions({
        page: currentPage,
        limit: currentLimit,
        status: currentStatus,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load exception records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExceptions();
  }, [currentPage, currentStatus]);

  const handleStatusFilter = (status: string) => {
    const next = new URLSearchParams(searchParams);
    if (status) {
      next.set('status', status);
    } else {
      next.delete('status');
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
  };

  // Client-side text filter by case number, failure reason, or reasoning prose
  const filteredExceptions = data?.data.filter((item) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const caseNum = (item.case_number || item.case_id).toLowerCase();
    const reason = (item.failure_reason || '').toLowerCase();
    const reasoningText = (item.reasoning || '').toLowerCase();
    return caseNum.includes(q) || reason.includes(q) || reasoningText.includes(q);
  });

  const summary = data?.summary;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* ----------------- Header & Actions ----------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#2A2F3A] gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-[10px] tracking-widest text-[#E8A33D] uppercase bg-[#E8A33D]/10 px-1.5 py-0.5 border border-[#E8A33D]/20">
              SAFETY AUDIT // 03
            </span>
            <span className="font-mono text-xs text-[#5A6270]">
              TOTAL: {summary?.total_count ?? data?.total ?? '—'} EXCEPTIONS
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#E8EAED] tracking-tight mt-1">
            Exception Review & Decision Provenance
          </h1>
          <p className="text-xs text-[#8B93A1] font-sans mt-0.5">
            Surfaced reasoning for all escalated and stopped recovery lifecycles without requiring individual drill-downs.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchExceptions}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-1.5 bg-[#1C2028] hover:bg-[#232833] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors rounded-[2px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#8B93A1] ${loading ? 'animate-spin' : ''}`} />
            <span>SYNC</span>
          </button>
        </div>
      </div>

      {/* ----------------- 1. SUMMARY METRIC STRIP (FULL DATASET AGGREGATES) ----------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] space-y-1">
          <div className="flex items-center justify-between text-[#8B93A1]">
            <span className="font-mono text-[10px] uppercase tracking-wider">Total Exceptions</span>
            <AlertTriangle className="w-3.5 h-3.5 text-[#E8A33D]" />
          </div>
          <div className="font-mono text-2xl font-bold text-[#E8EAED]">
            {summary?.total_count ?? data?.total ?? '—'}
          </div>
          <div className="font-mono text-[10px] text-[#5A6270]">Escalated + Stopped (All)</div>
        </div>

        <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] border-l-2 border-l-[#E8A33D] rounded-[2px] space-y-1">
          <div className="flex items-center justify-between text-[#E8A33D]">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">Human Escalations</span>
            <ShieldAlert className="w-3.5 h-3.5 text-[#E8A33D]" />
          </div>
          <div className="font-mono text-2xl font-bold text-[#E8A33D]">
            {summary?.escalated_count ?? '—'}
          </div>
          <div className="font-mono text-[10px] text-[#8B93A1]">Safety guardrail triggered</div>
        </div>

        <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] border-l-2 border-l-[#E1615A] rounded-[2px] space-y-1">
          <div className="flex items-center justify-between text-[#E1615A]">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">Max Retries Stopped</span>
            <XCircle className="w-3.5 h-3.5 text-[#E1615A]" />
          </div>
          <div className="font-mono text-2xl font-bold text-[#E1615A]">
            {summary?.stopped_count ?? '—'}
          </div>
          <div className="font-mono text-[10px] text-[#8B93A1]">3 attempts exhausted</div>
        </div>

        <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] space-y-1">
          <div className="flex items-center justify-between text-[#8B93A1]">
            <span className="font-mono text-[10px] uppercase tracking-wider">Total Amount at Risk</span>
            <span className="font-mono text-[10px] text-[#5A6270]">₹ INR</span>
          </div>
          <div className="font-mono text-xl font-bold text-[#E8EAED]">
            {summary ? formatINR(summary.total_amount_at_risk) : '—'}
          </div>
          <div className="font-mono text-[10px] text-[#5A6270]">Full exception balance</div>
        </div>
      </div>

      {/* ----------------- 2. FILTERS & SEARCH BAR ----------------- */}
      <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-[#5A6270] mr-2 flex items-center space-x-1">
            <Filter className="w-3 h-3" />
            <span>FILTER:</span>
          </span>
          {[
            { label: 'ALL EXCEPTIONS', value: '' },
            { label: 'ESCALATED ONLY', value: 'ESCALATED' },
            { label: 'STOPPED ONLY', value: 'STOPPED' },
          ].map((tab) => {
            const isActive = (currentStatus || '') === tab.value;
            return (
              <button
                key={tab.label}
                onClick={() => handleStatusFilter(tab.value)}
                className={`px-3 py-1 text-xs font-mono rounded-[2px] border transition-colors ${
                  isActive
                    ? 'bg-[#232833] text-[#E8EAED] border-[#E8A33D]'
                    : 'bg-[#14171C] text-[#8B93A1] hover:text-[#E8EAED] border-[#2A2F3A]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6270]" />
          <input
            type="text"
            placeholder="Search reason, case #, reasoning..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#14171C] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] placeholder-[#5A6270] focus:outline-none focus:border-[#E8A33D] rounded-[2px]"
          />
        </div>
      </div>

      {/* ----------------- 3. EXCEPTIONS CARD FEED ----------------- */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 bg-[#1C2028] border border-[#2A2F3A] text-center space-y-3 font-mono text-xs text-[#8B93A1]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#E8A33D] mx-auto" />
            <div>FETCHING_EXCEPTION_RECORDS // PAGE {currentPage}...</div>
          </div>
        ) : error ? (
          <div className="p-8 bg-[#1C2028] border border-[#E1615A]/40 text-center space-y-3">
            <XCircle className="w-5 h-5 text-[#E1615A] mx-auto" />
            <div className="font-mono text-xs text-[#E1615A]">ERROR: {error}</div>
            <button
              onClick={fetchExceptions}
              className="px-3 py-1 bg-[#232833] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED]"
            >
              RETRY
            </button>
          </div>
        ) : !filteredExceptions || filteredExceptions.length === 0 ? (
          <div className="p-12 bg-[#1C2028] border border-[#2A2F3A] text-center space-y-3 font-mono text-xs text-[#5A6270]">
            <div className="w-9 h-9 rounded-full bg-[#14171C] border border-[#2A2F3A] flex items-center justify-center mx-auto text-[#8B93A1]">
              <AlertTriangle className="w-4 h-4 text-[#8B93A1]" />
            </div>
            <div className="text-[#E8EAED] font-semibold tracking-wide text-sm">
              NO EXCEPTIONS FOUND
            </div>
            <p className="text-[11px] text-[#8B93A1] max-w-sm mx-auto">
              {currentStatus
                ? `Filter active: status = "${currentStatus}". Zero exceptions match this criteria.`
                : searchFilter
                ? `No exceptions match query "${searchFilter}".`
                : 'No exception records found in the audit store.'}
            </p>
            {(currentStatus || searchFilter) && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    handleStatusFilter('');
                    setSearchFilter('');
                  }}
                  className="px-3 py-1.5 bg-[#14171C] hover:bg-[#232833] border border-[#2A2F3A] hover:border-[#E8A33D] text-xs font-mono text-[#E8A33D] transition-colors rounded-[2px]"
                >
                  RESET FILTERS // SHOW ALL EXCEPTIONS
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredExceptions.map((item) => {
              const isEscalated = item.status === 'ESCALATED';
              const statusBadgeBorder = isEscalated
                ? 'border-[#E8A33D]/30 text-[#E8A33D] bg-[#E8A33D]/10'
                : 'border-[#E1615A]/30 text-[#E1615A] bg-[#E1615A]/10';

              const calloutBorder = isEscalated
                ? 'border-l-4 border-l-[#E8A33D]'
                : 'border-l-4 border-l-[#E1615A]';

              return (
                <div
                  key={item.case_id}
                  className="p-5 bg-[#1C2028] border border-[#2A2F3A] hover:border-[#8B93A1] transition-all rounded-[2px] space-y-3.5"
                >
                  {/* Top Metadata Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#2A2F3A] gap-2">
                    <div className="flex items-center space-x-3">
                      <Link
                        to={`/cases/${item.case_id}`}
                        className="font-mono text-sm font-bold text-[#E8EAED] hover:text-[#4FD1A5] transition-colors"
                      >
                        {item.case_number || item.case_id}
                      </Link>

                      <span
                        className={`inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-mono rounded-[2px] border ${statusBadgeBorder}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isEscalated ? 'bg-[#E8A33D]' : 'bg-[#E1615A]'
                          }`}
                        />
                        <span>{item.status}</span>
                      </span>

                      {item.failure_reason && (
                        <span className="hidden sm:inline-block px-1.5 py-0.5 text-[11px] font-mono text-[#8B93A1] bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
                          {item.failure_reason}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 text-xs font-mono">
                      <div className="text-[#8B93A1]">
                        AMOUNT:{' '}
                        <strong className="text-[#E8EAED] text-sm">
                          {formatINR(item.amount)}
                        </strong>
                      </div>

                      <div className="text-[#5A6270] flex items-center space-x-1" title={formatFullDate(item.created_at)}>
                        <Clock className="w-3 h-3" />
                        <span>{formatShortDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Prominent Agent Reasoning Callout Box */}
                  <div
                    className={`p-4 bg-[#14171C] border border-[#2A2F3A] rounded-[2px] space-y-1.5 ${calloutBorder}`}
                  >
                    <div className="flex items-center space-x-2 text-[10px] font-mono uppercase tracking-wider text-[#5A6270]">
                      <Terminal className="w-3 h-3 text-[#E8A33D]" />
                      <span className="font-semibold text-[#8B93A1]">
                        Decision Reasoning (Why This Exception Occurred):
                      </span>
                    </div>

                    <p className="font-mono text-xs text-[#E8EAED] leading-relaxed pt-0.5">
                      {item.reasoning || 'No explicit decision reasoning text recorded.'}
                    </p>
                  </div>

                  {/* Card Bottom: Stats & Drilldown */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono text-[#8B93A1] pt-1 gap-2">
                    <div className="flex items-center space-x-4 text-[11px]">
                      <span>
                        CONFIDENCE:{' '}
                        <strong
                          className={
                            (item.confidence ?? 0) >= 0.8
                              ? 'text-[#4FD1A5]'
                              : (item.confidence ?? 0) >= 0.6
                              ? 'text-[#E8A33D]'
                              : 'text-[#E1615A]'
                          }
                        >
                          {item.confidence !== null && item.confidence !== undefined
                            ? `${(item.confidence * 100).toFixed(0)}%`
                            : '—'}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        ATTEMPTS: R:{item.retry_count} / N:{item.nudge_count}
                      </span>
                    </div>

                    <Link
                      to={`/cases/${item.case_id}`}
                      className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#14171C] hover:bg-[#232833] hover:text-[#E8EAED] border border-[#2A2F3A] hover:border-[#4FD1A5] text-[11px] font-mono text-[#4FD1A5] transition-all rounded-[2px] w-fit"
                    >
                      <span>INSPECT AUDIT TRAIL</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ----------------- 4. PAGINATION CONTROLS ----------------- */}
        {data && data.total_pages > 1 && (
          <div className="px-4 py-3 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-[#8B93A1]">
            <div>
              SHOWING PAGE <strong className="text-[#E8EAED]">{data.page}</strong> OF{' '}
              <strong className="text-[#E8EAED]">{data.total_pages}</strong> ({data.total} TOTAL EXCEPTIONS)
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(data.page - 1)}
                disabled={data.page <= 1}
                className="flex items-center space-x-1 px-2.5 py-1 bg-[#14171C] hover:bg-[#232833] disabled:opacity-30 disabled:cursor-not-allowed border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors rounded-[2px]"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>PREV</span>
              </button>

              <div className="px-2 font-mono text-[#E8EAED]">
                {data.page} / {data.total_pages}
              </div>

              <button
                onClick={() => handlePageChange(data.page + 1)}
                disabled={data.page >= data.total_pages}
                className="flex items-center space-x-1 px-2.5 py-1 bg-[#14171C] hover:bg-[#232833] disabled:opacity-30 disabled:cursor-not-allowed border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors rounded-[2px]"
              >
                <span>NEXT</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExceptionsPage;
