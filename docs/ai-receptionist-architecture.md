# Renovo AI Receptionist — Architecture

## 1. Why this is a backend/telephony system, not a CRM screen

Everything else built in this project so far has been either a real backend
module or a client-side prototype. An AI receptionist is neither — it's a
**telephony system**: Twilio receives an inbound call on a real phone
number and hits *your server's* webhook, in real time, whether or not
anyone has a browser open. There is no version of "answer a phone call"
that runs in a browser tab. This document designs the real system; the
companion backend code implements it against the same Prisma schema and
service patterns as the rest of Renovo's backend.

## 2. Call flow, end to end

```
Customer dials Renovo's business number
        │
        ▼
Twilio receives the call → POST webhook → Renovo's /twilio/voice/incoming
        │
        ▼
Business-hours check (ReceptionistSettings)
        │
   ┌────┴─────┐
   │           │
 Open       Closed
   │           │
   ▼           ▼
Connect to   TwiML <Record> → voicemail,
ConversationRelay   transcribed + logged exactly
(AI voice agent)    like a normal call
   │
   ▼
Real-time speech ⇄ Claude (function-calling) ⇄ CRM actions
   │
   ├─ Caller wants an estimate  → schedule_estimate tool → real Job/Estimate created
   ├─ Caller wants to reschedule → reschedule_job tool → real Job updated
   ├─ Caller asks a question    → answer_faq tool → grounded in real FAQ + business data
   ├─ New caller                → collect_customer_info tool → real Customer created
   └─ Caller asks for a person  → transfer_to_owner tool → TwiML <Dial> mid-call
        │
        ▼
Call ends → Twilio status webhook → recording finalized, transcript stored
        │
        ▼
Async: Claude summarizes the transcript → stored on the Call record
        │
        ▼
If an action was taken (appointment booked/moved) → real SMS confirmation via Twilio
        │
        ▼
Call + summary + recording visible in the CRM's Call Log
```

## 3. Voice AI: ConversationRelay, not old-style IVR

Twilio's older pattern — TwiML `<Gather>` looping with DTMF or short speech
snippets — is what phone-tree IVRs have always been, and it's a poor match
for "have a real conversation." The current right tool is Twilio
**ConversationRelay**: Twilio handles speech-to-text and text-to-speech in
real time over a WebSocket connection to your own server, and your server
just exchanges text with an LLM — no separate STT/TTS vendor integration
needed, and it's built specifically for LLM-driven voice agents.

```
TwiML on incoming call:
<Response>
  <Connect>
    <ConversationRelay url="wss://api.renovocrm.com/twilio/voice/relay"
                        welcomeGreeting="Thanks for calling Renovo Pressure Washing, how can I help?" />
  </Connect>
</Response>
```

Renovo's server holds the WebSocket open for the call's duration. Twilio
sends transcribed caller speech as it happens; the server calls Claude
(with the same tool-use pattern already used elsewhere in Renovo's AI
architecture) and streams the response text back to Twilio, which speaks
it. This is genuinely real-time — sub-second turnaround matters here in a
way it doesn't for a chat UI, since dead air on a phone call reads as the
system being broken.

## 4. Tool-calling — the receptionist can act, not just talk

Same pattern as Renovo's in-CRM AI Assistant: a fixed set of tools with
JSON schemas, executed against real Prisma-backed services, not free-form
LLM output written directly to the database.

| Tool | What it does |
|---|---|
| `collect_customer_info` | Creates or looks up a `Customer` record from name/phone/address collected in conversation |
| `schedule_estimate` | Creates a real `Estimate` + a scheduled site-visit `Job`, checking real crew/calendar availability the same way the Scheduling module does |
| `reschedule_job` | Finds the caller's existing job (by phone number lookup) and updates its `scheduledStart`/`scheduledEnd` |
| `answer_faq` | Retrieves from `FaqEntry` (hours, service area, pricing ranges, what's included) — grounded answers, not the model improvising business facts |
| `transfer_to_owner` | Ends the ConversationRelay text loop and returns TwiML `<Dial>` to `ReceptionistSettings.transferPhoneNumber`, live mid-call |

Unlike the CRM's in-app AI Assistant (where a human reviews a drafted
estimate/invoice before it commits), a caller booking a site-visit estimate
is a low-risk, easily-reversible action — the receptionist can complete it
directly. Anything higher-stakes (a large commercial quote, anything
involving a price override) should route to `transfer_to_owner` instead of
being fully automated — a judgment call the system prompt encodes.

## 5. Recording, transcription, and summarization

- **Recording**: Twilio records the call (dual-channel, so caller and
  AI/agent audio are separable) and POSTs a recording-status webhook with a
  secure media URL when it's ready.
- **Transcript**: ConversationRelay already produces a running transcript
  as a byproduct of the STT it's doing for the conversation — captured
  turn-by-turn as the call happens, not re-transcribed afterward.
- **Summarization**: once the call ends, an async job sends the full
  transcript to Claude with a structured-output prompt (topics discussed,
  outcome, action items, caller sentiment) and stores the result on the
  `Call` record — the same async-job pattern used for other AI work in
  Renovo's architecture, so a slow summarization call never blocks the
  webhook response Twilio is waiting on.

## 6. SMS confirmations

Real Twilio Messages API call, fired right after a `schedule_estimate` or
`reschedule_job` tool executes successfully — same message-composition
pattern as the CRM's estimate/invoice text-confirmation flow, just
triggered by the call instead of a human clicking "Text Customer."

## 7. Security

- **Webhook signature validation**: every Twilio webhook (voice, status,
  recording) is validated against `X-Twilio-Signature` using Twilio's
  documented HMAC-SHA1 scheme and the account's auth token — an
  unauthenticated `/twilio/voice/incoming` endpoint would let anyone POST
  fake "calls" that create real customers and jobs.
- **Call recording consent**: many US states require one- or two-party
  consent to record calls. The `ConversationRelay` welcome greeting (or a
  short TwiML `<Say>` before connecting) should disclose that the call may
  be recorded, and `ReceptionistSettings` should let an owner configure
  disclosure language per their state's requirement — this is a legal
  compliance detail worth getting right, not an engineering afterthought.
- **PII in transcripts**: call transcripts and summaries contain customer
  PII (name, address, sometimes payment intent) — they live in the same
  Postgres instance under the same Row-Level Security tenant-isolation
  policy as every other customer record in Renovo, not a separate,
  less-guarded store.

## 8. What's genuinely testable without a live Twilio account

TwiML XML generation, webhook signature validation logic, the tool
executor's business logic (real Prisma calls against real data), and SMS
message formatting are all pure logic that can be validated in a sandbox
with real assertions — and were, in the companion backend code. The one
thing that can't be verified without a live phone number and a real call
is the ConversationRelay WebSocket loop's actual real-time behavior; that
needs Twilio's own test tools or a real call once deployed.
