const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface BatchReport {
  batch_id?: string;
  total_cases: number;
  resolved: number;
  escalated: number;
  stopped_max_retries: number;
  no_action: number;
  retry_scheduled_pending: number;
  nudge_sent_pending: number;
  amount_recovered_paise: number;
  amount_at_risk_paise: number;
  recovery_rate_pct: number;
  false_escalation_rate_pct: number;
  generated_at: string;
}

export interface BatchRun {
  id: string;
  batch_id: string;
  total_cases: number;
  resolved: number;
  escalated: number;
  stopped_max_retries: number;
  no_action: number;
  retry_scheduled_pending: number;
  nudge_sent_pending: number;
  amount_recovered_paise: number;
  amount_at_risk_paise: number;
  recovery_rate_pct: number;
  false_escalation_rate_pct: number;
  created_at: string;
}

export interface ExceptionSummary {
  total_count: number;
  escalated_count: number;
  stopped_count: number;
  total_amount_at_risk: number;
}

export interface ExceptionItem {
  case_id: string;
  case_number: string | null;
  status: string;
  failure_reason: string | null;
  confidence: number | null;
  retry_count: number;
  nudge_count: number;
  amount: number | null;
  currency: string;
  reasoning: string | null;
  created_at: string;
}

export interface ExceptionsResponse extends PaginatedResponse<ExceptionItem> {
  summary?: ExceptionSummary;
}

export interface PaymentEvent {
  id: string;
  payment_id: string;
  order_id: string | null;
  merchant_id: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  amount: number | string;
  currency: string;
  status: string;
  method: string | null;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  raw_payload?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface RecoveryCase {
  id: string;
  payment_event_id: string;
  case_number: string | null;
  status: string;
  confidence: number | null;
  failure_reason: string | null;
  retry_count: number;
  nudge_count: number;
  max_retries: number;
  next_retry_at: string | null;
  cooldown_until: string | null;
  terminal: boolean;
  recovered_amount: number | string | null;
  recovered_at: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  paymentEvent?: PaymentEvent;
}

export interface AuditLogEntry {
  id: string;
  recovery_case_id: string;
  from_state: string | null;
  to_state: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  metadata?: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AgentDecision {
  id: string;
  recovery_case_id: string;
  agent_name: string;
  model_used: string | null;
  action: string;
  confidence_score: number | null;
  reasoning: string;
  parameters?: Record<string, any> | null;
  guardrail_checks?: Record<string, boolean> | null;
  execution_status: string;
  execution_result?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface CaseAuditLogsResponse {
  recovery_case_id: string;
  total: number;
  data: AuditLogEntry[];
}

export interface CaseDecisionsResponse {
  recovery_case_id: string;
  total: number;
  data: AgentDecision[];
}

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      errorDetail = errJson.error || errJson.message || errorDetail;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  return res.json() as Promise<T>;
}

function buildQueryString(params: Record<string, any> = {}): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  getHealth(): Promise<HealthResponse> {
    return fetchJson<HealthResponse>('/api/health');
  },

  getBatchReport(): Promise<BatchReport> {
    return fetchJson<BatchReport>('/api/metrics/batch-report');
  },

  getBatchHistory(params?: PaginationQuery): Promise<PaginatedResponse<BatchRun>> {
    return fetchJson<PaginatedResponse<BatchRun>>(
      `/api/metrics/batch-history${buildQueryString(params)}`
    );
  },

  getExceptions(params?: {
    page?: number;
    limit?: number;
    status?: 'ESCALATED' | 'STOPPED';
  }): Promise<ExceptionsResponse> {
    return fetchJson<ExceptionsResponse>(
      `/api/exceptions${buildQueryString(params)}`
    );
  },

  getPaymentEvents(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PaginatedResponse<PaymentEvent>> {
    return fetchJson<PaginatedResponse<PaymentEvent>>(
      `/api/payment-events${buildQueryString(params)}`
    );
  },

  getRecoveryCases(params?: {
    page?: number;
    limit?: number;
    status?: string;
    terminal?: boolean;
  }): Promise<PaginatedResponse<RecoveryCase>> {
    return fetchJson<PaginatedResponse<RecoveryCase>>(
      `/api/recovery-cases${buildQueryString(params)}`
    );
  },

  getRecoveryCaseById(id: string): Promise<RecoveryCase> {
    return fetchJson<RecoveryCase>(`/api/recovery-cases/${id}`);
  },

  getCaseAuditLogs(id: string): Promise<CaseAuditLogsResponse> {
    return fetchJson<CaseAuditLogsResponse>(`/api/recovery-cases/${id}/audit-log`);
  },

  getCaseDecisions(id: string): Promise<CaseDecisionsResponse> {
    return fetchJson<CaseDecisionsResponse>(`/api/recovery-cases/${id}/decisions`);
  },
};

export default api;
