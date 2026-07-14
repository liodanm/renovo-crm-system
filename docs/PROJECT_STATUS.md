# Project Status Report

Based on direct inspection of the codebase (controller routes, Prisma
models, frontend pages) — not estimated. Regenerate this by re-running the
same inspection if the codebase changes meaningfully; treat it as a
snapshot, not a document to hand-edit as features are added elsewhere.

One finding shapes this whole report: **there is no dedicated backend
module for Jobs, Estimates, Scheduling, or Invoices.** Those exist only as
Prisma models, written to indirectly by the AI receptionist and read from
by automation and the customer portal. There is no way for staff to
create an estimate, schedule a job, or generate an invoice through any
working system today — only through raw API calls, or the separate Claude
Artifact demo, which is not connected to this backend.

| Feature | Backend | Database | API | Frontend | Connected | Production Ready |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Authentication | Yes | Yes | Yes | Yes | Yes | Yes |
| Dashboard | Yes | Yes | Yes | No | No | No |
| Customer Management | Yes | Yes | Yes | Yes | Yes | Yes |
| Property Management | Partial* | Yes | Partial* | No | No | No |
| Lead Management | Yes | Partial** | Yes | No | No | No |
| Estimates | No*** | Yes | No*** | No | No | No |
| Scheduling | No*** | Yes | No*** | No | No | No |
| Jobs | No*** | Yes | No*** | No | No | No |
| Calendar | Partial**** | Yes | Partial**** | No | No | No |
| Invoices | No*** | Yes | No*** | No | No | No |
| Payments | Yes | Yes | Yes | No | No | No |
| Automation (engine) | Yes | Yes | Yes | No | No | Yes***** |
| Review Requests | Yes | Yes | Yes | No | No | Yes***** |
| AI Features | Partial****** | N/A | Partial****** | No | No | No |
| Reports | No | No | No | No | No | No |
| Settings | Partial******* | Partial | Partial | No | No | No |
| File Uploads | Yes | Yes | Yes | Yes (customer photos/docs only) | Yes | Yes |

\* Properties only exist as sub-endpoints under `/customers/:id/properties` — no dedicated property module, and no property detail page in the frontend.
\*\* Leads are just `Customer` rows with `leadStatus: 'lead'` — no dedicated Lead entity.
\*\*\* Only created as a side effect of the AI receptionist's tools (`schedule_estimate`, `reschedule_job`), or read by the customer portal/automation. No staff endpoint to create, list, edit, or reschedule any of these exists.
\*\*\*\* `dashboard/calendar` is read-only — returns jobs in a date range, nothing to create or move a job.
\*\*\*\*\* The automation engine itself (cron job, real SMS/email sending) runs and is tested independent of any UI — configurable only via raw API calls today, not a screen.
\*\*\*\*\*\* Dashboard AI suggestions and the portal chat's tool-calling logic are built and tested; the AI receptionist's real-time voice loop (ConversationRelay) has never been tested against a live phone call.
\*\*\*\*\*\*\* Only automation settings and receptionist settings exist, each narrow to that one feature — no unified company/branding/user settings screen.

## What "Yes" actually means here

- **Authentication**: register, login, password reset, email verification,
  company invites, Google/Microsoft OAuth, session management — real,
  tested, connected frontend.
- **Customer Management**: full CRUD, duplicate detection/merge, notes,
  custom fields, CSV import/export — real, tested, connected frontend.
- **File Uploads**: real presigned S3 uploads, but only reachable today
  through the Customer detail page's photo/document tabs.

## Work remaining before daily use, in priority order

1. Build staff-facing Estimates, Jobs/Scheduling, and Invoices — backend
   API and frontend, from scratch. Not a refinement; doesn't exist yet.
2. Build a Dashboard page and an Automation settings/log page in the
   frontend — backend for both is real and tested, nothing to click yet.
3. Build the customer portal frontend — backend has existed and been
   tested for several turns with no UI consuming it.
4. Decide what to do about Reports — currently zero backend, zero API.
5. Finish two smaller approved-but-unbuilt items: Stripe failed-payment
   handling, and a unified Settings screen.
