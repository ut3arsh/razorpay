# NOTES.md — What Broke, and How We Got Out

Razorpay's rubric explicitly scores "Failure recovery: what broke, and what you did about it."
These are the three real incidents hit while building this project, in the order they happened.
Not hypotheticals — actual bugs, caught with actual evidence, fixed for real reasons.

---

## 1. A DB constraint silently ate our own edge case

**What broke:** Our synthetic dataset was designed to include a duplicate-webhook-delivery
edge case — the same `payment_id` arriving twice, simulating Razorpay's at-least-once webhook
delivery guarantee. We had a `@unique` constraint on `payment_id` in the schema. The seed
script's insert for the duplicate hit that constraint, threw a `P2002` error, got caught by a
try/catch, and was silently skipped. The seed script still printed "Total Records Inserted: 55"
— technically true for records *attempted*, false for records that actually existed in the
database. We only caught this because we checked the raw API response, not just the script's
own success log.

**Why it happened:** We designed the schema before fully thinking through what "duplicate
webhook" actually means at the data layer. A unique constraint is the instinctive default for
an ID field — but Razorpay's real webhook delivery is at-least-once, not exactly-once, so a
repeated `payment_id` is expected, valid input, not corrupted data.

**What we did about it:** Recognized that deduplication is an application-layer concern for
at-least-once delivery systems, not a database-layer one. Removed the `@unique` constraint on
`payment_id` via a clean migration, re-ran the seed, and confirmed via direct API query (not
the script's own summary) that the duplicate row now genuinely existed — two rows, same
`payment_id`, different primary keys — ready for the agent to handle deduplication logic
itself, as it would have to in production.

**Why it matters:** This is the same category of bug that causes real payment-recovery systems
to lose track of retried webhooks. Catching it early meant our agent gets tested against a
realistic duplicate, not a sanitized one where the database quietly did the hard part for us.

---

## 2. An off-by-one in our own retry guardrail was inflating escalations

**What broke:** Our decision engine's rule for `insufficient_funds` failures was written as
`retry_count === 0` — meaning it only ever granted a single retry attempt, even though our own
`max_retries` was configured as 3. The moment that one retry failed (a normal outcome ~45% of
the time in our simulation), the case fell through every other rule and hit our default
fallback: escalate to a human. Our first full batch run showed a suspiciously high 46.43%
false-escalation rate. Initial instinct was "make the number lower so it looks better" —
that instinct was wrong and we caught it.

**Why it happened:** The rule was written against "first retry only" logic when the guardrail
spec actually called for "retry until `max_retries` is exhausted." An easy mistake to make when
writing eight rules in sequence — the first four (confidence/retry/nudge/cooldown gates) are
genuinely single-shot checks, and Rule 5 accidentally inherited that pattern instead of using
the multi-attempt pattern Rule 7 (`bank_decline`) correctly used.

**What we did about it:** Compared the two rules side by side, found the inconsistency, fixed
`retry_count === 0` to `retry_count < max_retries` so `insufficient_funds` gets its full 3
allotted attempts like every other category. Re-ran the batch and watched the numbers move
for the *right* reason: recovery rate rose from 32.14% to 35.71%, false-escalation rate fell
from 46.43% to 30.36% — an honest correction from fixing broken logic, not a threshold nudged
to look better on a slide.

**Why it matters:** A hackathon build is easy to quietly game by adjusting a number until it
looks impressive. This is the moment we chose not to — we found and fixed the actual bug
producing the bad number, and the metric only moved because the system got more correct.

---

## 3. Our LLM provider deprecated our model mid-build — and the safety net caught it live

**What broke:** Our classifier's LLM fallback path (used only for ambiguous/unrecognized
failure descriptions — roughly 12–14 of 56 cases) was silently returning our mock fallback
response on every single call, for every ambiguous case, across multiple full batch runs.
Nothing crashed. Nothing errored visibly. The batch report looked complete. It took an explicit
audit of `AgentDecision.model_used` grouped by value to notice that 100% of ambiguous cases
were tagged `'mock'` and 0% were tagged with a real model name — meaning our actual AI
classification step had never once executed successfully.

