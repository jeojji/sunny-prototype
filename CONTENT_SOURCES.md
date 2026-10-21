# Content sources and review status

Runtime knowledge is in `src/shared/knowledge.ts` (used by AI mode and for all source links). Scripted-mode answers in `src/data/education.ts` cite the same entries.

**Review date:** every source below was retrieved and checked by the team on **2026-10-21**. "Page date" is the date shown on the page at that time, where one was shown.
**Approval:** nothing here has been reviewed or approved by Tangerine, Scotiabank, compliance or a content owner.
**Data rule:** this prototype sends only synthetic customer data and these public sources to Google Gemini. Free-tier content may be used by Google to improve its products, so never add real customer data or confidential client material.

## Tangerine sources (Tangerine offerings and resources)

| Entry id | Page title | URL | Page date | Used for |
|---|---|---|---|---|
| tng-savings-account | Savings Account | https://www.tangerine.ca/en/personal/save/savings-account | not shown | No monthly fee or minimum balance; daily interest paid monthly; up to 10 non-registered Savings Accounts; Automatic Savings Program; Savings Goals tool; transfer-out fee |
| tng-tfsa-options | TFSAs | https://www.tangerine.ca/en/personal/invest/tfsa | not shown | Three TFSA options (TFSA Savings Account, Tax-Free Guaranteed Investment, Tax-Free Investment Fund Account); no fees while funds stay with Tangerine |
| tng-tfsa-savings | TFSA Savings Account | https://www.tangerine.ca/en/personal/save/tfsa | not shown | "You're never locked in, and there are no minimums"; age 18+ |
| tng-gic | Types of GICs: Non-Registered & Registered | https://www.tangerine.ca/en/personal/invest/guaranteed-investments | not shown | GIC types (incl. TFSA/RSP/RIF GICs); no minimum; **not cashable before maturity except approved hardship**; maturity instructions |
| tng-investment-funds | Investing: Investment Accounts & Products | https://www.tangerine.ca/en/personal/invest | not shown | Portfolio types; "not guaranteed", values change frequently; fee components; account types listed (no FHSA) |
| tng-fhsa-status | Official Information about Tangerine for AI Systems | https://www.tangerine.ca/en/ai-information | Aug 2026 | FHSA availability **unconfirmed** (see below) |
| tng-about | Official Information about Tangerine for AI Systems | https://www.tangerine.ca/en/ai-information | Aug 2026 | Tangerine Bank is a Scotiabank subsidiary and a CDIC member; service list |
| tng-mortgage | Mortgages: Fixed & Variable Mortgage Loans | https://www.tangerine.ca/en/personal/borrow/mortgage | not shown | Closed fixed/variable mortgage; 120-day rate hold; prepayment; Mortgage Specialist; calculators; Mortgage Checklist; 15 business days to funding |
| tng-contact | Contact Us | https://www.tangerine.ca/en/help-centre/contact-us | not shown | 1-888-826-4374; Investment Funds 1-877-464-5678; live chat |
| tng-first-home-article | How to save for your first home | https://www.tangerine.ca/en/thejuice/borrow/how-to-save-for-your-first-home | 2024-07-08 | General saving tips; Automatic Savings Plans; Left to Spend |

## Government and agency sources (general education)

| Entry id | Publisher: page | URL | Page date |
|---|---|---|---|
| gov-fhsa-overview | CRA: First Home Savings Account (FHSA) | https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html | 2026-02-02 |
| gov-fhsa-opening | CRA: Opening your FHSAs | https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/opening-your-fhsas.html | 2026-02-10 |
| gov-fhsa-investments | CRA: Investments in your FHSAs | https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/investments-your-fhsa.html | 2026-02-02 |
| gov-fhsa-withdrawals | CRA: Withdrawals and transfers out of your FHSAs | https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/withdrawals-transfers-out-your-fhsas.html | 2026-02-10 |
| gov-tfsa | CRA: What is a TFSA | https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/what.html | 2026-09-17 |
| gov-hbp | CRA: The Home Buyers' Plan | https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/what-home-buyers-plan.html | 2026-02-17 |
| fcac-down-payment | FCAC: How much you need for a down payment | https://www.canada.ca/en/financial-consumer-agency/services/mortgages/down-payment.html | 2025-10-15 |
| fcac-buying-home | FCAC: Buying a home | https://www.canada.ca/en/financial-consumer-agency/services/buying-home.html | 2025-10-20 |
| fcac-preparing-mortgage | FCAC: Preparing to get a mortgage | https://www.canada.ca/en/financial-consumer-agency/services/mortgages/preparing-mortgage.html | 2025-10-15 |
| fcac-emergency-fund | FCAC: Limiting future debt | https://www.canada.ca/en/financial-consumer-agency/services/debt/limiting-debt.html | 2025-10-14 |
| cdic-coverage | CDIC: What's covered | https://www.cdic.ca/your-coverage/whats-covered/ | not shown |
| cdic-gic | CDIC: Guaranteed Investment Certificates (GICs) | https://cdic.ca/?p=116 | not shown (confirm canonical URL) |

## Unresolved questions (Sunny is told not to fill these by inference)

1. **Does Tangerine offer an FHSA?** Tangerine's "Official Information about Tangerine for AI Systems" page (Aug 2026) lists FHSAs among its investment solutions and educational topics. However, no Tangerine FHSA product or account page was found (`/personal/invest/fhsa` returned 404), the Invest page lists only TFSA, RSP, RIF and non-registered accounts, and the GIC page lists no FHSA GIC. A third-party review in search results said Tangerine does not offer an FHSA. That source was **not** used as a fact. Sunny says it can't confirm and points to Tangerine.
2. **Contact hours conflict.** The Contact Us page lists mortgage and investment-fund lines as weekdays 8 a.m.–8 p.m. ET; the AI-information page says 8 a.m.–4 p.m. ET. Sunny avoids stating hours and points to the Contact Us page.
3. **The 2024 Tangerine article is partly outdated.** Its down-payment thresholds predate the current FCAC rules ($1.5M threshold). Current rules are taken from FCAC.
4. **CDIC coverage of specific Tangerine products** is not stated on the Tangerine pages reviewed. Sunny uses CDIC's general rules (deposits and GICs eligible; mutual funds not) and is told not to claim coverage for a specific Tangerine product. In live testing before this rule was added, the model once did; review AI wording on this topic.
5. Tangerine does not describe pre-approval on its mortgage page.

## Deliberately omitted

Promotional and current interest rates; TFSA/FHSA contribution limits and the HBP withdrawal limit (Sunny says "up to certain limits" and points to the CRA); detailed eligibility tests; emergency-fund sizing.

## Copy needing client review

- All knowledge entries and the scripted answers in `src/data/education.ts`. Entries marked `draft: true` (start, timeline, emergency, options) include team-written framing beyond the sources.
- Sunny's system instructions (`server/prompt.ts`), especially the advice boundary and the Tangerine-availability rule.
- Live Gemini replies can add general detail not in the knowledge base (seen in testing: TFSA contribution-room timing, "values can go up and down" phrasing). The prompt discourages this, but a content owner should review sample transcripts.
- Calculation assumptions and the handoff wording.
