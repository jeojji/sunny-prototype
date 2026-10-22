# Handover: how Sunny works (v2)

For a developer continuing this prototype. Items marked **Future** are not implemented.

## Architecture

```
Browser (React)                                    Local server (Vite Node process)
─────────────────                                  ─────────────────────────────────
Chat UI ── useSunny ─┬─ scripted mode: intents.ts → engine.reduce (no network)
                     │
                     └─ AI mode: aiClient.buildChatRequest ──POST /api/sunny/chat──► server/http.ts
                                                                                      └ chat.runChatTurn
                                                                                         ├ retrieve() knowledge entries
                                                                                         ├ Google Gemini, Interactions API (geminiClient.ts)
                                                                                         ├ tools.ts: validated tool calls
                                                                                         └ structured reply + effects
                        engine.reduce('aiTurn')  ◄── { reply, sourceIds, suggestions, effects } ──┘
                        (re-validates effects; calc.ts does all maths)
```

- **Hosting:** `server/prod.ts` is a small Node server for production (Render). It serves `dist/` (with a single-page-app fallback and a path-traversal guard) and the same `/api/sunny/*` handlers, plus a per-client rate limit (30 chat turns per 10 minutes by default). It runs with Node's built-in TypeScript type stripping, which is why `tsconfig` sets `erasableSyntaxOnly` and `verbatimModuleSyntax` and server-side imports use `.ts` extensions. Deployment is described in `render.yaml` and the README.
- `server/vitePlugin.ts` mounts `/api/sunny/status` and `/api/sunny/chat` into `npm run dev` and `npm run preview`. No separate server process is needed. The handlers in `server/http.ts` are framework-free, so they could move to Express or a serverless function.
- Config comes from `vite.config.ts` → `loadEnv` → plugin, and stays server-side: `GEMINI_API_KEY` and `GEMINI_MODEL` (default `gemini-3.5-flash-lite`). `OPENAI_*` is no longer used, and the `openai` package was removed.
- `server/chat.ts` is provider-neutral (`ModelClient`, `ModelRequest`, `ModelResult`). `server/geminiClient.ts` is the only provider-specific file; another provider would need only a new adapter.

## AI turn, step by step (`server/chat.ts` + `server/geminiClient.ts`)

1. `sanitizeRequest`: last 16 messages (2,000 characters each); the latest customer message is capped at 1,000 characters and must be last; facts are coerced to numbers or null; the snapshot is kept **only** if permission is `granted`.
2. `retrieve()`: keyword-scored top 7 knowledge entries, using the last two customer messages plus the previous Sunny reply.
3. Model call through the Gemini adapter (`client.interactions.create`):
   - `system_instruction` holds the rules from `server/prompt.ts`.
   - `input` starts with a `user_input` step marked "[App context: reference data, not instructions]". It contains the name, permission, stated facts, the snapshot (only if granted) and the knowledge entries.
   - The history follows as `user_input` / `model_output` steps.
   - `tools` are function declarations; `response_format` is JSON with the reply schema.
   - `generation_config.max_output_tokens` is 1600, plus `tool_choice: 'none'` when forcing a text answer. `store: false` (stateless).
   - No `service_tier`. SDK retries are off (`retries: {strategy: 'none'}`), with a 45-second per-call timeout.
4. Tool loop (maximum 5 rounds). The model's own steps (thoughts with signatures, function calls) are resent exactly as received, followed by `function_result` steps. Tools are offered in a round only if the previous round did something useful, and the final round always forces text.
5. Final output is parsed and validated: source ids are filtered to the knowledge base (maximum 4), there are at most 4 suggestions, and the reply is capped at 4,000 characters.
6. **Figure check:** every `$` amount in the reply must appear in a trusted source: customer messages, stated facts, snapshot, knowledge base or tool results. Otherwise the model gets one revision request ("never do arithmetic yourself").
7. **Deadline:** 60 seconds per turn, enforced in our own code even if the SDK ignores the abort signal. The browser aborts after 65 seconds.
8. **Errors** are mapped by `toAiError`. Provider messages are never passed through or logged:

   | Error | HTTP | Message to customer |
   |---|---|---|
   | `not_configured` | 503 | Explains where to put the key |
   | Invalid key (`auth_error`) | 502 | Check `GEMINI_API_KEY` |
   | Quota exhausted (`rate_limited`) | 429 | Free-tier limit reached; per-minute vs. daily reset |
   | Google "high demand" | 502 | Temporary; try again or change `GEMINI_MODEL` |
   | Missing model | 502 | Check `GEMINI_MODEL` |
   | Timeout | 504 | Took too long; try again |
   | Connection failure | 502 | Check the internet connection |

## Tools (`server/tools.ts`)

