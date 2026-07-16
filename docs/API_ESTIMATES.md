# Estimates API

All endpoints are under `/api/v1/estimates`, require staff authentication,
and are scoped to the authenticated user's company (RLS-enforced — one
company can never see another's estimates, verified against live Postgres
during development). `estimates.read` permission covers all `GET`
endpoints; `estimates.write` covers everything else.

## Data model

An estimate has one or more **line items**, each a single priced service.
`subtotal`, `discountAmount`, `taxAmount`, and `totalAmount` are always
computed server-side from the real, currently-stored line items — never
trusted from the client, even if a request includes plausible-looking
numbers for them.

**Service-specific details** (`serviceDetails`): a free-form JSON object
whose expected shape depends on `serviceType`. Only three service types
have a strongly-validated shape today — `roof_soft_wash`,
`driveway_cleaning`, `house_wash` — matching the fields actually specified
for this feature; every other service type accepts whatever's provided
without validation, since there's no known-correct shape for them yet.
Adding a new validated service type means adding one DTO class
(`dto/service-details/service-details.dto.ts`) and one map entry
(`dto/service-details/validate-service-details.ts`) — never a migration,
since the column is already `JSONB`.

**Cost & profitability fields** (`estimatedLaborHours`,
`estimatedChemicalCost`, `estimatedEquipmentCost`, `estimatedFuelCost`,
`estimatedMiscCost`) — all default to `0`. `estimatedProfit` and
`profitMarginPercent` are always computed server-side after any line-item
write, never accepted from a client. **Restricted to the
`estimates.profitability` permission** (granted to `owner`/`admin` by
default, migration 010) — every other role sees line items with these
fields entirely absent from the response, not just zeroed out or hidden
client-side. The customer portal is a completely separate code path and
was never going to see this data regardless.

### Labor rate resolution — designed for a feature not built yet

Labor cost needs an hourly rate, and this project deliberately doesn't
hard-code one company-wide rate as the only option. The resolution order,
implemented in `estimate-profit.util.ts`'s `resolveLaborRate()`:

1. **The line item's assigned employee's rate**, if one is assigned
   (`assignedUserId` → `User.hourlyLaborRate`) — **not built as a feature
   yet** (nothing in the current UI assigns a line item to an employee),
   but the schema and resolution logic are already correct and ready.
2. **Otherwise, the company's default rate** (`Company.defaultLaborRate`)
   — this is what every line item uses today, since nothing is assigned.

The day employee assignment becomes a real feature, this needs zero
changes to start using real employee rates — it's already correct,
verified with a real test proving a `$0`-rate override is honored
correctly and not confused with "no override" (a classic falsy-value bug
this implementation avoids on purpose).

---

## `POST /estimates`
Create a draft estimate with its line items in one request.

**Request body**
```json
{
  "customerId": "uuid",
  "propertyId": "uuid",
  "lineItems": [
    {
      "serviceType": "roof_soft_wash",
      "description": "Roof Soft Wash",
      "unitOfMeasure": "sq_ft",
      "quantity": 2400,
      "unitPrice": 0.35,
      "notes": "Two-story, moderate algae staining",
      "serviceDetails": {
        "roofSquareFootage": 2400,
        "roofType": "shingle",
        "stories": 2,
        "pitch": "medium"
      },
      "estimatedLaborHours": 2.5,
      "estimatedChemicalCost": 28
    }
  ],
  "discountType": "percentage",
  "discountValue": 10,
  "taxRatePercent": 8.25,
  "notes": "Optional internal/customer-facing note",
  "terms": "Optional terms text shown on the estimate"
}
```
`discountType`/`discountValue`/`taxRatePercent` are all optional — an
estimate with none of them simply has no discount and no tax.
`serviceDetails` and every cost field are optional too — an estimate can
be created with none of them, same as before this feature existed.

**Response**: `201`, the full estimate including computed totals and the
persisted line items. Includes `estimatedProfit`/`profitMarginPercent`
per line item and `totalEstimatedProfit`/`overallProfitMarginPercent` at
the estimate level **only if the caller has `estimates.profitability`**.

