# Handover: how Sunny works (v3: proactive wealth)

For a developer continuing this prototype. **Future** marks things that aren’t implemented.

## What makes Sunny valuable within Tangerine’s environment?

Sunny’s value comes from being *inside* the bank. It has account context (with permission), it can start a conversation at a useful moment, it teaches in plain language, it introduces verified Tangerine offerings because of what the customer said, and it follows through on a goal the customer confirmed. The prototype demonstrates each of these with synthetic data and keeps every number and fact deterministic.

## Data flow

```
Synthetic relationship (src/data/customers.ts → domain/history.ts)
   │ daily closing balances + transactions (deterministic, internally consistent)
   ▼
Signal engine (domain/signal.ts) ── runs in the browser, separate from the AI
   │ status + evidence → Dashboard insight card + “Why am I seeing this?”
   ▼
Conversation (conversation/engine.ts reducer)
   ├─ scripted mode: intents.ts maps text → events
   └─ AI mode: aiClient.buildChatRequest → POST /api/sunny/chat → server/chat.ts
          context: customer-confirmed facts always; account details + signal evidence ONLY if permission = granted
          Gemini (server/geminiClient.ts) ↔ validated tools (server/tools.ts) → effects
       ← engine.reduce('aiTurn') re-validates every effect against real balances
   ▼
Memory (synthetic, per scenario, localStorage) → later-visit check-in → summary
```

## Signal rule: `elevated_chequing_balance` (`src/domain/signal.ts`)

Default prototype assumptions: threshold **$25,000**, window **90 days**, minimum coverage **95%**. All are configurable in Demo settings.

The rule checks, in order:
1. **Data sufficiency.** Closing balances exist for ≥ 95% of the 90 days ending today, the earliest is within 2 days of the window start, and today is present. Otherwise the status is `insufficient_data`.
2. **Review flag.** If synthetic activity is flagged as unusual or incomplete, the status is `suppressed_review`.
3. **Threshold.** Every daily closing chequing balance in the window must be ≥ the threshold. Otherwise the status is `not_met`.
4. **Earmark.** If the customer said the money is already set aside, the status is `suppressed_earmarked` (permanent for this scenario).
5. **Snooze.** If the customer chose “Not now”, the status is `suppressed_dismissed` for 30 simulated days.

Otherwise the status is `qualifies`. If some days in the window have no data (allowed up to the coverage rule), the nudge and *Why am I seeing this?* say “on all observed days” and state how many days had data (`signalSentence`, `explainSignal`, `nudgeHeadline`). The dashboard also won’t repeat the opportunity nudge once the customer has engaged with it (allocations, goal or next step from a nudge conversation), because continuity moves to check-ins (`engagedWithNudge`).

**The signal only identifies a reason to ask a question.** It never sets an amount, suitability or a product. Evidence includes the window dates, days with data, coverage, min/max/average balance, days below the threshold and the current balance.

Synthetic histories (`domain/history.ts`): pay on the 1st and 15th, rent on the 1st, bills on the 5th and 20th, a monthly transfer to savings on the 16th, and seeded variable spending. Balances are anchored to the scenario’s “today” and computed forwards and backwards, so each closing balance = previous + that day’s transactions (tested). Alex: income $5,200/mo, expenses $3,600/mo, $1,200/mo to savings. Chequing stays between about $26,000 and $29,700 over the window; it is $28,000 today and savings is $12,000. 240 days are generated, so later visits have data.

## Allocations (`src/domain/allocations.ts`)

- Balances come from accounts. **Allocations** are customer-stated purposes for part of one account’s balance (`upcoming_expenses`, `emergency`, `tuition`, `debt_repayment`, `other`).
- One allocation per account and purpose; a correction **replaces** it, so nothing is double-counted. An account’s allocations can’t exceed its balance; otherwise Sunny asks for clarification and nothing is saved.
- **Not yet assigned** = balance − allocations (never negative). It is always described as “not yet assigned to a purpose”, never “available to invest”. Savings isn’t added to the chequing discussion.

## State (`src/conversation/types.ts`)

- `profile`: the synthetic relationship. `todayIndex`: the simulated day. `signalConfig`. `mode` (`ai` | `scripted`). `view`. `stage` (scripted flow). `origin` (`nudge` | `self` | `checkin`).
- **Permission** is per session. It resets on a simulated later visit and whenever saved memory is loaded (`normalizeMemory`), and can be revoked in the chat (`revokePermission`). Messages built from account details are flagged `accountDetail`; `buildChatRequest` omits them unless permission is currently granted, so retained history can’t bypass the boundary.
- `memory` (persisted per scenario in localStorage; synthetic only; old saved memory is migrated by `normalizeMemory`):
  - `permission`, `allocations`, `goal` (type + the customer’s words), `horizon`, `nextStep`, `prompt` (what started it)
  - `topicsExplored`, `offeringsShown` (cards Sunny displayed), `offeringsExplored` (cards the customer expanded or whose official link they followed), `sourcesCited`, `supportQuestions`, `scenario`
  - `nextStepDone`, `completedSteps` (from the check-in’s **I did this**; a completed step isn’t prompted again)
  - `prefs` (`earmarked`, `dismissedUntil`, `checkinsStopped`, `remindAfter`), `lastConversationDay`, `visit`