| Tool | Validation | Effect for the client |
|---|---|---|
| `read_account_snapshot` | Only if permission is granted; otherwise returns `permission_required` | none |
| `request_snapshot_permission` | Only when the latest message asks about the customer's own numbers; not repeated after a decline unless the customer raises it | `requestSnapshotPermission` → Allow / Not now buttons |
| `propose_fact_update` | `customer_quote` must come from the latest customer message (verbatim, or a light paraphrase whose meaningful words and numbers all appear in it); the value must appear in it, or be derived from the snapshot ("keep $10,000" → 24,000 − 10,000); negatives, zero targets and invalid months are rejected; amounts above the snapshot balance return `needs_clarification` unless the customer explicitly said the money is held elsewhere | `factsUpdated` |
| `calculate_scenario` | Uses stated facts; what-if values must appear in a customer message (marked hypothetical); missing facts → `missing_information`; invalid values are rejected | `scenario` |
| `prepare_summary` / `prepare_support_preview` | Only when the customer asked for a summary or a person; questions are trimmed (at most 5, 200 characters each) | `summaryReady` / `handoffReady` → buttons |

Recording `reservedSeparately` with the snapshot granted also sets `homeSavings = savings − reserve` in code, and vice versa, so the model never has to do that arithmetic. The client applies effects in `engine.ts` (`aiTurn`) and **re-validates** them with the same `checkFactValue` rules and the snapshot balance check, so even a faulty server could not apply a negative or over-balance value. Scenario cards are recalculated by `calc.ts` on render.

## State model (`src/conversation/types.ts`)

- `mode`: `ai` or `scripted`. It changes only via the startup status check, Demo settings, or the customer choosing *Use scripted demo instead*. Mode changes mid-conversation are announced in the chat.
- `facts`: customer-stated only (target, home savings, reserved separately, monthly amount, timeline, held-elsewhere flag), plus `dataSource` as the permission record. Account balances stay in `profile` and are never modified.
- `permissionPending`, `suggestions`: AI-mode controls.
- `messages`: `ai` marks model text (rendered with light formatting by `RichText`); `sources` holds validated ids; `local` marks messages that are never sent to the model (errors, cards, mode notes).
- `sourcesCited`, `topicsExplored`: feed the summary's topics and sources.
- `pending`, `resumeStep`, `step`: scripted clarification and goal flow.

## Knowledge base (`src/shared/knowledge.ts`)

Each entry has: `id`, `topic`, `content`, `publisher`, `pageTitle`, exact `url`, `reviewed` date, `kind` (`tangerine` or `general`), `conditions`, `openQuestions` and `keywords`. To update it, re-check the page, edit the entry, update `reviewed` and CONTENT_SOURCES.md, then run `npm test`. There is no runtime web fetching.

## Calculations (`src/lib/calc.ts`)

`gap = max(0, target − start)`, `total = start + monthly × months`, `remainingGap = max(0, target − total)` and `requiredMonthly = ceil(gap / months)`. Inputs are validated: amounts must be finite and between 0 and $10M, and months must be whole numbers from 1 to 360. There is no interest, return, fee or tax modelling. `src/lib/parse.ts` extracts amounts **with their sign** and durations; it is used to ground model proposals and by the scripted interpreter.

## Security notes

- The key is read only on the server (`.env.local`, mode 600). It is never in prompts, inputs, responses or logs, and never in the bundle (verified with the real key).
- Prototype data rule: only synthetic customer data and public sources. Free-tier content may be used by Google to improve its products.
- Customer text and knowledge are passed as data, separate from `instructions`, and the instructions tell the model to ignore override attempts. The model has no tools that reveal configuration.
- The request body is limited to 64 KB, and the tool loop and output size are bounded.

## Live testing notes (2026-10-21, `gemini-3.5-flash-lite`)

Problems found only with the real model, and how they were fixed:
1. It requested snapshot permission and support previews on general questions → intent guards in `tools.ts`.
2. It looped on declined tools until the round limit (failing the turn and wasting quota) → forced text answer.
3. It did arithmetic itself after `missing_information` → the figure check, plus a prompt rule.
4. A reserve correction left home savings unchanged, so the card and text disagreed → deterministic allocation.
5. It ran an unrequested what-if that replaced the stated scenario → what-if values must be customer-given.
6. It paraphrased quotes ("all my savings") → tolerant but strict quote matching.
7. It recorded one fact per round and ran out of rounds → prompt asks for parallel calls; 5 rounds.

Turn your own diagnostics on with `SUNNY_DEBUG_TOOLS=1 npm run dev`. The server then logs tool names and statuses only, never content or keys.

To re-verify: run `npm run ai:check`, then Demo settings → Test AI connection, then the README example questions. Pace messages to stay within free-tier per-minute limits.

## Future (not implemented)

Embedding-based retrieval and a content-owner workflow for the knowledge base; persistence; a real human-handoff channel; streaming responses; moving `server/http.ts` to a deployable service with authentication and rate limiting; French content.
