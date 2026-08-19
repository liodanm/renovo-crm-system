# RENOVO — REAL-WORLD SPEED & WORKFLOW AUDIT

Traced directly against source at commit `f274921` (2026-08-18). This is
a usability audit, not a code-quality audit — every count below is taken
from actual component logic (state, required fields, click handlers),
not estimated. No changes have been made; this is measurement only,
pending your approval on what to act on.

---

## WORKFLOW 1 — NEW CUSTOMER → ESTIMATE

**Traced:** `CreateCustomerModal` (with `includeProperty=true`, the mode
the main Customers page uses) → `EstimateForm`.

Genuinely good news first: **Customer + Property creation is already one
modal, one form, one submit** — not two separate steps. The modal
combines `CustomerForm` and `PropertyFields` inline behind a single
"Create customer" button.

| Measure | Count | Detail |
|---|---|---|
| Fields shown | 11 | Customer type (radio), business name (commercial only), first name, last name, email, phone, source (select), + property: label, address, city, state, ZIP |
| Required fields (server-enforced) | 5 | `customerType` (defaults to residential — effectively 0 unless commercial) + property's `addressLine1`/`city`/`state`/`postalCode` **only if any property field was touched at all** — if you skip the property section entirely, only `customerType` is required |
| Modal openings | 1 | Single modal, no nested modals |
| Page transitions | 0 | Stays on the Customers list |
| Duplicate data entry | 0 | None |
| Live duplicate-customer warning | Yes | Debounced 400ms, checks email/phone/name as you type |

