# Sunny: first-home saving prototype

An interactive concept prototype for the Ivey MSc Advanced Field Project with Scotiabank/Tangerine. A customer, Alex, talks with **Sunny**, an AI conversational guide, to understand saving for a first home, what Tangerine offers that relates to it, and possible next steps.

> **Academic prototype · Synthetic data.** Not an official Tangerine application, not a production banking system, and not financial advice. Nothing in it has been reviewed or approved by Tangerine.

## Quick start (scripted demo, no setup needed)

Requires Node.js 20.19+ or 22.12+ (tested with Node 24.22).

```bash
cd "/Users/sally/Downloads/Scotia AFP/sunny-prototype"
npm install            # first time only
npm run dev            # open http://localhost:5173
```

Without an API key, Sunny runs in **scripted demo mode**. A "Scripted demo" label appears in the chat header and in **Demo settings**. Replies are pre-written and keyword-matched; they are not AI.

## Enable live AI with Google Gemini (one-time, free tier)

1. Create a Gemini API key in **Google AI Studio**: https://aistudio.google.com/app/apikey (sign in with a Google account → **Create API key**). To stay on the free tier, use a project **without billing enabled**. A Claude subscription does not provide this key.
2. Put it in a local env file in this folder:
   ```bash
   cd "/Users/sally/Downloads/Scotia AFP/sunny-prototype"
   cp .env.example .env.local
   # edit .env.local:  GEMINI_API_KEY=your-key   (optional: GEMINI_MODEL=...)
   ```
3. Check the configuration. This prints whether a key was found (never the key itself) and whether the model exists; it doesn't generate content:
   ```bash
   npm run ai:check
   ```
4. Restart `npm run dev`. Sunny starts in **Live AI** mode. You can also confirm with **Demo settings → Test AI connection**.

**Model.** `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`: stable, listed with a free tier on Google's Gemini API pricing page (checked 2026-10-21), and the model verified live for this prototype. `gemini-3.8-flash` is Google's recommended Flash model and is also free-tier, but it returned "high demand" (HTTP 503) throughout testing. Switch to it with `GEMINI_MODEL=gemini-3.8-flash` if it's available. Free-tier eligibility can change, so check https://ai.google.dev/gemini-api/docs/pricing before switching models.

**Free-tier limits.** Limits apply per model, in requests per minute and per day; see https://aistudio.google.com/rate-limit. A Sunny turn uses 1–3 requests (tool steps count). When a limit is hit, Sunny shows "Gemini's free-tier usage limit has been reached…" with **Try again**: per-minute limits clear within about a minute, and daily limits reset at midnight Pacific time. You can also switch to the scripted demo, but only by choosing it. The app never enables billing, requests paid service tiers, or falls back to another provider.

**Data rule.** Use **only synthetic customer data and public knowledge sources** in this prototype. On the Gemini API free tier, Google states that content may be used to improve its products. The demo customers are synthetic, and the knowledge base contains only public pages.

**Where the key lives.** Only in `.env.local` (git-ignored, readable only by your user), which the local server process reads. The browser calls `/api/sunny/*` and never receives the key. The variable is not `VITE_`-prefixed, so Vite never bundles it. I verified that neither the real key nor the SDK appears in `dist/` or the server logs, and the app never logs the key or provider error details.

## Share it with teammates (hosted on Render, free)

The repo includes a `render.yaml` Blueprint that deploys Sunny as **one free web service** (frontend + API) with live Gemini.

1. Sign in at https://dashboard.render.com (signing in with GitHub is easiest).
2. Click **New → Blueprint**, connect GitHub if asked, and pick the **jeojji/sunny-prototype** repo.
3. When it asks for `GEMINI_API_KEY`, paste your Google AI Studio key. It's stored as a secret in Render, not in the repo.
4. Click **Apply** / **Deploy**. The first build takes a few minutes. Your link will look like `https://sunny-prototype-xxxx.onrender.com`; share that with your team.