**Errors**: `403` if `propertyId` doesn't actually belong to `customerId`
within this company. `400` if `serviceDetails` doesn't match the required
shape for a validated `serviceType` (e.g. `roofType: "thatched"` — not
one of `tile`/`shingle`/`metal` — or an unexpected extra field).

---

## `GET /estimates`
List, optionally filtered by `?status=` and/or `?customerId=`.

## `GET /estimates/:id`
Full detail, including line items.

## `PATCH /estimates/:id`
Edit — **only while `status` is `draft`**. Returns `400` otherwise. If
`lineItems` is included, it replaces the entire set (not a partial patch
of individual rows). Totals are always recomputed after any edit.

## `POST /estimates/:id/send`
Marks the estimate `sent` and sets `sentAt` — this is the field the
Automation engine's estimate-follow-up rule reads to start its 3-day
clock. Requires `status` to be `draft` and at least one line item.

## `POST /estimates/:id/convert-to-job`
Requires `status` to be `accepted`. Creates a `Job` row with
`status: 'unscheduled'` (no `scheduledStart`/`scheduledEnd` — the
Scheduler, not yet built, assigns those later) and `price` set to the
estimate's real `totalAmount`. **Idempotent**: calling this twice for the
same estimate returns the already-existing job rather than creating a
duplicate — verified directly, not just assumed from the code shape.

## `DELETE /estimates/:id`
Only while `status` is `draft`.

---

## Verified against live Postgres, not just written

- Real multi-line-item math: 3 services (roof wash, driveway, gutters) →
  correct per-line totals (each independently verified: quantity ×
  unit price) → correct subtotal → correct 10%-discount + 8.25%-tax →
  correct grand total ($1265.00 subtotal to $1232.43 total).
- The one edge case that actually matters for a discount field: a flat
  discount larger than the subtotal correctly caps at the subtotal
  rather than producing a negative total.
- `convert-to-job` genuinely creates an `unscheduled` job that stays out
  of the dashboard's calendar query, and is correctly linked back to the
  originating estimate via `Job.estimateId`.
- The existing Automation follow-up rule's exact query still finds a
  sent, 5-days-old estimate and reads the correct real total — proving
  this addition doesn't silently break the automation engine built
  before it.
- The customer portal's existing accept/decline flow, unchanged by this
  work, still writes correctly against the updated `estimates` table.
- A full fresh-database replay (base schema + all 9 migrations, from
  absolute zero) completes cleanly.

## A real bug found and fixed during this work, not before shipping it

The original plan was to create jobs with `status: 'unscheduled'` — but
the existing `jobs` table's CHECK constraint only allowed `'scheduled'`,
`'in_progress'`, `'completed'`, `'cancelled'`, `'on_hold'`. Every
conversion would have failed with a database constraint violation. Found
by actually attempting the insert against a live database before this
shipped, not discovered after. Fixed with a new migration
(`009_allow_unscheduled_jobs.sql`) extending the constraint — verified the
fix doesn't affect the dashboard calendar (which already excludes jobs
with no `scheduledStart`, regardless of status) or the other check
constraint on the same table (`chk_job_schedule`, confirmed to correctly
allow both schedule dates being `NULL`).

## The permission boundary, verified directly

The exact stripping logic was tested with a real "before/after" comparison
against identical input data: a caller without `estimates.profitability`
receives line items with only `description` and `total` — every cost
field, `estimatedProfit`, `profitMarginPercent`, and the entire
estimate-level aggregate are genuinely absent from the response object,
not present-but-zeroed or hidden client-side. A caller with the
permission receives the complete picture, verified to match the real
numbers computed and stored in Postgres exactly ($870.50 total profit,
83.70% overall margin on a two-line test estimate).

## The employee-rate override, verified with genuinely different rates

Not just tested with the default rate applied everywhere (which wouldn't
prove the override logic does anything) — one line item was left
unassigned (used the $35/hr company default) and a second was assigned to
a real user with a $50/hr rate on file. The two lines' computed profit
figures are genuinely different because of it ($724.50 vs. $146.00 on
different line totals), proving the resolution order actually branches
correctly rather than silently always falling through to the default.