- Messages are never persisted; a later visit starts a fresh conversation using memory.
- **Check-in** (`pendingCheckin`) appears only when there’s a saved next step other than “Not right now”, check-ins aren’t stopped or snoozed, and it’s a later simulated day than the last conversation. Its text comes from the saved next step and goal.
- Reset: “Reset this scenario” removes that scenario’s memory and time; “Reset all demo data” clears the storage key `sunny-demo-v2`.

## Navigation (`src/conversation/navigation.ts`)

After an answer, `nextTopics` builds the follow-ups:
- It starts with topics related to the one just answered, then adds context: the earmark (if no goal yet), the timeline, the goal, then general topics.
- It **never** offers the topic just answered, puts unexplored topics first, and only fills remaining space with revisits.
- `restingReplies` shows up to 3 topics plus one action (*Back to my goal*, *Explore a different goal* or *Help me think through a goal*, and *See my summary* once a next step exists).
- During a pending question, a detour shows *Continue where we left off* plus two fresh topics.
- Next steps appear four at a time (based on the timeline) with *More next steps*.
- The always-visible **Explore other topics** menu (`TOPIC_MENU`) and **Done for now** sit under the chat in both modes.

AI mode: `cleanSuggestions` drops empty, overlong, duplicate and near-duplicate suggestions, and ones repeating the latest customer message. `fallbackQuestions` tops up with the same contextual topics when fewer than two remain.

Earmarks: education and *Explore a different goal* never change `prefs.earmarked`, and never create allocations from committed money.

## Conversation logic

- **Scripted** (`engine.ts`, `script.ts`, `intents.ts`, `prompts.ts`): permission → purpose (natural-language allocation parsing) → confirm → goal → education plus one follow-up (horizon) → offerings → next step → optional scenario → summary. Education detours (22 topics in `data/education.ts`) are possible at any stage and keep progress.
- **AI** (`server/prompt.ts`, `server/tools.ts`): the opening and the permission question are local and deterministic in both modes. After that, Gemini answers, using tools that the app validates:

| Tool | Validation |
|---|---|
| `record_allocation` | Quote from the latest message; amount in the quote; not negative; ≤ balance (when shared) |
| `record_goal` / `record_time_horizon` / `record_next_step` | Quote from the latest message **and** words expressing that choice (a live test found the model recording a next step the customer hadn’t chosen) |
| `show_offerings` | Only real offering ids; only after a goal or when asked about options. The same `offeringPlan(goal, horizon)` rule as scripted mode limits the initial set; other ids appear only if the customer names those products or asks to browse all |
| `calculate_scenario` | Values from customer messages or computed allocations; contributions only, no returns |
| `read_account_snapshot` / `request_account_permission` | Only with permission / only for personal-number questions |
| `prepare_summary` / `prepare_support_preview` | Only when the customer asks |

Server-side checks also include: source ids validated against the knowledge base; inline citations stripped; any `$` figure not traceable to customer text, context, the knowledge base, offerings or tool results triggers one revision; tools are withheld after a round of declined calls; a 60-second turn deadline; a per-client rate limit on the hosted server.

## Provider

Google Gemini via the official `@google/genai` SDK (Interactions API, stateless `store: false`, retries off), in `server/geminiClient.ts`.
- Configuration: `GEMINI_API_KEY` and `GEMINI_MODEL` (default `gemini-3.5-flash-lite`, free tier) in `.env.local`.
- `server/chat.ts` is provider-neutral; another provider would need only a new adapter.
- Errors map to safe messages (quota 429, high demand 503, auth, timeout, connection), shown with **Try again** and an explicit **Use scripted demo instead**.

## Live AI testing (2026-10-24, `gemini-3.5-flash-lite`)

Through the real local API, with Alex’s context and permission granted:
- **Allocations:** recorded correctly, with $15,000 not yet assigned computed in code.
- **Goal and offerings:** the goal was recorded and offerings were shown (savings, TFSA, funds) with the “not the only options” wording.
- **Horizon:** recorded.
- **“Can I lose money?”:** answered with sources.
- **“Should I just invest the $15,000?”:** declined to decide and offered options or questions for an advisor.
- **Next step:** recorded “learn about investment risk first”.
- **Defect found and fixed:** the model recorded an unchosen next step; the meaning check was added.

One request hit Google’s 503 “high demand” and was handled correctly. Live AI was not re-run end to end in the browser after the final fixes (to conserve free-tier quota). The browser UI was checked end to end in scripted mode, and AI-mode UI paths are covered by mocked tests.

## Prototype vs. production (future work)

- **Data:** real transaction pipelines, data-quality flags and review rules in place of `reviewFlag`, and validated thresholds with A/B evaluation.
- **Consent:** durable consent records, purpose limitation, retention and audit.
- **Engagement:** real scheduling, notification preferences, frequency caps and opt-out across channels. The prototype has **no background monitoring and no real reminders**.
- **Products:** live, approved product content; eligibility and suitability processes; real handoff to Tangerine Advisors.
- **AI:** enterprise model hosting, evaluation sets (including the README questions), red-teaming, monitoring, and compliance sign-off of prompts and tools.
- **More signal rules** (e.g. a payroll change or a debt paid off, from the original decision tree), each needing the same signal → ask → confirm pattern.
