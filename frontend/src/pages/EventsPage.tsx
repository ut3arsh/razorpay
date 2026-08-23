import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  AlertCircle,
  XCircle,
  FileCode,
} from 'lucide-react';
import { api, type PaymentEvent, type PaginatedResponse } from '../lib/api';

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

export const EventsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<PaymentEvent> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentStatus = searchParams.get('status') || '';
  const currentLimit = 15;

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPaymentEvents({
        page: currentPage,
        limit: currentLimit,
        status: currentStatus || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load payment events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
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

  // Client-side text filter by payment ID, order ID, error code, or customer ID
  const filteredEvents = data?.data.filter((ev) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const payId = (ev.payment_id || '').toLowerCase();
    const ordId = (ev.order_id || '').toLowerCase();
    const errCode = (ev.error_code || '').toLowerCase();
    const errDesc = (ev.error_description || '').toLowerCase();
    const custId = (ev.customer_id || ev.customer_email || '').toLowerCase();
    return (
      payId.includes(q) ||
      ordId.includes(q) ||
      errCode.includes(q) ||
      errDesc.includes(q) ||
      custId.includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* ----------------- Header & Sync ----------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#2A2F3A] gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-[10px] tracking-widest text-[#6B8AFA] uppercase bg-[#6B8AFA]/10 px-1.5 py-0.5 border border-[#6B8AFA]/20">
              STREAM // 04
            </span>
            <span className="font-mono text-xs text-[#5A6270]">
              TOTAL: {data?.total ?? '—'} INGESTED EVENTS
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#E8EAED] tracking-tight mt-1">
            Payment Events Explorer
          </h1>
          <p className="text-xs text-[#8B93A1] font-sans mt-0.5">
            Raw webhook payload stream browser: inspect synthetic edge cases, duplicate deliveries, and gateway error codes.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchEvents}
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
            { label: 'ALL EVENTS', value: '' },
            { label: 'failed', value: 'failed' },
            { label: 'captured', value: 'captured' },
          ].map((tab) => {
            const isActive = currentStatus === tab.value;
            return (
              <button
                key={tab.label}
                onClick={() => handleStatusFilter(tab.value)}
                className={`px-3 py-1 text-xs font-mono rounded-[2px] border transition-colors ${
                  isActive
                    ? 'bg-[#232833] text-[#E8EAED] border-[#6B8AFA]'
                    : 'bg-[#14171C] text-[#8B93A1] hover:text-[#E8EAED] border-[#2A2F3A]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Quick Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6270]" />
          <input
            type="text"
            placeholder="Search payment_id, error_code..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#14171C] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] placeholder-[#5A6270] focus:outline-none focus:border-[#6B8AFA] rounded-[2px]"
          />
        </div>
      </div>

      {/* ----------------- Raw Events Table ----------------- */}
      <div className="border border-[#2A2F3A] bg-[#1C2028] rounded-[2px] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3 font-mono text-xs text-[#8B93A1]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#6B8AFA] mx-auto" />
            <div>INGESTING_WEBHOOK_EVENTS // PAGE {currentPage}...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3 border-t border-[#E1615A]/40 bg-[#14171C]">
            <XCircle className="w-5 h-5 text-[#E1615A] mx-auto" />
            <div className="font-mono text-xs text-[#E1615A]">ERROR: {error}</div>
            <button
              onClick={fetchEvents}
              className="px-3 py-1 bg-[#232833] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED]"
            >
              RETRY
            </button>
          </div>
        ) : !filteredEvents || filteredEvents.length === 0 ? (
          <div className="p-12 text-center space-y-3 font-mono text-xs text-[#5A6270]">
            <div className="w-9 h-9 rounded-full bg-[#14171C] border border-[#2A2F3A] flex items-center justify-center mx-auto text-[#8B93A1]">
              <FileCode className="w-4 h-4 text-[#8B93A1]" />
            </div>
            <div className="text-[#E8EAED] font-semibold tracking-wide text-sm">
              NO PAYMENT EVENTS FOUND
            </div>
            <p className="text-[11px] text-[#8B93A1] max-w-sm mx-auto">
              {currentStatus
                ? `Filter active: status = "${currentStatus}". Zero ingested events match this status.`
                : searchFilter
                ? `No payment events match query "${searchFilter}".`
                : 'The raw payment event stream is currently empty.'}
            </p>
            {(currentStatus || searchFilter) && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    handleStatusFilter('');
                    setSearchFilter('');
                  }}
                  className="px-3 py-1.5 bg-[#14171C] hover:bg-[#232833] border border-[#2A2F3A] hover:border-[#6B8AFA] text-xs font-mono text-[#6B8AFA] transition-colors rounded-[2px]"
                >
                  RESET FILTERS // SHOW ALL EVENTS
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2A2F3A] bg-[#14171C] text-[10px] font-mono font-semibold tracking-wider text-[#5A6270] uppercase">
                  <th className="py-3 px-4">Payment ID</th>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Event Status</th>
                  <th className="py-3 px-4">Error Code</th>
                  <th className="py-3 px-4">Error Description</th>
                  <th className="py-3 px-4">Ingested At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2F3A]/60 text-xs">
                {filteredEvents.map((ev) => {
                  const numAmount = Number(ev.amount);
                  const isMalformed = isNaN(numAmount) || numAmount <= 0;

                  return (
                    <tr
                      key={ev.id}
                      className="hover:bg-[#232833]/60 transition-colors"
                    >
                      {/* Payment ID */}
                      <td className="py-3.5 px-4 font-mono font-medium text-[#E8EAED] select-all">
                        <span className="hover:text-[#4FD1A5] transition-colors" title={ev.id}>
                          {ev.payment_id}
                        </span>
                      </td>

                      {/* Order ID */}
                      <td className="py-3.5 px-4 font-mono text-[#8B93A1]">
                        {ev.order_id || <span className="text-[#5A6270]">—</span>}
                      </td>

                      {/* Amount with EDGE_CASE annotation */}
                      <td className="py-3.5 px-4 font-mono text-right text-[#E8EAED] font-semibold whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5 whitespace-nowrap">
                          {isMalformed && (
                            <span
                              title="Synthetic test data: malformed amount"
                              className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-mono text-[#E8A33D] bg-[#E8A33D]/10 border border-[#E8A33D]/30 rounded-[2px] whitespace-nowrap flex-shrink-0"
                            >
                              <AlertCircle className="w-2.5 h-2.5 text-[#E8A33D]" />
                              <span>EDGE_CASE</span>
                            </span>
                          )}
                          <span className="whitespace-nowrap">{formatINR(ev.amount)}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono rounded-[2px] border ${
                            ev.status === 'failed'
                              ? 'text-[#E1615A] bg-[#E1615A]/10 border-[#E1615A]/20'
                              : 'text-[#4FD1A5] bg-[#4FD1A5]/10 border-[#4FD1A5]/20'
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>

                      {/* Error Code */}
                      <td className="py-3.5 px-4 font-mono">
                        {ev.error_code ? (
                          <span
                            className="px-1.5 py-0.5 text-[11px] text-[#E1615A] bg-[#14171C] border border-[#2A2F3A] rounded-[2px] inline-block max-w-[200px] truncate"
                            title={ev.error_code}
                          >
                            {ev.error_code}
                          </span>
                        ) : (
                          <span className="text-[#5A6270]">—</span>
                        )}
                      </td>

                      {/* Error Description */}
                      <td className="py-3.5 px-4 font-sans text-xs text-[#8B93A1] max-w-xs">
                        {ev.error_description ? (
                          <div
                            className="truncate"
                            title={ev.error_description}
                          >
                            {ev.error_description}
                          </div>
                        ) : (
                          <span className="text-[#5A6270] font-mono">—</span>
                        )}
                      </td>

                      {/* Created At */}
                      <td
                        className="py-3.5 px-4 font-mono text-[11px] text-[#5A6270]"
                        title={formatFullDate(ev.created_at)}
                      >
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-[#5A6270]" />
                          <span>{formatShortDate(ev.created_at)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ----------------- Pagination Controls ----------------- */}
        {data && data.total_pages > 1 && (
          <div className="px-4 py-3 bg-[#14171C] border-t border-[#2A2F3A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-[#8B93A1]">
            <div>
              SHOWING PAGE <strong className="text-[#E8EAED]">{data.page}</strong> OF{' '}
              <strong className="text-[#E8EAED]">{data.total_pages}</strong> ({data.total} TOTAL EVENTS)
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

export default EventsPage;
