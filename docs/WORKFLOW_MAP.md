# WORKFLOW_MAP.md

Five workflows traced directly through source, per the audit brief. For
each: what works, what doesn't, what's untested, what's unnecessarily
complicated, and where duplicate data entry occurs.

---

## Workflow 1: Customer → Property → Estimate → Send → Customer views → Accept → Job → Schedule

**Traced path:**
`CustomersService` (customer + property creation, often together) →
`EstimatesService.create` (server-computed defaults) →
`EstimatesService` send path (portal deep-link email, no PDF attachment)
→ `PortalDataService.getEstimates`/portal view (sets `viewedAt`,
transitions status) → `PortalDataService.approveEstimate` (signature
capture, ownership-checked) → `acceptManually`/portal accept auto-calls
`JobsService.createFromEstimate` (ADR-001, duplicate-creation guarded)
→ `SchedulingService` (auto-assigns to self on first scheduling if
unassigned).

**What works:** The full chain is real and connected end-to-end, not a
demo. Server-side computation at every financial step. Auto job-creation
on acceptance is duplicate-guarded.

**What doesn't:** Nothing found broken in this chain.

**What's untested:** No automated test covers this workflow end-to-end
(the 5 real tests are narrow utility functions, not workflow tests).
Manual/production verification status beyond that is UNKNOWN from source.

**Unnecessarily complicated:** ADR-007's still-live manual
convert-to-job endpoint means there are technically two paths from
Accepted → Job (automatic on accept, or manual via a separate call) with
no current guidance on when the manual one should be used instead. Not
broken, but a real source of "which one do I call" ambiguity for any
future integration work (e.g. the AI Receptionist, which per its own
architecture doc may call scheduling/estimate tools directly).

**Duplicate data entry:** None found — Property can be created inline
during Customer creation or Estimate creation without re-entering the
same fields twice, per `CustomersService`'s combined create path.

---

## Workflow 2: Job → Start → Complete → Invoice → Payment

**Traced path:**
Job status transitions (`JobStatusHistory`) → `CompletionFlow.tsx`
(photos, signature, chemicals, equipment in one flow) →
`InvoicesService.generateFromJob` (real line items, current tax rate,
due-date defaults — not manual re-entry) → `PaymentsService` (manual
recording: cash/check/Zelle/Card with tip + processing fee) or Stripe
(portal-initiated, webhook-confirmed, both success and failure paths).

**What works:** Generation from a completed job pulls real data, not a
blank form. Payment recording is materially richer than a bare
"mark paid" — tip and processing fee are tracked as genuinely separate
fields from `amount`, so revenue/balance/LTV math doesn't need any
special-case exclusion logic.

**What doesn't:** Nothing found broken.

**What's untested:** Stripe payment completion via the portal has a
real, internally-consistent implementation but no confirmed real
transaction trace or automated test — see PROJECT_STATUS.md.

**Unnecessarily complicated:** None identified — this is one of the
more linear workflows in the app.

**Duplicate data entry:** None — invoice generation is explicitly
designed to avoid re-entry of job line items.

---

## Workflow 3: Public lead → Customer → Property → Estimate

**Traced path:**
`POST /public/:companySlug/leads` (rate-limited, honeypot) →
`LeadsService.captureLead` → `CustomersService.findOrCreateByEmail`
(same authoritative path the Quote Widget also uses — verified not
duplicated) → optional Property creation if address fields present →
owner notification email → **staff then manually creates an Estimate**
from the resulting Customer/Property (no automatic Estimate creation
from a bare lead capture).

**What works:** Lead capture → real Customer record, with dedup applied
via the same path every other entry point uses. Owner gets a real,
immediate email notification, not a silent database write.

**What doesn't:** Nothing found broken.

**What's untested:** Whether the Quote Widget's frontend (which would
presumably drive `estimates.source` attribution end-to-end) actually
exists and is deployed anywhere — the backend is real but no frontend
embed was found in this repo (see PROJECT_STATUS.md, SYSTEM_MAP.md).

**Unnecessarily complicated:** None in the traced code path itself.

**Duplicate data entry:** None in the Lead→Customer step. However, the
handoff from Customer/Property (created via lead capture) to a staff-
created Estimate is a manual step with no confirmed "convert lead
directly to a draft estimate" shortcut — staff re-select the customer
and re-enter service details from scratch in the Estimate form. This
isn't duplicate *data* entry (the customer record isn't re-typed) but it
is a manual context-transfer step worth being aware of if lead volume
ever grows enough to matter (per the project's own stated reasoning for
not building a full Leads module yet).

---

## Workflow 4: Invoice → Customer Portal → Payment → Stripe webhook → Payment record → Invoice status

**Traced path:**
`portal-data.service.ts::getOwnedInvoice` (ownership-checked) →
customer-initiated payment via `stripe-payment.service.ts` → Stripe
processes the charge → `portal.controller.ts::handleStripeWebhook`
(signature-verified, `@Public()`) → on `payment_intent.succeeded`,
`reconcilePayment(invoiceId, paymentIntent)` → on
`payment_intent.payment_failed`, `recordFailedPayment(invoiceId,
paymentIntent)` (logs via `logAutomationEvent`, `rule_type=
'payment_failed'`) → invoice balance/status presumably updated by
`reconcilePayment` on success (not independently re-traced line-by-line
in this pass, but the method exists and is called with the right
arguments).

**What works:** Both webhook paths are implemented, signature-verified,
and return a fast 200 to Stripe regardless of match (correct behavior —
prevents Stripe's infinite-retry behavior on an unrecognized/duplicate
event). Ownership checks confirmed on the invoice-fetch side.

**What doesn't:** Nothing found broken.

**What's untested:** No automated test exercises this webhook path with
a simulated Stripe event; no confirmed real production transaction
trace was found. This is the single highest-value workflow to get real
test coverage on, given it involves money and an external signature-
verified webhook — see ROADMAP.md Hardening Queue.

**Unnecessarily complicated:** None identified in the traced code.

**Duplicate data entry:** None.

---

## Workflow 5: Scheduling → Assignment → Customer notification → Reschedule

**Traced path:**
`SchedulingService` (raw-SQL-only, no Prisma model — see
PROJECT_CONTEXT.md Section 2) → assignment via `assignedUserId` or
auto-assign-to-self on first scheduling → conflict check
(`assertNoTechnicianConflict`) → **customer notification path not
independently confirmed in this pass** — the automation engine has rule
types for estimate/invoice/payment events but no rule type in the
`automation_log.rule_type` CHECK constraint list explicitly names an
"appointment scheduled/rescheduled" customer notification; if one
exists, it wasn't located under an obvious name. Flag as UNKNOWN rather
than NOT IMPLEMENTED. → Reschedule preserves existing assignment unless
explicitly changed; conflict-checked against the effective assignee.

**What works:** Assignment, auto-assignment, and conflict-checking are
all solid, directly verified.

**What doesn't:** Nothing found broken in what was traced.

**What's untested:** Whether the customer is actually notified on
scheduling/rescheduling — genuinely unconfirmed either way, worth a
direct follow-up rather than assuming either outcome.

**Unnecessarily complicated:** The `appointments` table's raw-SQL-only
access pattern (Workflow 5 touches this more than any other workflow)
means every change here carries more manual-verification burden than
equivalent changes elsewhere in the app — not a functional problem today,
but a standing cost on this specific workflow.

**Duplicate data entry:** None identified.