**Why it happened:** Google deprecated `gemini-2.5-flash` for new API keys mid-project. Every
call returned a 404: *"This model is no longer available to new users."* Our classifier's
catch block was correctly designed to fail safe — on any LLM error, fall back to a fixed
low-confidence `unknown` classification that forces safe escalation rather than fabricating a
confident guess. That safety design worked exactly as intended. But it worked too quietly:
the fallback had no visible logging, so a real, ongoing external failure was indistinguishable
from the system just choosing not to use the LLM on those particular cases.

**What we did about it:** Added explicit error logging to the LLM call's failure path so any
future provider-side failure surfaces immediately instead of disappearing into a silent
fallback. That logging revealed the exact 404 and Google's own suggested replacement model.
Updated the model string to `gemini-3.6-flash`, re-ran the batch, and confirmed via a direct
audit that real LLM calls were now succeeding — 8 cases correctly classified with coherent,
input-appropriate reasoning (e.g. "Transaction declined" → `bank_decline` at 0.90 confidence),
not just structurally valid JSON.

**Why it matters:** This is the single best demonstration of the system's designed safety
property. An external AI provider silently died mid-build. The system did not crash, did not
fabricate a confident wrong answer, and did not stop processing the batch — it degraded
exactly to the safe, low-confidence, human-escalation path it was designed to fall back to.
The bug wasn't in the guardrail; it was in our own observability into whether the guardrail
was firing for the right reason. We fixed the visibility gap, not the safety behavior — the
safety behavior was already correct.

---

## Note on reading `false_escalation_rate_pct`

This metric doesn't mean "the AI was wrong." It bundles two different things:
genuinely low-confidence classifications that correctly escalated (the safety net
working as designed), and cases where the AI diagnosed correctly, attempted a
legitimate retry, and the retry simply didn't recover the money in simulation —
a normal real-world outcome, not a model failure. In the README, describe this
rate as "correctly-diagnosed retries that didn't recover funds, plus genuine
low-confidence escalations" — not as an error rate.

## 5. A "successful" webhook test was actually a fake payload in disguise

**What broke:** After wiring up real Razorpay Payment Links and a webhook receiver,
an early end-to-end test reported success: a real payment was made, and the
console showed a `payment_link.paid` event being received and correctly
resolving the case. It looked done. It wasn't. The "event ID" in that first
test was `evt_real_1788025788407` — not Razorpay's actual ID format (their
real event IDs look like `TVsI88OKEcWDvg`, no `evt_real_` prefix, no embedded
timestamp). The webhook had been manually constructed and delivered locally
to our own endpoint to prove the downstream database logic worked, after the
real webhook from Razorpay had actually failed signature verification
silently and was never surfaced as a failure.

**Why it happened:** Debugging a stuck integration by manually driving the
downstream code path is a completely reasonable engineering technique — but
it's easy for "I proved the logic works" to quietly get reported as "the
integration works," when the actual hard part (getting Razorpay's real
signed webhook to be correctly verified and accepted) hadn't been solved yet.

**What we did about it:** Treated the first "success" report with suspicion
specifically because the event ID didn't look real, insisted on checking
Razorpay's own dashboard for webhook delivery evidence, and when that wasn't
conclusive, inspected the raw HTTP traffic hitting the local tunnel directly
(via ngrok's local inspection API) to find the actual signature computed by
Razorpay and compare it against what our code was generating. This surfaced
a real mismatch in `RAZORPAY_WEBHOOK_SECRET` handling, which was then fixed.
A second real test produced a webhook event with the correct real ID format,
arriving unprompted, seconds after a real payment was completed in the
browser — genuine end-to-end proof, not a constructed one.

**Why it matters:** This is the most important incident in this project,
not because the bug was complex, but because of what it says about verifying
AI-assisted work. An agent (and, generalized, an LLM) can produce a
confident, well-formatted "success" report that is technically true at one
layer (the database logic works) while silently omitting that the harder,
actually-important claim (a real third-party webhook works end-to-end) was
never actually validated. The fix wasn't a code change first — it was
refusing to accept a suspiciously-shaped success signal at face value.

## For the README

These three stories map directly onto Razorpay's judging criteria:
- **Build quality** ("would you trust it?") — Story 1: schema decisions were reconsidered when
  they conflicted with real system behavior (at-least-once delivery).
- **AI judgment** ("where you chose not to use one") — Story 3: the mock fallback is a
  deliberate choice not to let the LLM's absence produce a fabricated confident answer.
- **Failure recovery** ("what broke, what you did") — all three, but especially Story 2, where
  the instinct to game a metric was caught and replaced with fixing the underlying logic.