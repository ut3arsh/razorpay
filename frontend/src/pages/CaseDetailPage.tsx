import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft,
  RefreshCw,
  Clock,
  XCircle,
  FileText,
  Terminal,
  Layers,
  Zap,
  Tag,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Code2,
} from 'lucide-react';
import {
  api,
  type RecoveryCase,
  type AuditLogEntry,
  type AgentDecision,
} from '../lib/api';
import { StatusBadge } from './CasesPage';

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

function formatFullDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-GB', {
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

// Deterministic slight rotation for the signature ledger stamp
function getStampRotation(index: number, state: string): string {
  const rotations = [-5, 6, -4, 5, -6, 4];
  const charSum = (state || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rot = rotations[(index + charSum) % rotations.length];
  return `rotate(${rot}deg)`;
}

export const CaseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [recoveryCase, setRecoveryCase] = useState<RecoveryCase | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trail' | 'decisions' | 'raw'>('trail');

  const fetchCaseDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [caseRes, auditRes, decisionsRes] = await Promise.all([
        api.getRecoveryCaseById(id),
        api.getCaseAuditLogs(id),
        api.getCaseDecisions(id),
      ]);
      setRecoveryCase(caseRes);
      // Ensure chronological ordering: oldest first for audit trails
      const sortedAudit = (auditRes.data || []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const sortedDecisions = (decisionsRes.data || []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setAuditLogs(sortedAudit);
      setDecisions(sortedDecisions);
    } catch (err: any) {
      setError(err?.message || 'Failed to load recovery case detail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="border border-[#2A2F3A] bg-[#1C2028] p-12 text-center space-y-3">
          <RefreshCw className="w-5 h-5 animate-spin text-[#4FD1A5] mx-auto" />
          <div className="font-mono text-xs text-[#8B93A1]">
            RECONSTRUCTING_AUDIT_TRAIL // CASE_ID: {id}...
          </div>
        </div>
      </div>
    );
  }

  if (error || !recoveryCase) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="border border-[#E1615A]/40 bg-[#1C2028] p-8 space-y-4">
          <div className="flex items-center space-x-2 text-[#E1615A] font-mono text-sm font-bold">
            <XCircle className="w-5 h-5" />
            <span>AUDIT RECORD NOT FOUND</span>
          </div>
          <p className="font-mono text-xs text-[#8B93A1] bg-[#14171C] p-3 border border-[#2A2F3A]">
            {error || 'Unable to locate recovery case'}
          </p>
          <Link
            to="/cases"
            className="inline-flex items-center space-x-2 px-3 py-1.5 bg-[#232833] text-xs font-mono text-[#E8EAED] border border-[#2A2F3A]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>RETURN TO CASES LEDGER</span>
          </Link>
        </div>
      </div>
    );
  }

  const pe = recoveryCase.paymentEvent;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      {/* ----------------- Breadcrumbs & Navigation ----------------- */}
      <div className="flex items-center justify-between pb-2">
        <Link
          to="/cases"
          className="inline-flex items-center space-x-1.5 text-xs font-mono text-[#8B93A1] hover:text-[#4FD1A5] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>BACK TO CASES LEDGER</span>
        </Link>

        <button
          onClick={fetchCaseDetails}
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#1C2028] hover:bg-[#232833] border border-[#2A2F3A] text-xs font-mono text-[#8B93A1] hover:text-[#E8EAED] transition-colors rounded-[2px]"
        >
          <RefreshCw className="w-3 h-3" />
          <span>REFRESH</span>
        </button>
      </div>

      {/* ----------------- 1. CASE HEADER & METADATA ----------------- */}
      <div className="border border-[#2A2F3A] bg-[#1C2028] p-6 rounded-[2px] space-y-6">
        {/* Top Row: Case Number & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2A2F3A] pb-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-[#5A6270]">
              <span>RECOVERY_CASE_NUMBER</span>
              <span>•</span>
              <span className="text-[#8B93A1]">UUID: {recoveryCase.id}</span>
            </div>
            <h1 className="font-mono text-3xl font-bold text-[#E8EAED] tracking-tight">
              {recoveryCase.case_number || 'RC-UNASSIGNED'}
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <StatusBadge status={recoveryCase.status} />
            {recoveryCase.terminal && (
              <span className="px-2 py-0.5 text-[10px] font-mono text-[#8B93A1] bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
                TERMINAL STATE
              </span>
            )}
          </div>
        </div>

        {/* Case Core Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs font-mono">
          <div className="p-3 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
            <div className="text-[#5A6270] text-[10px] uppercase">Amount</div>
            <div className="text-base font-bold text-[#E8EAED] mt-0.5">
              {formatINR(pe?.amount)}
            </div>
          </div>

          <div className="p-3 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
            <div className="text-[#5A6270] text-[10px] uppercase">Failure Reason</div>
            <div className="text-sm font-bold text-[#4FD1A5] mt-0.5 truncate" title={recoveryCase.failure_reason || ''}>
              {recoveryCase.failure_reason || 'unknown'}
            </div>
          </div>

          <div className="p-3 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
            <div className="text-[#5A6270] text-[10px] uppercase">Confidence</div>
            <div className="text-base font-bold text-[#E8EAED] mt-0.5">
              {recoveryCase.confidence !== null && recoveryCase.confidence !== undefined
                ? `${(recoveryCase.confidence * 100).toFixed(0)}%`
                : '—'}
            </div>
          </div>

          <div className="p-3 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
            <div className="text-[#5A6270] text-[10px] uppercase">Retry Budget</div>
            <div className="text-base font-bold text-[#E8EAED] mt-0.5">
              {recoveryCase.retry_count} / {recoveryCase.max_retries}
            </div>
          </div>

          <div className="p-3 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
            <div className="text-[#5A6270] text-[10px] uppercase">Nudge Count</div>
            <div className="text-base font-bold text-[#E8EAED] mt-0.5">
              {recoveryCase.nudge_count} / 2
            </div>
          </div>

          <div className="p-3 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
            <div className="text-[#5A6270] text-[10px] uppercase">Settled Recovered</div>
            <div className="text-base font-bold text-[#4FD1A5] mt-0.5">
              {recoveryCase.recovered_amount ? formatINR(recoveryCase.recovered_amount) : '—'}
            </div>
          </div>
        </div>

        {/* Originating Payment Event Card */}
        {pe && (
          <div className="p-4 bg-[#14171C] border border-[#2A2F3A] rounded-[2px] space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#8B93A1] font-semibold flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-[#6B8AFA]" />
                <span>ORIGINATING PAYMENT EVENT (INCIDENT SOURCE)</span>
              </span>
              <span className="text-[#5A6270]">
                RECEIVED: {formatFullDate(pe.created_at)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
              <div className="space-y-1 min-w-0">
                <div className="text-[#5A6270] text-[10px]">PAYMENT ID:</div>
                <div
                  className="text-[#E8EAED] select-all bg-[#1C2028] px-2 py-1 border border-[#2A2F3A] rounded-[2px] truncate"
                  title={pe.payment_id}
                >
                  {pe.payment_id}
                </div>
              </div>
              <div className="space-y-1 min-w-0">
                <div className="text-[#5A6270] text-[10px]">ERROR CODE:</div>
                <div
                  className="text-[#E1615A] bg-[#1C2028] px-2 py-1 border border-[#2A2F3A] rounded-[2px] truncate hover:whitespace-normal hover:break-all transition-all"
                  title={pe.error_code || 'BAD_REQUEST_PAYMENT_FAILED'}
                >
                  {pe.error_code || 'BAD_REQUEST_PAYMENT_FAILED'}
                </div>
              </div>
              <div className="space-y-1 min-w-0">
                <div className="text-[#5A6270] text-[10px]">CUSTOMER ID:</div>
                <div
                  className="text-[#8B93A1] bg-[#1C2028] px-2 py-1 border border-[#2A2F3A] rounded-[2px] truncate"
                  title={pe.customer_id || pe.customer_email || 'CUST_ANONYMOUS'}
                >
                  {pe.customer_id || pe.customer_email || 'CUST_ANONYMOUS'}
                </div>
              </div>
            </div>

            {pe.error_description && (
              <div className="text-xs font-sans text-[#8B93A1] bg-[#1C2028] p-2.5 border border-[#2A2F3A] rounded-[2px]">
                <strong className="font-mono text-[10px] text-[#5A6270] block uppercase">Gateway Description:</strong>
                {pe.error_description}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ----------------- Navigation Tabs ----------------- */}
      <div className="flex items-center space-x-2 border-b border-[#2A2F3A]">
        <button
          onClick={() => setActiveTab('trail')}
          className={`px-4 py-2.5 font-mono text-xs tracking-wider border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'trail'
              ? 'border-[#4FD1A5] text-[#4FD1A5] font-semibold bg-[#1C2028]/40'
              : 'border-transparent text-[#8B93A1] hover:text-[#E8EAED]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>LEDGER STAMP AUDIT TRAIL ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('decisions')}
          className={`px-4 py-2.5 font-mono text-xs tracking-wider border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'decisions'
              ? 'border-[#6B8AFA] text-[#6B8AFA] font-semibold bg-[#1C2028]/40'
              : 'border-transparent text-[#8B93A1] hover:text-[#E8EAED]'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>AGENT DECISIONS & GUARDRAILS ({decisions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('raw')}
          className={`px-4 py-2.5 font-mono text-xs tracking-wider border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'raw'
              ? 'border-[#E8A33D] text-[#E8A33D] font-semibold bg-[#1C2028]/40'
              : 'border-transparent text-[#8B93A1] hover:text-[#E8EAED]'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>RAW WEBHOOK JSON</span>
        </button>
      </div>

      {/* ----------------- 2. LEDGER STAMP AUDIT TRAIL (SIGNATURE ELEMENT) ----------------- */}
      {activeTab === 'trail' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] font-semibold tracking-widest text-[#5A6270] uppercase">
                Audit Trail // Immutable State Transitions
              </div>
              <p className="text-xs text-[#8B93A1] font-sans mt-0.5">
                Every state transition stamped chronologically with actor attribution and metadata verification.
              </p>
            </div>
            <div className="font-mono text-xs text-[#5A6270]">
              TOTAL STAMPS: <strong className="text-[#E8EAED]">{auditLogs.length}</strong>
            </div>
          </div>

          <div className="p-6 md:p-8 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px]">
            {auditLogs.length === 0 ? (
              <div className="text-center py-12 font-mono text-xs text-[#5A6270]">
                NO AUDIT ENTRIES RECORDED FOR THIS CASE
              </div>
            ) : (
              <div className="relative pl-6 md:pl-10 space-y-8 before:absolute before:left-3 md:before:left-5 before:top-3 before:bottom-3 before:w-[2px] before:bg-[#2A2F3A]">
                {auditLogs.map((entry, index) => {
                  const stampRotation = getStampRotation(index, entry.to_state);

                  let stampColor = 'border-[#6B8AFA] text-[#6B8AFA] bg-[#6B8AFA]/10';
                  if (entry.to_state === 'RESOLVED') {
                    stampColor = 'border-[#4FD1A5] text-[#4FD1A5] bg-[#4FD1A5]/10';
                  } else if (entry.to_state === 'ESCALATED') {
                    stampColor = 'border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D]/10';
                  } else if (entry.to_state === 'STOPPED') {
                    stampColor = 'border-[#E1615A] text-[#E1615A] bg-[#E1615A]/10';
                  }

                  return (
                    <div key={entry.id} className="relative group">
                      {/* Timeline Dot on the Rule */}
                      <div
                        className={`absolute -left-6 md:-left-10 top-2.5 w-3 h-3 -translate-x-[5px] rounded-full border-2 border-[#1C2028] ${
                          entry.to_state === 'RESOLVED'
                            ? 'bg-[#4FD1A5]'
                            : entry.to_state === 'ESCALATED'
                            ? 'bg-[#E8A33D]'
                            : entry.to_state === 'STOPPED'
                            ? 'bg-[#E1615A]'
                            : 'bg-[#6B8AFA]'
                        }`}
                      />

                      {/* Stamp Content Container */}
                      <div className="p-5 bg-[#14171C] border border-[#2A2F3A] hover:border-[#8B93A1] transition-all rounded-[2px] space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          {/* Signature Ledger Stamp Visual */}
                          <div className="flex items-center space-x-3">
                            <div
                              style={{ transform: stampRotation }}
                              className={`px-3 py-1 text-xs font-mono font-bold tracking-widest uppercase border-2 shadow-sm inline-block rounded-[1px] transition-transform duration-200 group-hover:scale-105 ${stampColor}`}
                            >
                              [ {entry.to_state} ]
                            </div>

                            <div className="flex items-center space-x-1.5 text-xs font-mono text-[#8B93A1]">
                              <span>{entry.from_state || 'ORIGIN'}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#5A6270]" />
                              <span className="text-[#E8EAED] font-semibold">{entry.to_state}</span>
                            </div>
                          </div>

                          {/* Timestamp & Actor */}
                          <div className="text-right font-mono text-[11px] space-y-0.5">
                            <div className="text-[#E8EAED] flex items-center sm:justify-end space-x-1">
                              <Clock className="w-3 h-3 text-[#5A6270]" />
                              <span>{formatFullDate(entry.created_at)}</span>
                            </div>
                            <div className="text-[#5A6270] text-[10px]">
                              ACTOR: <span className="text-[#8B93A1]">{entry.actor_type}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Details */}
                        <div className="pt-2 border-t border-[#2A2F3A]/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono gap-2">
                          <div className="flex items-center space-x-2">
                            <Tag className="w-3 h-3 text-[#5A6270]" />
                            <span className="text-[#5A6270]">ACTION:</span>
                            <span className="text-[#E8EAED] font-semibold">{entry.action}</span>
                          </div>

                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                            <div className="text-[11px] text-[#8B93A1] bg-[#1C2028] px-2 py-1 border border-[#2A2F3A] rounded-[2px]">
                              META: {JSON.stringify(entry.metadata)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ----------------- 3. AGENT DECISIONS & GUARDRAILS ----------------- */}
      {activeTab === 'decisions' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] font-semibold tracking-widest text-[#5A6270] uppercase">
                Agent Decision History // Code Veto Power
              </div>
              <p className="text-xs text-[#8B93A1] font-sans mt-0.5">
                Every AI/deterministic evaluation with complete model provenance, guardrail verification, and reasoning.
              </p>
            </div>
            <div className="font-mono text-xs text-[#5A6270]">
              TOTAL DECISIONS: <strong className="text-[#E8EAED]">{decisions.length}</strong>
            </div>
          </div>

          <div className="space-y-4">
            {decisions.length === 0 ? (
              <div className="p-12 bg-[#1C2028] border border-[#2A2F3A] text-center font-mono text-xs text-[#5A6270]">
                NO AGENT DECISIONS RECORDED FOR THIS CASE
              </div>
            ) : (
              decisions.map((d, index) => {
                const checks = d.guardrail_checks || {};
                const checkKeys = Object.keys(checks);

                // Model badge styling
                let modelBadgeStyle = 'border-[#4FD1A5]/40 text-[#4FD1A5] bg-[#4FD1A5]/10';
                if (d.model_used?.includes('gemini')) {
                  modelBadgeStyle = 'border-[#A78BFA]/40 text-[#A78BFA] bg-[#8B5CF6]/10';
                } else if (d.model_used === 'mock') {
                  modelBadgeStyle = 'border-[#E8A33D]/40 text-[#E8A33D] bg-[#E8A33D]/10';
                }

                return (
                  <div
                    key={d.id}
                    className="p-6 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] space-y-4"
                  >
                    {/* Decision Top Line */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2A2F3A]">
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-xs text-[#5A6270]">#{index + 1}</span>
                        <div className="font-mono text-sm font-bold text-[#E8EAED]">
                          ACTION: <span className="text-[#4FD1A5]">{d.action}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 font-mono text-[10px] font-semibold border rounded-[2px] ${modelBadgeStyle}`}
                        >
                          MODEL: {d.model_used || 'rule'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3 text-xs font-mono text-[#8B93A1]">
                        <span>
                          CONFIDENCE:{' '}
                          <strong className="text-[#E8EAED]">
                            {d.confidence_score !== null && d.confidence_score !== undefined
                              ? `${(d.confidence_score * 100).toFixed(0)}%`
                              : '—'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span className="text-[#5A6270]">{formatFullDate(d.created_at)}</span>
                      </div>
                    </div>

                    {/* Reasoning Prose */}
                    <div className="space-y-1.5">
                      <div className="font-mono text-[10px] tracking-wider text-[#5A6270] uppercase flex items-center space-x-1">
                        <Terminal className="w-3 h-3 text-[#6B8AFA]" />
                        <span>Decision Reasoning</span>
                      </div>
                      <div className="p-3 bg-[#14171C] border border-[#2A2F3A] text-xs font-mono text-[#E8EAED] rounded-[2px] leading-relaxed">
                        {d.reasoning}
                      </div>
                    </div>

                    {/* Guardrails Verification Checklist (Code Veto Power Proof) */}
                    {checkKeys.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center space-x-2 text-[10px] font-mono text-[#5A6270] uppercase">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#4FD1A5]" />
                          <span>Guardrails Enforcement (Deterministic Code Veto Checklist)</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          {checkKeys.map((key) => {
                            const isPassed = checks[key] === true;
                            return (
                              <div
                                key={key}
                                className={`p-2 bg-[#14171C] border text-xs font-mono flex items-center justify-between rounded-[2px] ${
                                  isPassed
                                    ? 'border-[#4FD1A5]/30 text-[#E8EAED]'
                                    : 'border-[#E1615A]/30 text-[#E1615A]'
                                }`}
                              >
                                <span className="text-[11px] truncate" title={key}>
                                  {key.replace(/_/g, ' ')}
                                </span>
                                {isPassed ? (
                                  <span className="inline-flex items-center space-x-1 text-[#4FD1A5] text-[10px] bg-[#4FD1A5]/10 px-1 py-0.5 border border-[#4FD1A5]/20">
                                    <Check className="w-3 h-3" />
                                    <span>PASS</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 text-[#E1615A] text-[10px] bg-[#E1615A]/10 px-1 py-0.5 border border-[#E1615A]/20">
                                    <X className="w-3 h-3" />
                                    <span>VETO</span>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* ----------------- 4. RAW WEBHOOK JSON ----------------- */}
      {activeTab === 'raw' && (
        <section className="space-y-4">
          <div className="font-mono text-[10px] font-semibold tracking-widest text-[#5A6270] uppercase">
            Raw Ingested Webhook Payload & Case Metadata
          </div>
          <div className="p-4 bg-[#1C2028] border border-[#2A2F3A] rounded-[2px] space-y-4">
            <div>
              <div className="font-mono text-[11px] text-[#8B93A1] mb-1">
                PaymentEvent Raw Payload (JSON):
              </div>
              <pre className="p-4 bg-[#14171C] border border-[#2A2F3A] text-xs font-mono text-[#4FD1A5] overflow-x-auto rounded-[2px]">
                {JSON.stringify(pe?.raw_payload || pe, null, 2)}
              </pre>
            </div>

            <div>
              <div className="font-mono text-[11px] text-[#8B93A1] mb-1">
                RecoveryCase Full Record:
              </div>
              <pre className="p-4 bg-[#14171C] border border-[#2A2F3A] text-xs font-mono text-[#6B8AFA] overflow-x-auto rounded-[2px]">
                {JSON.stringify(recoveryCase, null, 2)}
              </pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default CaseDetailPage;
