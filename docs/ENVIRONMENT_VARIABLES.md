# Environment Variables — Renovo CRM

Every variable below is in `.env.example`. This explains what each group
is for, whether it's required to boot at all, and exactly how to get real
values. Check the server's startup logs (`--- Integration status ---`)
after any change — it tells you immediately what's live and what isn't,
rather than you discovering it when a feature silently doesn't work.

## Required to start at all

The app refuses to boot without these — there's no reasonable "degraded"
mode for a database connection or the auth signing keys.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Staff auth signing keys — generate with `openssl rand -base64 64` |
| `PORTAL_JWT_SECRET` | Customer portal auth signing key — **must be a different value from the two above**, generated the same way |

## Optional — the app boots without these, specific features don't work

Each of these degrades gracefully (the relevant feature no-ops and logs a
warning) rather than crashing anything else.

### Twilio — SMS (automation reminders, AI receptionist)
1. Create an account at twilio.com.
2. Buy a phone number (Console → Phone Numbers → Buy a number) — a local
   number in your area code reads as more trustworthy to customers than
   an obviously-out-of-state one.
3. Console home page shows your **Account SID** and **Auth Token** directly.
4. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   (the number you bought, in `+15551234567` format).

**Cost**: ~$1.15/month for the number, ~$0.0079 per SMS segment. At solo-
operator volume (a few hundred messages/month), expect under $5/month total.

### Postmark — Email (all transactional and automation email)
1. Create an account at postmarkapp.com.
2. Create a "Server" (their term for a sending environment) — one is fine.
3. Servers → API Tokens → copy the **Server Token**.
4. You'll need to verify a sending domain or address before Postmark lets
   you send — follow their DNS verification steps for your domain, or use
   a single verified email address for a faster start.
5. Set `POSTMARK_SERVER_TOKEN` and `MAIL_FROM_ADDRESS` (the address you verified).

**Cost**: free tier covers 100 emails/month; realistic solo-operator
volume likely fits the $15/month tier (10,000 emails) with room to spare.

### Stripe — Payments (portal invoice payment)
1. Create an account at stripe.com.
2. Developers → API keys → copy the **Secret key** (starts `sk_live_` in
   production, `sk_test_` while testing — use the test key until you're
   ready to accept real payments).
3. Developers → Webhooks → Add endpoint → point it at
   `https://<your-domain>/api/v1/portal/webhooks/stripe` → select the
   `payment_intent.succeeded` and `payment_intent.payment_failed` events →
   copy the **Signing secret**.
4. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

**Cost**: no monthly fee — Stripe takes 2.9% + $0.30 per successful card
transaction. This is a per-transaction cost, not a fixed bill.

### AWS S3 — File storage (photo uploads)
1. Create an AWS account if you don't have one.
2. **Create a dedicated IAM user for this app — never use your root
   account's keys.** IAM → Users → Create user → Attach this minimal
   policy (scoped to only the one bucket, nothing else in your AWS account):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
       "Resource": ["arn:aws:s3:::YOUR-BUCKET-NAME", "arn:aws:s3:::YOUR-BUCKET-NAME/*"]
     }]
   }
   ```
3. Create the S3 bucket itself (S3 → Create bucket) — keep "Block all
   public access" ON; this app uses presigned URLs, which don't require a
   public bucket.
4. IAM → Users → your new user → Security credentials → Create access key.
5. Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (the
   region you created the bucket in), `AWS_S3_BUCKET` (the bucket name).
6. This same bucket is what `docs/BACKUP_AND_RECOVERY.md` uses for
   database backups — no separate bucket needed, just add the lifecycle
   rule described there.

**Cost**: S3 storage is $0.023/GB/month — photos + 30 days of database
backups for a solo operation will realistically run a few dollars a month
at most.

## Total realistic monthly cost, all four services, at solo-operator scale

Roughly **$20-30/month** — Postmark's paid tier is the largest line item,
everything else is usage-based and small at this scale. Not a meaningful
cost relative to what these features save in admin time.

## Logging & error handling

- **`LOG_LEVEL`** (optional, default `info`) — one of `fatal`, `error`,
  `warn`, `info`, `debug`, `trace`.
- All logs are structured JSON in production (pretty-printed only in
  local dev). Authorization headers, cookies, and any request-body
  password/token fields are redacted before they're ever written —
  verified directly against real log output, not just configured and
  assumed.
- Every unhandled exception is caught by a global filter: the client
  always gets a safe, generic message for genuinely unexpected errors
  (never a stack trace or internal detail), while the server-side log
  always gets the full error, with stack trace, for diagnosis. Errors the
  application throws intentionally (e.g. "Estimate not found") still show
  their real message to the client — that distinction is what the filter
  exists to enforce.