**From here to a saved Estimate draft**, the user must then separately
navigate to New Estimate (from the Customers page, no direct "create
estimate" shortcut immediately after customer creation — see Top 10).

**Unnecessary friction found:** None in the customer/property step
itself. The one real gap is Estimates 4-11 in the same overall workflow
— see Workflow 2 below, since once a customer exists, the count is
identical whether the customer is brand-new or pre-existing.

---

## WORKFLOW 2 — EXISTING CUSTOMER → NEW ESTIMATE

**Traced:** Customer search → Customer detail (`overview-tab.tsx` "New
Estimate" link, pre-fills `customerId` via query param) → `EstimateForm`
→ Property select → Add Service → Save.

| Step | Clicks | Notes |
|---|---|---|
| Search customer | 1 click into search + typing | Global search or Customers list filter |
| Open customer, click "New Estimate" | 2 clicks | Lands on `/estimates/new?customerId=X` — customer pre-filled |
| Select property | **1 click, always** | **Confirmed: does not auto-select even when the customer has exactly one property.** A `<select>` dropdown is always shown and always requires an explicit choice — see Top 10 #1. |
| Add a service | 2 clicks minimum | Click "+Add Service" → pick from catalog (or "Create Custom") |
| Fill Qty/Price | 0–2 fields | If picked from catalog with a configured default price, **both Qty and Unit Price can already be pre-filled** (`quantity: '1'`, `unitPrice: catalogItem.defaultUnitPrice`) — a catalog item with a set price needs **zero typing** for a single unit |
| Save & Send | 1 click | Single button does create + email in one action, no confirmation dialog, no re-typing customer info |

**Minimum realistic total for one pre-priced catalog service:** ~7
clicks, 0 required typed fields, 1 page transition (Customer detail →
New Estimate). This is close to the practical floor given the property
selector's forced click.

---

## WORKFLOW 3 — MULTI-SERVICE ESTIMATE (House Wash + Roof + Driveway + Pool Deck)

**Traced:** `LineItemModal`, opened once per service via the "+Add
Service" `CatalogPicker`.

Per service, the modal requires: Service (picker, searchable), 
Description (auto-filled from catalog pick unless "Other"), Unit Type
(select, defaults sensibly per catalog item), Qty (required, may
pre-fill to `1`), Unit Price (required, may pre-fill from catalog
default). **Enter key advances focus** field-to-field
(`focusOnEnter`) — Description → Qty → Unit Price is a genuine
keyboard-only fast path already built in.

For 4 services, each fully pre-priced in the catalog: **4 modal
open/close cycles**, realistically **1 click each** (pick from catalog
list) if defaults are accepted, or up to 4 taps each (Qty, Price, Save)
if typing is needed. No unnecessary interaction found — Discount and Tax
are both progressively disclosed (hidden behind "+Add Discount" /
company-setting-gated) rather than always-shown fields to skip past.

**Unnecessary field found:** `ServiceDetailFields` — the per-service-type
detail fields (roof sq ft, stories, driveway surface, etc.) were **already
removed** in a prior pass after being confirmed to feed nothing
downstream (no pricing, PDF, or job impact) — this is already resolved,
not an open item. Good prior decision, nothing to change here.

**No Photos or Terms fields exist on Estimates at all** — confirmed by
direct search. Photos are Job-only (post-completion), and there is no
Terms & Conditions field on the estimate form. Not necessarily a defect
(fewer fields = faster), but flagged since the audit brief asked to test
them specifically and they simply don't exist to test.

---

## WORKFLOW 4 — SEND ESTIMATE

**Traced:** `EstimateForm.handleSave(andSend: true)`.

There is **no separate Preview step** before Send — "Save & Send" is a
single button that creates the estimate and calls
`estimatesApi.sendEmail()` in the same action, no confirmation dialog in
between. ("Preview" elsewhere in the app refers to the Print/PDF view on
an *already-saved* estimate's detail page — a different, later action,
not a pre-send checkpoint.)

Correct customer, property, amount, and branding are **not re-confirmed
by the user** — they're pulled directly from the already-selected
customer/property records and live company branding settings
(`company-context.service.ts`), so there's nothing to manually re-verify
or re-type. This matches the audit's stated goal well: the user isn't
asked to confirm information the system already has correct.

**This is close to optimal already** — one click, no intermediate
screen, no re-typing. Nothing recommended to change here.

---

## WORKFLOW 5 — CUSTOMER ACCEPTANCE → JOB → SCHEDULE

**Traced:** Two acceptance paths exist —
(a) customer accepts via the Portal (signature capture,
`portal-data.service.ts::approveEstimate`), or
(b) staff clicks "Save & Accept" directly in the Estimate form/detail
page (`acceptManually`).

Both auto-create the Job (ADR-001, duplicate-creation guarded) — **this
step is already fully automated**, zero extra clicks.

**Where it gets disconnected:** after staff-side "Save & Accept," the
user lands on the **Estimate detail page**, not the new Job. To reach
scheduling from there requires: click "View Job" (1 click, only visible
once accepted) → land on Job detail page → click "Schedule" (1 click) →
fill the schedule modal → Save. **That's 2 extra clicks and 1 extra page
load purely to get from "just accepted" to "ready to pick a time,"** for
a persona described as standing at the customer's property mid-conversation.
See Top 10 #2 — a direct "Job created — schedule it now?" prompt
immediately after acceptance would close this gap.

**Scheduling itself, once reached, is fast:** leaving the technician
field blank on a job's first scheduling **auto-assigns to the scheduling
user** (verified directly in `scheduling.service.ts`) — for the target
solo-owner persona, this means the technician-picker step, which exists
in the UI, requires zero interaction to get a correct result.

**Information copied correctly:** confirmed — `createFromEstimate`
carries the estimate's real line items forward, no re-entry.

---

## WORKFLOW 6 — JOB → COMPLETION (Field Work)

**Traced:** `FieldActionBar.tsx` + `CompletionFlow.tsx`.

This is the single strongest workflow in the app for the stated "owner
standing at a property, in a hurry" persona, and it's worth stating
plainly: **this appears to already be built specifically for that
persona**, not retrofitted.

- **Start:** one tap, auto-captures GPS via the browser's geolocation
  API — no manual entry, no form.
- **Before photo, chemical logging, check-in:** all live in a **sticky
  top action bar** that stays reachable without scrolling past customer
  details or line items — explicitly designed (per the component's own
  comment) so a tech's thumb never has to hunt for these.
- **Complete Job:** signature is genuinely optional — a
  "Signature Unavailable" toggle with preset reason codes exists as a
  first-class alternative, not a workaround. Photos/Chemicals/Equipment
  are collapsed-by-default, expand-one-at-a-time sections inline in the
  same panel (no navigating to separate pages for each). Completion
  notes, recommended future services, and billable-hours override are
  all optional. **A job can be completed with a single tap and zero
  typed fields** if the tech has nothing else to log.

**Nothing recommended to change here — this is a Protected/Stable area**
(see below). If anything, this is the pattern the rest of the app's
mobile flows should be measured against, not the other way around.

---

## WORKFLOW 7 — COMPLETED JOB → INVOICE

**Traced:** `GenerateInvoiceCard` on the Job detail page.

Once a job is marked complete, a **"Ready to Invoice" card appears
automatically** with a single "Generate Invoice" button — no form, no
fields. The generation call is **idempotent on the backend** (clicking
twice, or retrying after a network blip, returns the existing invoice
rather than creating a duplicate) — a real, deliberate reliability
choice, confirmed in source comments and logic.

Customer, Property, Job, Services, Prices, Discounts, Tax, and Branding
are all inherited with **zero re-entry** — confirmed via
`generateFromJob` pulling real line items, current tax rate, and due-date
defaults directly from the completed job.

**This is already optimal** — one click from "job complete" to "invoice
exists," no duplicate data entry found anywhere in this step.

---

## WORKFLOW 8 — PAYMENT

**Traced:** `PaymentsSection.tsx`.

- **Amount pre-fills with the exact balance due** the moment the
  "+Record Payment" form opens — confirmed directly in source, with an
  explicit comment noting this is deliberate ("the common case, paid in
  full, needs zero typing"). Partial payments are still just a normal
  edit of that same field, not a separate mode.
- **Payment date defaults to today.** Method defaults to `cash`.
- Supported methods (confirmed, config-driven from
  `settingsApi.getPaymentSettings()`): whatever the company has enabled
  in Settings → Payments, falling back to `ALL_METHODS` if unconfigured
  — includes Card (with Credit/Debit + processing-fee preview), Cash,
  Check, Zelle, and presumably Stripe as a separate customer-initiated
  path (portal), not through this manual form.
- **Void** uses browser `confirm()` (already flagged in the prior
  hardening audit — unchanged, still open).
- **Refund exists** — `handleRefund` calls `paymentsApi.refund()`. **This
  corrects the prior PROJECT_STATUS.md audit**, which marked Refunds as
  UNKNOWN; a refund path is real. However, it's implemented with a
  native `window.prompt()` for the refund amount — the least-polished
  input pattern anywhere in the payments flow, worth a quick pass even
  though the underlying function works.

**Minimum path to record a payment in full:** click "+Record Payment" →
click a payment method (if not cash) → click Save. **Realistically 2–3
taps, 0 required typing**, for the single most common case (paid in
full, cash or already-selected method).

---

## MOBILE-FIRST NOTES

Spot-checked directly against source rather than assumed:

- Touch targets: form buttons/inputs consistently use `py-3`/`text-base`
  on mobile breakpoints, stepping down to `py-2`/`text-sm` at `lg:` —
  this pattern repeats across every form component inspected
  (Customer, Estimate, Payment, Job), suggesting a real, consistent
  mobile-sizing convention rather than one-off fixes.
- The Job detail page's `FieldActionBar` is the clearest example of
  deliberate thumb-reach design in the app (see Workflow 6).
- The Estimate form's Save/Send buttons use a **sticky bottom bar on
  mobile** specifically so Save never requires scrolling past the whole
  form first — confirmed via source comment and CSS
  (`sticky bottom-0`), reusing the same pattern as `FieldActionBar`.
- Photo upload on Jobs goes through a native file input
  (`photoInputRef`), which on a phone triggers the OS camera/gallery
  picker directly — no custom camera UI to fight with.
- **Property selection remains a plain `<select>` dropdown** everywhere
  it appears (Estimate form, elsewhere) — functional on mobile but not
  optimized the way the rest of these flows are; a native select's touch
  target and picker behavior is acceptable but not standout.

No dedicated mobile-only navigation pattern (bottom tab bar, etc.) was
found — the app appears to be a single responsive layout throughout,
which is consistent with everything else observed rather than a gap
specific to one page.

---

## AUTOMATION OPPORTUNITY ANALYSIS

Per the brief: identifying opportunities only, **not implementing any of
these**. Each is marked with whether it's safe to fully automate or
needs a confirmation step.

| Opportunity | Current state | Automate fully, or confirm first? |
|---|---|---|
| Customer created → auto-create property if address given | **Already implemented** (combined modal) | N/A — done |
| Estimate accepted → auto-create job | **Already implemented** (ADR-001) | N/A — done |
| Job's first scheduling → auto-assign to self | **Already implemented** | N/A — done |
| Job created/accepted → prompt to schedule immediately | Not implemented — 2 extra clicks today | **Confirm first** — a prompt/shortcut, not silent auto-scheduling; the owner may not know their availability yet at accept-time |
| Job completed → generate invoice | Manual single click today, not automatic | **Confirm first**, deliberately — some jobs may need a review pass (adjustments, extra billable time) before an invoice goes out; auto-generating removes that checkpoint |
| Invoice paid → mark job financially complete | Not independently confirmed either way from this pass | Needs direct verification before recommending either way |
| Completed job → schedule review request | **Already implemented** via the automation engine (`review_request` rule type) | N/A — done, though confirm-first vs. fully-silent wasn't independently re-verified this pass |
| Property auto-select when customer has exactly one | Not implemented — always requires a click | **Safe to fully automate** — a customer with one property has no real "which one" decision to make; a manual override to change it would still be trivially available |

---

## CLICK-COUNT REPORT

| Workflow | Current Clicks | Current Fields (shown) | Required Fields | Page Changes | Duplicate Entry | Recommended |
|---|---:|---:|---:|---:|---|---:|
| New Customer (no property) | ~4 | 6 | 1 (customerType) | 0 | None | 4 (near-floor already) |
| New Customer + Property | ~8 | 11 | 5 | 0 | None | 6–7 (see Top 10 #1 idea on address autocomplete) |
| Existing Customer → Estimate (1 pre-priced service) | ~7 | varies | 3 (customer/property/1 line item) | 1 | None | 5–6 (remove forced property click when only 1 exists) |
| Multi-service Estimate (4 services) | ~16–20 | 5 per service | 3 per service | 0 | None | Same — already near-optimal per service |
| Send Estimate | 1 | 0 (uses existing data) | 0 | 0 | None | 1 — already optimal |
| Accept Estimate → Job (staff-side) | 1 | 0 | 0 | 0 (stays on Estimate page) | None | 1 — already optimal |
| View Job + Schedule (from accepted Estimate) | 3 | 2–3 (date/time) | date/time | 2 | None | **1–2** — collapse into a post-accept prompt |
| Complete Job (nothing extra to log) | 1 | 0 | 0 | 0 | None | 1 — already optimal |
| Generate Invoice | 1 | 0 | 0 | 0 (redirects to new invoice) | None | 1 — already optimal |
| Record Payment (paid in full) | 2–3 | 6 shown, amount pre-filled | 2 (amount, method) | 0 | None | 2 — already near-optimal |

---

## USER CONFUSION SPOT-CHECK

Checked against the six questions for the pages most central to the core
loop:

**Estimate form:** Primary action (Save & Send) is visually distinct
(brand-colored, sticky on mobile) from secondary actions (Save as Draft,
Save & Accept) — not confusing. Terminology ("Valid until," "Discount
type," "Tax rate") matches plain business language, not database
naming. Information order (Customer → Property → Services → Discount/Tax
→ Notes → Totals → Save) follows the order a person would naturally fill
it in.

**Job detail page:** The "Ready to Invoice" card only appears once a job
is actually complete — the next step is only ever shown when it's
actually available, not as a disabled/greyed-out distractor beforehand.

**Payments section:** "+Record Payment" is the only visible action when
a balance is owed (`canRecordPayment` gates the whole button) — no
competing secondary actions to misread.

**One real confusion risk found:** the Estimate detail page's "View Job"
action only appears after acceptance, with no visible indication
*before* acceptance that accepting will immediately create a job — a
first-time user might not expect that to happen automatically. Not
measured as a click-count problem, but worth a one-line UI note (e.g.
"Accepting will create a job automatically") if this hasn't already
been validated with a real owner.

---

## PROTECTED / STABLE AREAS (verified this pass, not assumed)

- **Job completion flow (`CompletionFlow.tsx` / `FieldActionBar.tsx`)**
  — genuinely best-in-class for the target persona. Do not restructure.
- **Estimate line-item entry (`LineItemModal`)** — keyboard-advance
  pattern (Enter → next field) and catalog-default pre-fill are real,
  deliberate speed choices. Do not remove or complicate.
- **Invoice generation from a completed job** — one click, idempotent,
  zero re-entry. Do not add intermediate steps.
- **Payment amount pre-fill to balance due** — explicit, deliberate,
  correctly optimized for the common case. Do not change the default.
- **Save & Send as a single combined action** — do not split this into
  a separate "review" step; it would add friction without adding real
  protection, since amounts/branding are already system-verified, not
  user-typed.

---

# RENOVO SPEED SCORE

Rated 0–10 on real-world steps-to-complete for the target persona, based
on the traced evidence above — not a general code-quality score.

| Stage | Score | Why |
|---|---:|---|
| Customer creation | 9/10 | Already combined with property in one modal; near-zero required fields. |
| Estimate creation | 8/10 | Fast per-service entry with keyboard advance and catalog defaults; docked only for the forced property-select click even with one property on file. |
| Estimate sending | 10/10 | Single action, no re-confirmation, no intermediate screen. |
| Estimate acceptance | 9/10 | Fully automated job creation; docked slightly for no visible signal beforehand that acceptance triggers job creation. |
| Job creation | 10/10 | Fully automatic on acceptance — nothing for the user to do. |
| Scheduling | 6/10 | Auto-assign is excellent once you're on the scheduling modal, but getting there from "just accepted" costs 2 avoidable clicks and a page load. |
| Job completion | 10/10 | The strongest workflow in the app — one tap possible, GPS automatic, everything else optional and reachable without scrolling. |
| Invoicing | 10/10 | One click, idempotent, zero re-entry. |
| Payment | 9/10 | Amount pre-fill is excellent; docked slightly for the Void/Refund UI (browser `confirm()`/`prompt()`) being visibly less polished than the rest of this flow. |

**Overall weighted impression:** the core loop is already fast for 7 of
9 stages. The one real structural gap is the Acceptance → Schedule
handoff — everything else recommended below is refinement, not repair.

---

# TOP 10 UX CHANGES

Ranked by real-world impact for the stated persona, not by implementation
effort. **Not implemented — pending your approval.**

1. **Auto-select the property when a customer has exactly one.** Removes
   a forced, decision-free click from every single estimate for the
   large share of residential customers who only have one address on
   file. Highest-frequency, lowest-risk change on this list.
2. **Prompt to schedule immediately after Save & Accept**, instead of
   landing on the Estimate detail page and requiring "View Job" →
   "Schedule" as two separate clicks and a page load. This is the one
   place in the entire core loop where the audit's own persona (standing
   at the customer's property, wanting to lock in a date right then)
   is measurably worse served than it could be.
3. **Replace `window.prompt()` on Payment Refund** with a real inline
   field or small modal, matching the polish level of every other action
   in `PaymentsSection.tsx`. Low frequency, but jarring when it happens
   — refunds are exactly the kind of moment where a sloppy UI erodes
   trust.
4. **Route Invoice Void and Payment Void through the shared
   `ConfirmDialog`** instead of `confirm()` — already flagged in the
   prior hardening audit, reinforced here because it's the same class of
   "looks unfinished at the exact wrong moment" issue as #3.
5. **Surface a "this will create a job automatically" note on Accept**
   for first-time users, so the automation (which is genuinely good) is
   understood rather than surprising.
6. **Consider a lightweight "+ New Estimate" shortcut directly inside
   the post-customer-creation success state**, for the pattern of
   creating a brand-new customer specifically to quote them on the spot
   — today the user must navigate away to Estimates separately after
   the modal closes.
7. **Verify whether invoice-paid → job-financially-complete is already
   automatic** (not independently confirmed this pass) — if it isn't,
   it's a safe, low-risk automation candidate per the analysis above.
8. **Confirm the intended default payment method** — `cash` is
   hardcoded as the form's default regardless of what a given company
   actually uses most; if a company primarily takes Card or Zelle,
   defaulting to their actual most-common method (or remembering the
   last-used one) would save a click on the majority of payments for
   that company.
9. **Nothing found wrong with the Job Completion flow — protect it
   explicitly** as a template. If future work touches other mobile
   flows, measuring them against `FieldActionBar.tsx`'s design would
   raise the floor elsewhere rather than needing a new pattern invented.
10. **Nothing found wrong with Estimate-to-Invoice inheritance —
    protect it explicitly.** Zero duplicate data entry was found
    anywhere in the Job → Invoice step; this is a real strength worth
    deliberately not touching during any future refactor.

Items 9 and 10 are intentionally framed as "protect, don't change" —
the audit brief asked specifically not to rewrite working functionality,
and these two are the clearest evidence-backed examples of functionality
that's already correctly optimized for the stated goal.
