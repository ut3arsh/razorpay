# Architecture

## 1. Data model

Four core tables, one supporting table:

```
PaymentEvent          the incident — a failed payment webhook
      │ 1:N
RecoveryCase           the stateful case being worked, one per PaymentEvent
      │ 1:N            (status, confidence, failure_reason, retry_count,
      │                 nudge_count, cooldown_until, terminal)
      ├──> AgentDecision      what the agent chose and why, every time
      └──> AuditLogEntry      from_state -> to_state, every transition

BatchRun               persisted snapshot of each full batch execution,
                        for reproducibility across runs over time
```

`PaymentEvent.payment_id` is intentionally **not unique** — Razorpay webhook
delivery is at-least-once, so the same payment can legitimately arrive twice.
Deduplication is application logic, not a schema constraint (see incident #1
in `NOTES.md` for why this wasn't the original design).

## 2. State machine

```
DETECTED
   │
   ▼
ANALYZING  ──classifyFailure()──>  failure_reason + confidence + source
   │
   ▼
DECISION  ──decideAction()──>  first-match guardrail rules, in order:
   │         1. confidence < 0.6              -> ESCALATE_HUMAN
   │         2. retry_count >= max_retries     -> STOPPED
   │         3. nudge_count >= 2                -> ESCALATE_HUMAN
   │         4. cooldown_until in future        -> NO_ACTION
   │         5. insufficient_funds, retries left -> RETRY_SCHEDULED (+24h)
   │         6. card_expired                     -> NUDGE_SENT
   │         7. bank_decline, retries < 2         -> RETRY_SCHEDULED (+6h)
   │         8. default                           -> ESCALATE_HUMAN
   ▼
EXECUTE ─────── NUDGE_SENT: real Razorpay Payment Link + real webhook outcome
   │            RETRY_SCHEDULED: simulateOutcome() [synthetic, documented —
   │                              Razorpay owns subscription retry scheduling]
   ▼
   ├─ success ──> RESOLVED (terminal)
   └─ failure ──> loop back to DECISION with incremented retry/nudge count,
                   until a stopping rule terminates the case
```

Every arrow above corresponds to exactly one `AgentDecision` row and one
`AuditLogEntry` row, written in the same Prisma transaction — a decision is
never logged without its matching state transition, or vice versa.

## 3. Classification: hybrid by design

```
PaymentEvent.error_code
      │
      ▼
  known pattern? ──yes──> confidence 1.0, source: 'rule'   (44/56 cases)
      │no
      ▼
  GEMINI_API_KEY set & call succeeds?
      │yes                              │no / fails / bad JSON
      ▼                                  ▼
 real classification              confidence 0.3, source: 'mock'
 source: 'llm'                    (forces ESCALATE_HUMAN — never
 (8/56 cases)                      fabricates a confident guess)
```

This hybrid split is a deliberate cost/latency/judgment decision, not a
technical limitation: sending a known `BAD_REQUEST_PAYMENT_CARD_EXPIRED` code
to an LLM would be slower, costlier, and adds a hallucination surface for zero
benefit. The LLM is reserved for cases that genuinely need judgment — vague
descriptions like *"Something went wrong during payment authorization."*

## 4. API surface

Read-only, all backed by the same Prisma layer:

```
GET /api/payment-events              raw incident browser, paginated, filterable
GET /api/recovery-cases              case ledger, paginated, filterable, includes PaymentEvent
GET /api/recovery-cases/:id          single case
GET /api/recovery-cases/:id/audit-log     full state-transition trail for one case
GET /api/recovery-cases/:id/decisions     full agent-decision trail for one case
GET /api/metrics/batch-report         live-computed BatchReport from current DB state
GET /api/metrics/batch-history        persisted BatchRun records, for reproducibility
GET /api/exceptions                   ESCALATED + STOPPED cases with reasoning,
                                       server-side aggregated summary (not paginated-slice math)
GET /api/health                       liveness check, used by the dashboard's connection badge
```

`computeBatchReport()` is a single shared module used by both the batch script
and the live API route — the two can never silently drift apart, by
construction rather than by discipline.

## 5. Frontend

Single design system (audit-ledger aesthetic — see `docs/sprint4-design-doc.md`
for the full token spec), five routes:

```
/              Overview — hero recovery number, quick stats, batch history trend
/cases         Case ledger — filterable, searchable, paginated
/cases/:id     Case detail — signature ledger-stamp audit trail + decision
               timeline + guardrail-check visualization + raw JSON
/exceptions    Every non-recovered case with full reasoning surfaced inline
/events        Raw PaymentEvent browser, including flagged synthetic edge cases
```

The case-detail page's audit trail is the single screen most directly answering
Razorpay's "would you trust it" bar — every state transition rendered as a
literal timestamped stamp, with the underlying decision JSON visible alongside
it, not hidden behind a summary.

## 6. Why this scopes cleanly to the rest of Track 03

The pipeline is **Ingest Event → Classify → Bounded Decision → Execute →
Immutable Log**, and nothing in that pipeline is specific to subscription
payments. Extending to another Track 03 direction means:

- **New event schema** (e.g. `InvoiceOverdueEvent` instead of `PaymentEvent`)
- **New classification categories** (e.g. `cashflow_delay`, `dispute` instead
  of `insufficient_funds`, `card_expired`)
- **New action adapters** (e.g. WhatsApp outreach instead of a payment retry)

The state machine, guardrail engine, decision logging, and audit trail are
untouched. We did not build this generalization — it would have meant three
loops built shallow instead of one built correctly — but the architecture
supports it without a rewrite, which is a testable claim, not a marketing one.