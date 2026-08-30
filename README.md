# AI Revenue Recovery Engine
**Razorpay AI Buildathon — Track 03: AI Revenue Recovery**

A guardrailed autonomous agent that detects failed subscription/mandate payments, diagnoses why they failed, decides on a bounded recovery action, executes it within hard-coded safety limits, and logs every decision to an immutable audit trail.

**Benchmarked across 10 independent runs** (56 synthetic cases each, fresh reseed per run, real Gemini LLM classification on ambiguous cases every time — not a single cherry-picked number):
- **Recovery rate: 34.6% ± 6.0%** (range: 21.4%–42.9%) — ₹53,826.50 ± ₹8,656.46 recovered per batch
- **Escalation rate averages ~54%** — not an error rate; see [Metrics, honestly](#metrics-honestly) below
- **0 crashes, 0 unhandled failures, 0 hard-stops on max-retries** across all 10 runs — every case either resolved, is mid-retry, or was safely escalated
- **100% of decisions logged** with reasoning, confidence, and guardrail checks

---

## The problem we scoped

Track 03 offers six example directions. We deliberately picked **one**: failed subscription/mandate payment recovery. Not checkout abandonment, not B2B receivables, not a Hinglish voice agent — one recovery loop, built deep instead of five loops built shallow.

When a recurring auto-debit fails (a Netflix, gym, or SaaS subscription), most systems do one of two bad things: spam retries until the card gets blocked, or give up silently and lose the customer. This agent replaces both with a bounded, auditable, three-way decision: **retry, nudge, or escalate to a human** — never guess.

## Architecture

```
PaymentEvent (webhook)
      │
      ▼
 ANALYZING ──── classifyFailure()
      │          ├─ rule-based fast path (known error codes, confidence 1.0)
      │          ├─ Gemini LLM fallback (ambiguous/unknown, real reasoning)
      │          └─ safe mock fallback (API unavailable → confidence 0.3,
      │                                  forces escalation, never fabricates)
      ▼
 DECISION ────── decideAction()  [pure, deterministic, code holds veto power]
      │          ├─ confidence < 0.6           → ESCALATE_HUMAN
      │          ├─ retry_count ≥ max_retries  → STOPPED
      │          ├─ nudge_count ≥ 2            → ESCALATE_HUMAN
      │          ├─ cooldown active            → NO_ACTION
      │          └─ else: category-specific RETRY_SCHEDULED / NUDGE_SENT
      ▼
 EXECUTE ─────── NUDGE_SENT: real Razorpay Payment Link + webhook outcome
      │          RETRY_SCHEDULED: simulateOutcome() [synthetic — see note below]
      ▼
 LOG ─────────── AgentDecision + AuditLogEntry, written atomically
```

Every state transition, every decision, every confidence score, every guardrail check — written to Postgres before the case moves on. Nothing happens off the record.

**On outcome execution:** two of the three action types now use real Razorpay test-mode integration. `NUDGE_SENT` generates a real Payment Link via Razorpay's API, and case resolution is driven by a real, signature-verified webhook (`payment_link.paid`) when the customer actually pays it — not a simulation. `RETRY_SCHEDULED` remains a documented synthetic simulation: Razorpay's Subscriptions API handles payment retries automatically on its own schedule with no manual "retry now" endpoint to call, and in-sandbox testing hit recurring-payment card-eligibility restrictions that couldn't be resolved within the project timeline (see [`NOTES.md`](./NOTES.md), incident #4). This is a real, disclosed limitation, not an oversight — the guardrail and audit logic around retry scheduling is fully real; only the "did the bank actually approve it" step for retries specifically remains simulated.

## Stack

- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL (Supabase)
- **AI:** Google Gemini (`gemini-3.6-flash`) for ambiguous-case classification, with a rule-based fast path handling the majority of cases without any LLM call
- **Frontend:** React, Vite, TypeScript, Tailwind, React Router
- **Workflow:** Claude (architecture, prompt authoring, code review) + Antigravity (execution) — see [Build process](#build-process) below

## Where we used AI, and where we deliberately didn't

This is scored explicitly under "AI judgment," so we're stating it plainly:

- **Deterministic rule matching** handles ~78% of our dataset (44/56 cases) — known Razorpay error codes map directly to a failure category at confidence 1.0. No LLM call, no latency, no cost, no room for hallucination on cases that don't need judgment.
- **The LLM (Gemini) is used only where classification genuinely requires reasoning** — vague error descriptions like *"Payment could not be processed"* that don't map to a known code. ~14% of cases (8/56) in our run.
- **The remaining cases fall to a safe mock fallback** if the LLM is unavailable — a fixed low-confidence response that forces escalation rather than fabricating a confident guess. This fired for real during development when our original model was deprecated mid-build (see incident #3 below) — the system degraded safely instead of crashing or guessing.
- **All guardrails (max retries, cooldown, confidence threshold, nudge limits) are hard-coded, not LLM-decided.** The AI classifies; code holds veto power over every action. This is deliberate — an LLM should never be the thing deciding whether to keep hitting a customer's card.
- **Where the system integrates with real infrastructure, not just itself:** `NUDGE_SENT` calls Razorpay's real test-mode Payment Links API and reacts to a real, cryptographically-verified webhook when a customer pays — proven end-to-end with an actual test payment (see [`NOTES.md`](./NOTES.md), incident #5, including catching and fixing a real webhook signature verification bug along the way).

## Metrics, honestly

Razorpay's bar explicitly asks for **measured** recovery across a batch, not a cherry-picked demo. Rather than report one lucky run, we ran the full pipeline 10 independent times — fresh synthetic reseed each time, real Gemini classification on ambiguous cases every run — and report the range:

| Metric | Min | Max | Mean | Std Dev |
|---|---|---|---|---|
| Recovery rate | 21.4% | 42.9% | 34.6% | ± 6.0% |
| Amount recovered | ₹34,644 | ₹67,184 | ₹53,826.50 | ± ₹8,656.46 |
| Resolved cases | 12 | 24 | 19.4 | ± 3.4 |
| Escalated cases | 27 | 35 | 30.4 | ± 2.3 |
| Stopped (max retries) | 0 | 0 | 0 | ± 0 |

**On the always-zero "stopped" bucket:** across all 10 runs, no case ever hit the hard max-retries stop. This is a real, consistent property of this configuration, not an oversight — the escalation rule (`confidence < 0.6`) and the nudge-limit rule both tend to catch a non-resolving case before its `retry_count` exhausts, given the guardrail evaluation order. A case would only reach `STOPPED` if it kept getting reasonably-confident retry decisions that each failed in simulation up to the retry limit — possible, just less common than escalating first under this rule ordering.

**The variance between runs (21.4% to 42.9%)** comes entirely from the outcome simulator's random seed — the classification and decision logic are fully deterministic given the same inputs; only "did the simulated retry succeed" varies. Run `npm run benchmark` yourself to reproduce this distribution.

**On the ~54% average escalation rate** — this number does *not* mean the AI was wrong half the time. It bundles two very different outcomes: cases that were correctly diagnosed, correctly attempted a retry, and the retry simply didn't recover the money (a normal real-world outcome, not a model failure), plus a smaller set of genuinely low-confidence cases that correctly triggered the safety escalation instead of guessing. We surface the full reasoning for every one of these cases in the dashboard's Exceptions view — nothing here is a black box.

Every number above is reproducible: `npm run batch:run` recomputes it from scratch against the same seeded dataset, and every run is persisted to a `BatchRun` table so metrics can be compared across executions, not just trusted from a single lucky run.

## What broke, and how we got out

Three real engineering incidents from this build, in full detail in [`NOTES.md`](./NOTES.md):

1. **A DB unique constraint silently swallowed our own duplicate-webhook edge case.** Caught by checking the live API response instead of trusting a script's own success log. Fixed by recognizing dedup belongs in application logic for at-least-once delivery systems, not the schema.
2. **A retry-rule off-by-one was inflating our escalation rate.** `insufficient_funds` cases were only getting one retry attempt instead of their configured three. Found via honest data inspection, not by lowering a threshold to make the number look better — we fixed the underlying logic and let the metric move for the right reason (46.43% → 30.36% at that point in the build).
3. **Our LLM provider deprecated our model mid-build**, and our safety fallback caught it silently for several batch runs before we noticed via an explicit audit of `model_used`. The system never crashed — it degraded exactly to the safe, low-confidence escalation path it was designed for. We fixed our own observability, not the safety behavior, which was already correct.

## Build process

This was built as a "vibe-coded" project in the most literal, disciplined sense: Claude acted as architect — designing the state machine, schemas, guardrail rules, and writing precise, scoped prompts — while Antigravity executed each prompt and reported back results, which were then verified against real data (not just "the build passed") before moving to the next step. Every schema change, every bug fix, and every metric shift in this README was checked against actual API responses or database queries, not trusted from a summary log alone. Full incident detail in [`NOTES.md`](./NOTES.md).

## Running it locally

```bash
# Backend
npm install
npx prisma migrate dev
npm run db:seed          # seeds 56 synthetic PaymentEvents (idempotent — use
                          # db:seed:force to wipe and reseed)
npm run dev               # API on :3000
npm run batch:run          # runs the full agent pipeline with synthetic outcomes (safe to run repeatedly, no real API calls)
npm run batch:run:live     # runs the agent pipeline with real Razorpay test-mode Payment Links creation enabled (creates real test resources)
npm run benchmark         # runs 10 full reseed + batch recovery iterations, prints individual table + aggregate statistical distribution

# Frontend
cd frontend
npm install
npm run dev               # dashboard on :5173, expects API on :3000
```

`npm run batch:run` is safe to run repeatedly (synthetic outcomes only, no real API calls made to Razorpay). `npm run batch:run:live` sets `RAZORPAY_LIVE_MODE=true` to additionally exercise the real Razorpay Payment Links + webhook flow, creating real test-mode resources in the connected Razorpay account each time it is run.

Requires a `GEMINI_API_KEY` in `.env` for live LLM classification — the system runs correctly without one (falls back to safe mock behavior), but the ~14% of cases needing real reasoning will show `source: mock` instead of a genuine classification.

## Testing

Run the automated test suite with:

```bash
npm test         # runs all unit tests via Vitest
npm run test:watch # runs Vitest in watch mode
```

- **What is covered:** Fast, fully offline unit tests for pure, deterministic parts of the recovery engine:
  - Guardrail checks, priority gates (confidence gate veto, max retry limits, nudge limits, cooldown pacing), and scheduled recovery calculations in [`src/agent/decisionEngine.ts`](file:///c:/Users/BIT%20PATNA/razorpay/src/agent/decisionEngine.ts).
  - Deterministic error code lookup rules, keyword pattern matching, and safe mock degradation in [`src/agent/classifier.ts`](file:///c:/Users/BIT%20PATNA/razorpay/src/agent/classifier.ts).
- **What is intentionally not covered by automated unit tests:** Live external network calls (real Razorpay API payment link creation/webhooks and live Gemini LLM generation). These dependencies are isolated/mocked in tests to keep the suite fast and offline-runnable; live end-to-end integration is verified through the manual validation flow documented in [`NOTES.md`](file:///c:/Users/BIT%20PATNA/razorpay/NOTES.md).

## Extensibility

The core loop — **Ingest Event → Classify → Bounded Decision → Execute → Immutable Log** — doesn't care what kind of revenue leak it's plugged into. Extending to checkout drop-off or B2B receivables (both named directions in Track 03) means adding a new event schema and action adapter, not rewriting the state machine, guardrail engine, or audit trail. We scoped narrow deliberately to ship one loop that's fully correct and fully honest, rather than three loops built shallow.