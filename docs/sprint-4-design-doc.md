# Sprint 4 — Dashboard Design Doc (LOCKED)

Aesthetic direction: **audit ledger / financial terminal** — not a generic SaaS admin
template, not a warm-cream landing page. This build's whole pitch is "would you trust
it," so the UI should read as precise, disciplined, and paper-trail-literal rather than
decorative.

Revisit only if it's actively hurting the demo — otherwise build straight from this.

---

## 1. Design Tokens

### Color
```
--bg:                #14171C   (base background, graphite not black)
--surface:            #1C2028   (cards, panels)
--surface-raised:      #232833   (hover/active surface)
--border:              #2A2F3A   (hairlines, dividers)
--text-primary:        #E8EAED
--text-muted:          #8B93A1
--text-faint:          #5A6270

--accent-recovered:    #4FD1A5   (mint-teal — resolved/recovered)
--accent-escalated:     #E8A33D   (amber — needs human, NOT an error color)
--accent-stopped:       #E1615A   (muted brick — used sparingly, terminal/stopped)
--accent-pending:       #6B8AFA   (soft blue — retry/nudge in progress)
```
Semantic rule: escalation is a *correct safety behavior*, not a failure — never color
it the same as an actual error/crash state. Reserve red (`--accent-stopped`) for
genuinely terminal "max retries exhausted" cases only.

### Typography
```
--font-display: 'Space Grotesk', sans-serif   (headings, hero numbers, nav)
--font-body:    'Inter', sans-serif           (body copy, labels, descriptions)
--font-mono:    'JetBrains Mono', monospace   (ALL data: IDs, amounts, timestamps,
                                                 status codes, error codes, confidence
                                                 scores — this is what makes it read
                                                 as a ledger, not a dashboard template)
```
Rule of thumb: if a value came out of the database verbatim, it's mono. If it's UI
chrome/prose, it's Inter. Headings and the hero recovery number are Space Grotesk.

### Layout primitives
- Zero or minimal border-radius (2-4px max) — sharp, ledger-like, not bubbly
- Hairline borders (`1px solid var(--border)`), not shadows, for separation
- Generous whitespace between sections, tight spacing within a data row
- Status shown as a small filled dot + mono label, not a big rounded pill badge

### Signature element
**Audit trail as literal ledger stamps.** On the case detail page, each
`AuditLogEntry` renders as a timestamped row with a small rotated "stamp" marker
(a bordered box, ~6° rotation, monospace state name) sitting beside a vertical
timeline rule — visually evoking a real stamped paper trail. This is the one place
the design takes a deliberate risk; everything else stays quiet and disciplined.

---

## 2. Page Architecture (multi-page, React Router)

```
/                       Overview — hero recovery number, batch history trend,
                        quick stats (total cases, resolved, escalated, at-risk ₹)

/cases                  Case list — all RecoveryCases, filterable by status,
                        paginated table, click through to detail

/cases/:id              Case detail — full audit trail (signature element),
                        agent decisions timeline, linked PaymentEvent raw data

/exceptions             Exception list — ESCALATED + STOPPED cases with reasoning
                        surfaced directly (no click-through needed to see why)

/events                 Payment events — raw PaymentEvent browser, filterable by
                        status, useful for judges who want to see the messy input
                        data (edge cases, ambiguous descriptions) directly
```

Shared layout: persistent left nav (logo/wordmark, 5 route links, live-updating
"last batch run" timestamp pinned at the bottom of the nav) + top bar showing
connection status to the API.

---

## 3. Build Order (Sprint 4 sub-prompts, run sequentially)

1. Scaffold: Vite + React + TS + Tailwind + React Router, design tokens, fonts,
   typed API client, shared layout shell (nav + top bar)
2. Overview page (hero + batch history strip + quick stats)
3. Case list + Case detail page (this is where the signature ledger-stamp element lives)
4. Exceptions page + Events page
5. Polish pass: responsive check, loading/empty/error states, keyboard focus visibility