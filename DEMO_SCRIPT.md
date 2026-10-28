# Demo script: “Alex’s money finds a purpose” (≈3½–4 minutes)

**Setup:** run `npm run dev` and open http://localhost:5173 at about 1440×900. Open **Demo settings** → **Reset all demo data**, then close the panel.
- **Live AI (Gemini)**, if configured: Sunny’s wording will vary slightly. Rehearse once, and pace your messages (free tier). If you see “high demand” or “usage limit”, wait a minute and click **Try again**.
- **Scripted demo:** the wording is exact, and the chat shows a “Scripted demo” label. Say it’s scripted if you record it this way.

**Simulated time:** the “later visit” in step 7 is a demo control that moves a simulated clock forward. Sunny does **not** monitor accounts in the background or send notifications in this prototype. In a real product that would need consent, scheduling, notification preferences and frequency limits.

---

### 1. A useful moment (0:00–0:30)
**Screen:** Alex’s dashboard: balances, 90-day trend, recent activity, and Sunny’s insight card.
**Say:** “Alex didn’t open a chatbot. Sunny noticed something in Alex’s own banking: chequing has stayed above $25,000 for three months. Notice the wording: it asks, it doesn’t judge.”
**Do:** open **Why am I seeing this?** “The explanation comes from the actual data and says plainly that a balance isn’t a judgment.”

### 2. Consent, for this conversation only (0:30–0:50)
**Do:** **Explore with Sunny** → **Yes, use my account details**.
**Say:** “Sunny asks before using account details, and only for this conversation. On a later visit it asks again, and there’s a **Stop using my account details** link under the chat.”

### 3. What is the money actually for? (0:50–1:20)
**Do:** click **I need $3,000 for bills and $10,000 for emergencies.**
**Say:** “Sunny doesn’t assume the money is spare. It leaves $15,000 *not yet assigned to a purpose*, never ‘available to invest’, and doesn’t quietly add the separate $12,000 in savings.” **Yes, that’s right.**

### 4. A goal in Alex’s words, and a timeline (1:20–1:50)
**Do:** click **I want to build wealth, but I don’t know how investing works.**
**Say:** “No questionnaire. Sunny explains first, then asks one question that matters: when might Alex need this money?” Click **More than 5 years away**.
*(Optional contrast: choosing **Within a year** instead shows savings, GICs and TFSA first, with the GIC early-cash-out restriction, and no investment funds.)*

### 5. From education to Tangerine (1:50–2:30)
**Screen:** the offerings card. Expand **Tangerine Investment Funds**.
**Say:** “Here’s the bank connection: verified Tangerine offerings with features, fees and risks, chosen from Alex’s goal *and* timeline. It isn’t a recommendation, and Sunny says they aren’t the only options. Opening a card is recorded as something Alex explored; just being shown isn’t.”
**Do:** click **Explore other topics** under the chat → **What’s the difference between a GIC and an investment fund?** “Alex can go anywhere, anytime, without losing their place.”

### 6. Alex chooses the next step (2:30–2:55)
**Do:** click **Learn about investment risk first**.
**Say:** “Alex decides; nothing is opened or moved. Sunny remembers the choice.” Click **See my summary** and scroll: “What prompted this, what Alex confirmed, the goal, what Sunny showed versus what Alex opened, and what’s still unknown.”

### 7. Follow-through on a simulated later visit (2:55–3:40)
**Do:** **Demo settings** → **Simulate a later visit (+30 days)**.
**Say:** “This is simulated time. A month later, Sunny doesn’t repeat the nudge. It picks up Alex’s own next step: *‘Last time, you wanted to understand investment risk before deciding what to do.’*”
**Do:** click **I did this**. “Sunny records it as done, without assuming anything else happened, and asks what’s next. It won’t prompt that step again.” Point out **Continue**, **Choose another next step**, **Remind me later**, **Change my goal** and **Stop these check-ins**.

**Close:** “That’s Sunny’s value inside Tangerine: account context with consent, a timely question, real education, product discovery shaped by the customer’s own goal and timeline, and follow-through they control. This is a concept prototype; a production version would still need the data, consent, compliance and engagement work in HANDOVER.md.”

---

**Backup paths (if asked):**
- **Scenario B (Priya):** say the money is for tuition. Sunny acknowledges it, keeps it separate, and won’t nudge again; learning and **Explore a different goal** never use that money.
- **Scenario C (Sam):** no qualifying signal and no nudge, but Sunny is available via **Ask Sunny**.
- **Advice boundary:** type “Should I invest the $15,000?”
- **Full catalogue:** **Explore other topics** → **Browse all Tangerine offerings**.
