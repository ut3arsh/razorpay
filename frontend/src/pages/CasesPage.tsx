import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Layers,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowUpRight,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { api, type RecoveryCase, type PaginatedResponse } from '../lib/api';

function formatINR(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  const val = Number(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
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

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'RESOLVED':
      return (
        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-mono text-[#4FD1A5] bg-[#4FD1A5]/10 border border-[#4FD1A5]/20 rounded-[2px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FD1A5]" />
          <span>RESOLVED</span>
        </span>
      );
    case 'ESCALATED':
      return (
        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-mono text-[#E8A33D] bg-[#E8A33D]/10 border border-[#E8A33D]/20 rounded-[2px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E8A33D]" />
          <span>ESCALATED</span>
        </span>
      );
    case 'STOPPED':
      return (
        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-mono text-[#E1615A] bg-[#E1615A]/10 border border-[#E1615A]/20 rounded-[2px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E1615A]" />
          <span>STOPPED</span>
        </span>
      );
    case 'OPEN':
    default:
      return (
        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-mono text-[#6B8AFA] bg-[#6B8AFA]/10 border border-[#6B8AFA]/20 rounded-[2px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6B8AFA] animate-pulse" />
          <span>{status || 'OPEN'}</span>
        </span>
      );
  }
};

export const CasesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<RecoveryCase> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentStatus = searchParams.get('status') || '';
  const currentLimit = 15;

  const fetchCases = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getRecoveryCases({
        page: currentPage,
        limit: currentLimit,
        status: currentStatus || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load recovery cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
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

  // Client-side text search by case number or failure reason
  const filteredCases = data?.data.filter((c) => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    const caseNum = (c.case_number || '').toLowerCase();
    const reason = (c.failure_reason || '').toLowerCase();
    const paymentId = (c.paymentEvent?.payment_id || '').toLowerCase();
    const custId = (c.paymentEvent?.customer_id || '').toLowerCase();
    return (
      caseNum.includes(query) ||
      reason.includes(query) ||
      paymentId.includes(query) ||
      custId.includes(query)
    );
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* ----------------- Header & Controls ----------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#2A2F3A] gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-[10px] tracking-widest text-[#4FD1A5] uppercase bg-[#4FD1A5]/10 px-1.5 py-0.5 border border-[#4FD1A5]/20">
              LEDGER // 02
            </span>
            <span className="font-mono text-xs text-[#5A6270]">
              TOTAL: {data?.total ?? '—'} CASES
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#E8EAED] tracking-tight mt-1">
            Recovery Cases Ledger
          </h1>
          <p className="text-xs text-[#8B93A1] font-sans mt-0.5">
            Paginated record of all automated recovery lifecycles, states, and decisions.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchCases}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-1.5 bg-[#1C2028] hover:bg-[#232833] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors rounded-[2px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#8B93A1] ${loading ? 'animate-spin' : ''}`} />
            <span>SYNC</span>
          </button>
        </div>
      </div>

      {/* ----------------- Filters & Search Bar ----------------- */}
      <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-[#5A6270] mr-2 flex items-center space-x-1">
            <Filter className="w-3 h-3" />
            <span>STATUS:</span>
          </span>
          {[
            { label: 'ALL', value: '' },
            { label: 'OPEN', value: 'OPEN' },
            { label: 'RESOLVED', value: 'RESOLVED' },
            { label: 'ESCALATED', value: 'ESCALATED' },
            { label: 'STOPPED', value: 'STOPPED' },
          ].map((tab) => {
            const isActive = currentStatus === tab.value;
            return (
              <button
                key={tab.label}
                onClick={() => handleStatusFilter(tab.value)}
                className={`px-2.5 py-1 text-xs font-mono rounded-[2px] border transition-colors ${
                  isActive
                    ? 'bg-[#232833] text-[#E8EAED] border-[#4FD1A5]'
                    : 'bg-[#14171C] text-[#8B93A1] hover:text-[#E8EAED] border-[#2A2F3A]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Quick Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6270]" />
          <input
            type="text"
            placeholder="Search case #, failure..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#14171C] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] placeholder-[#5A6270] focus:outline-none focus:border-[#4FD1A5] rounded-[2px]"
          />
        </div>
      </div>

      {/* ----------------- Cases Table / Ledger ----------------- */}
      <div className="border border-[#2A2F3A] bg-[#1C2028] rounded-[2px] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3 font-mono text-xs text-[#8B93A1]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#4FD1A5] mx-auto" />
            <div>QUERYING_RECOVERY_CASES // PAGE {currentPage}...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3 border-t border-[#E1615A]/40 bg-[#14171C]">
            <AlertCircle className="w-5 h-5 text-[#E1615A] mx-auto" />
            <div className="font-mono text-xs text-[#E1615A]">ERROR: {error}</div>
            <button
              onClick={fetchCases}
              className="px-3 py-1 bg-[#232833] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED]"
            >
              RETRY
            </button>
          </div>
        ) : !filteredCases || filteredCases.length === 0 ? (
          <div className="p-12 text-center space-y-3 font-mono text-xs text-[#5A6270]">
            <div className="w-9 h-9 rounded-full bg-[#14171C] border border-[#2A2F3A] flex items-center justify-center mx-auto text-[#8B93A1]">
              <Layers className="w-4 h-4 text-[#8B93A1]" />
            </div>
            <div className="text-[#E8EAED] font-semibold tracking-wide text-sm">
              NO RECOVERY CASES FOUND
            </div>
            <p className="text-[11px] text-[#8B93A1] max-w-sm mx-auto">
              {currentStatus
                ? `Filter active: status = "${currentStatus}". Zero cases currently match this lifecycle state.`
                : searchFilter
                ? `No recovery cases match query "${searchFilter}".`
                : 'The recovery cases ledger is currently empty.'}
            </p>
            {(currentStatus || searchFilter) && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    handleStatusFilter('');
                    setSearchFilter('');
                  }}
                  className="px-3 py-1.5 bg-[#14171C] hover:bg-[#232833] border border-[#2A2F3A] hover:border-[#4FD1A5] text-xs font-mono text-[#4FD1A5] transition-colors rounded-[2px]"
                >
                  RESET FILTERS // SHOW ALL CASES
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2A2F3A] bg-[#14171C] text-[10px] font-mono font-semibold tracking-wider text-[#5A6270] uppercase">
                  <th className="py-3 px-4">Case ID / Number</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Failure Reason</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Attempts</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2F3A]/60 text-xs">
                {filteredCases.map((rc) => (
                  <tr
                    key={rc.id}
                    className="hover:bg-[#232833]/60 transition-colors group cursor-pointer"
                  >
                    {/* Case Number */}
                    <td className="py-3.5 px-4 font-mono font-medium text-[#E8EAED]">
                      <Link
                        to={`/cases/${rc.id}`}
                        className="flex items-center space-x-1.5 hover:text-[#4FD1A5] transition-colors"
                      >
                        <span>{rc.case_number || rc.id.substring(0, 13)}</span>
                      </Link>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <StatusBadge status={rc.status} />
                    </td>

                    {/* Failure Reason */}
                    <td className="py-3.5 px-4 font-mono text-[#8B93A1]">
                      {rc.failure_reason ? (
                        <span className="px-1.5 py-0.5 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
                          {rc.failure_reason}
                        </span>
                      ) : (
                        <span className="text-[#5A6270]">—</span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="py-3.5 px-4 font-mono">
                      {rc.confidence !== null && rc.confidence !== undefined ? (
                        <span
                          className={
                            rc.confidence >= 0.8
                              ? 'text-[#4FD1A5]'
                              : rc.confidence >= 0.6
                              ? 'text-[#E8A33D]'
                              : 'text-[#E1615A]'
                          }
                        >
                          {(rc.confidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[#5A6270]">—</span>
                      )}
                    </td>

                    {/* Retry / Nudge Counts */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#8B93A1]">
                      <span title={`Retries: ${rc.retry_count}/${rc.max_retries}, Nudges: ${rc.nudge_count}`}>
                        R:{rc.retry_count}/{rc.max_retries} • N:{rc.nudge_count}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 font-mono text-right text-[#E8EAED] font-semibold whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1.5 whitespace-nowrap">
                        {rc.paymentEvent?.amount !== undefined &&
                          rc.paymentEvent?.amount !== null &&
                          Number(rc.paymentEvent.amount) <= 0 && (
                            <span
                              title="Synthetic test data: malformed amount"
                              className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-mono text-[#E8A33D] bg-[#E8A33D]/10 border border-[#E8A33D]/30 rounded-[2px] whitespace-nowrap flex-shrink-0"
                            >
                              <AlertCircle className="w-2.5 h-2.5 text-[#E8A33D]" />
                              <span>EDGE_CASE</span>
                            </span>
                          )}
                        <span className="whitespace-nowrap">{formatINR(rc.paymentEvent?.amount)}</span>
                      </div>
                    </td>

                    {/* Created At */}
                    <td
                      className="py-3.5 px-4 font-mono text-[11px] text-[#5A6270]"
                      title={formatFullDate(rc.created_at)}
                    >
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-[#5A6270]" />
                        <span>{formatShortDate(rc.created_at)}</span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/cases/${rc.id}`}
                        className="inline-flex items-center space-x-1 px-2 py-1 bg-[#14171C] hover:bg-[#4FD1A5] hover:text-[#14171C] border border-[#2A2F3A] group-hover:border-[#4FD1A5] text-[11px] font-mono text-[#8B93A1] transition-all rounded-[2px]"
                      >
                        <span>INSPECT</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ----------------- Pagination Controls ----------------- */}
        {data && data.total_pages > 1 && (
          <div className="px-4 py-3 bg-[#14171C] border-t border-[#2A2F3A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-[#8B93A1]">
            <div>
              SHOWING PAGE <strong className="text-[#E8EAED]">{data.page}</strong> OF{' '}
              <strong className="text-[#E8EAED]">{data.total_pages}</strong> ({data.total} TOTAL RECORDS)
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(data.page - 1)}
                disabled={data.page <= 1}
                className="flex items-center space-x-1 px-2.5 py-1 bg-[#1C2028] hover:bg-[#232833] disabled:opacity-30 disabled:cursor-not-allowed border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors rounded-[2px]"
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
                className="flex items-center space-x-1 px-2.5 py-1 bg-[#1C2028] hover:bg-[#232833] disabled:opacity-30 disabled:cursor-not-allowed border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] transition-colors rounded-[2px]"
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

export default CasesPage;