If Blueprints aren't available on your account, use **New → Web Service → Public Git Repository** with `https://github.com/jeojji/sunny-prototype` instead. Set build command `npm ci && npm run build`, start command `npm start` and instance type **Free**, and add the environment variables `GEMINI_API_KEY` (your key), `GEMINI_MODEL=gemini-3.5-flash-lite` and `NODE_VERSION=24`.

**Good to know**
- Free Render services go to sleep after 15 minutes without visits. The next visit takes about a minute to wake up, so open the link a minute before a demo.
- Everyone shares your Gemini free-tier quota. The hosted server allows each device up to 30 messages per 10 minutes (`SUNNY_RATE_LIMIT_MAX` changes this). If Gemini's limit is reached, Sunny says so and offers **Try again**.
- Pushing to `main` redeploys automatically.
- To run the hosted version locally: `npm run build && npm start`, then open http://localhost:3000.

**Feedback.** The **Give feedback** link in the header opens a GitHub issue with a short template (what you tried, what Sunny did, what worked, what felt off). Teammates need a GitHub account. You'll see all feedback under the repo's **Issues** tab.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | App and local API at http://localhost:5173 |
| `npm run build` | Type-check, then build the frontend to `dist/` |
| `npm run preview` | Serve the build *with* the local API at http://localhost:4173 |
| `npm start` | Production server (after `npm run build`): app + API at http://localhost:3000, as on Render |
| `npm run ai:check` | Report whether Gemini is configured and the model is reachable (no generation) |
| `npm test` | All tests (Vitest; model responses are mocked) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run check` | Type check, lint, tests and build together |

`dist/` alone is a static frontend. Live AI needs the local API, so use `npm run dev` or `npm run preview`.

## What's implemented

- **Education first.** Sunny opens with "Hi Alex, what would you like to understand about saving for your first home?" and four optional starters. Questions work immediately, with no target, timeline or account access needed.
- **Live AI conversation with Google Gemini (when configured).** Uses the official Google Gen AI SDK (`@google/genai`, Interactions API) from the local server, with function tools and JSON structured output (reply, source ids, follow-up suggestions). Requests are stateless (`store: false`) and SDK retries are off to protect free-tier quota. Sunny answers first, keeps replies short, remembers stated facts, recognizes corrections and asks for clarification when something is ambiguous.
- **Curated knowledge base** (`src/shared/knowledge.ts`). It holds 22 entries from official Tangerine, CRA, FCAC and CDIC pages, each reviewed on 2026-10-21 and labelled *Tangerine offering* or *general education*. The model is given relevant entries each turn and told to answer product questions only from them. FHSA availability at Tangerine is recorded as **unconfirmed**.
- **Validated source links.** Below factual replies, a "Sources (n)" disclosure shows publisher, page, review date and a Tangerine/General tag. The app accepts only knowledge-base ids, so the model cannot invent URLs. A note states that sources are not Tangerine approval.
- **Deterministic facts and maths.** Tools on the server (snapshot read, fact proposal, scenario calculation, summary, support preview) validate every model action. Values must appear in what the customer said, negatives are rejected, savings above the snapshot balance need a "held elsewhere?" clarification, and all arithmetic runs in `src/lib/calc.ts`. The client re-validates before applying anything.
- **Permission only when useful.** The snapshot (balances and cash flow only) is sent to the model only after the customer taps *Yes, use my account snapshot*.
- **Optional calculator.** The scenario card and the "Your goal at a glance" panel appear once there's something to show. Assumptions are visible and all four values can be edited. What-ifs are labelled "not saved".
- **Honest errors.** Missing key, invalid key, quota exhaustion (HTTP 429), Gemini "high demand" (503), timeouts and connection failures each get a clear message in the chat, with **Try again** and **Use scripted demo instead**. The app never switches modes silently.
- **Guards learned from live testing.** These are deterministic and enforced in code:
  - Snapshot permission, summaries and support previews can only be triggered by what the customer actually asked.
  - After a step where every tool call was declined, the model must answer in text.
  - Any dollar figure in a reply that doesn't come from the customer, stated facts, the snapshot, the knowledge base or the calculator triggers one rewrite request.
  - Recording an emergency reserve also sets the home-goal amount in code (savings − reserve).
- **Scripted demo mode.** Keyword-based and deterministic, with 16 education answers (each with a simpler version and sources), the optional goal flow, emergency-reserve corrections, negative-amount and over-balance handling, and clarifying replies instead of refusals.
- Human-support concept preview, printable summary (now including sources referenced), demo presets (Alex, Jordan, Sam) and reset behaviour are kept from v1.

## Using the demo

See `DEMO_SCRIPT.md` for the 2–3-minute story. Things to try in either mode: "What is an FHSA?", "Is an FHSA an investment?", "Does Tangerine offer one?", "Can I lose money?", "Can I take the money out whenever I want?", "I don't know how much I need yet.", "Actually, keep $10,000 for emergencies", "I'm overwhelmed. Can you explain that more simply?".

## Tests

`npm test` runs 78 automated tests with **mocked** model responses (no network):
- `server/geminiClient.test.ts` (9): Gemini request mapping (free-tier default model, `store: false`, no service tier, system instruction separate from reference context, function tools, function-result steps, `tool_choice: 'none'` when forcing an answer), retries disabled, abort signal passed, and error mapping for quota (429), invalid key, missing model, high demand (503), timeout and connection failures.
- `server/chat.test.ts` (28): missing key, verify failure, provider errors, timeouts (including a client that ignores aborts), request limits, unreadable output, tool-loop limit, source-id validation, instruction/customer separation, snapshot privacy, permission/summary/support guards, grounded and derived fact updates, paraphrased quotes, negatives, over-balance clarification, deterministic and hypothetical calculations, the dollar-figure check, inline-citation cleanup and the hosted rate limit.
- `src/conversation/engine.test.ts` (24), `src/App.test.tsx` (6), `src/lib/*.test.ts` (11): conversation logic, UI flows, calculation and parsing.

**Live Gemini testing (2026-10-21, gemini-3.5-flash-lite, real key).** I ran these through the real local API and in Chrome at desktop and mobile sizes:
- the example education questions
- "Does Tangerine offer one?" (answered as unconfirmed, with sources)
- "Can I lose money?" and "Can I take the money out whenever I want?"
- "What can Tangerine actually help me with?", "I don't know how much I need yet.", "explain more simply"
- a goal question with snapshot permission ($24,000 → $49,200, $800 short)
- the correction "keep $10,000 for emergencies" ($14,000 → $39,200, $1,000/month)
- a negative amount (rejected with a clarifying question)
- "$30,000 for the house" (asked whether money is held elsewhere)
- a prompt-injection attempt (declined; nothing revealed)

Turns took about 1–4 seconds. The free-tier 429 and the 503 "high demand" messages both appeared live and displayed correctly.

## Limitations

- Live Gemini behaviour was tested on a limited set of conversations within free-tier limits. Model output can still vary: for example, it can add general detail beyond the knowledge base, and occasionally needs a second step to record facts. Rehearse demos, and expect 429s if you send many messages quickly.
- Gemini availability depends on Google (e.g. 503 "high demand"), and free-tier eligibility and limits can change.
- Retrieval is keyword-based over 22 curated entries, and the content is a snapshot reviewed on 2026-10-21. There is no live web lookup.
- Scripted mode understands a fixed set of phrasings.
- Conversation state is in memory only; refreshing resets the demo.
- English only. Accessibility was checked by hand and with automated browser runs, not with a formal audit.
- For local demonstration only; there is no deployment, authentication or production hardening.
