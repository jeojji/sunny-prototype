/**
 * Curated knowledge base for Sunny. Used at runtime by the server (to ground
 * model answers) and the client (to render validated source links).
 *
 * Every entry was retrieved and checked by the team on REVIEW_DATE. No live
 * web fetching happens during a conversation. Nothing here has been reviewed
 * or approved by Tangerine; see CONTENT_SOURCES.md.
 */

export const REVIEW_DATE = '2026-10-21';
/** Wealth-use-case sources added and checked on this date. */
export const REVIEW_DATE_WEALTH = '2026-10-24';

export interface KnowledgeEntry {
  id: string;
  topic: string;
  /** Plain-language factual content, paraphrased from the source. */
  content: string;
  publisher: string;
  pageTitle: string;
  url: string;
  /** Date the team actually retrieved and checked the page. */
  reviewed: string;
  /** 'tangerine' = describes a Tangerine offering/resource; 'general' = general education. */
  kind: 'tangerine' | 'general';
  conditions: string[];
  /** What the source does not answer. Sunny must not fill these gaps by inference. */
  openQuestions: string[];
  keywords: string[];
}

const T = 'Tangerine';
const CRA = 'Canada Revenue Agency';
const FCAC = 'Financial Consumer Agency of Canada';
const CDIC = 'Canada Deposit Insurance Corporation';

export const KNOWLEDGE: KnowledgeEntry[] = [
  // ---------------------------------------------------------------- general
  {
    id: 'gov-fhsa-overview',
    topic: 'What an FHSA is',
    content:
      'A First Home Savings Account (FHSA) is a registered plan that lets first-time home buyers save toward a qualifying first home with tax advantages, up to certain limits. Contributions are generally tax-deductible, and qualifying withdrawals to buy or build a qualifying first home are tax-free.',
    publisher: CRA,
    pageTitle: 'First Home Savings Account (FHSA)',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['Contribution limits and other CRA rules apply.', 'Some investments held in an FHSA can trigger taxes.'],
    openQuestions: ['Which financial institutions offer an FHSA is not covered by this source.'],
    keywords: ['fhsa', 'first home savings account', 'tax', 'deductible', 'registered', 'first home'],
  },
  {
    id: 'gov-fhsa-opening',
    topic: 'Who can open an FHSA',
    content:
      'To open an FHSA you must be a resident of Canada, at least 18 (19 where that is the age of majority) and 71 or younger as of December 31 of the year you open it, and a first-time home buyer: in the current year or the previous four calendar years you must not have lived in a qualifying home you owned (alone or jointly) as your principal residence. Similar conditions apply to a spouse or common-law partner.',
    publisher: CRA,
    pageTitle: 'Opening your FHSAs',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/opening-your-fhsas.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['All conditions must be met when the account is opened.'],
    openQuestions: ['Sunny cannot confirm whether a particular customer is eligible.'],
    keywords: ['eligible', 'eligibility', 'open', 'first-time', 'qualify', 'age', 'resident', 'fhsa'],
  },
  {
    id: 'gov-fhsa-investments',
    topic: 'What an FHSA can hold (account vs. holdings)',
    content:
      'An FHSA is an account with special tax treatment, not an investment itself. It can hold qualified investments such as cash, guaranteed investment certificates (GICs), mutual funds, most securities listed on a designated stock exchange, and government savings bonds. The issuer of the account may limit which of these it offers.',
    publisher: CRA,
    pageTitle: 'Investments in your FHSAs',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/investments-your-fhsa.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['Risk depends on what is held inside the account, not on the account type.'],
    openQuestions: ['Which holdings a specific institution offers inside an FHSA.'],
    keywords: ['investment', 'hold', 'gic', 'cash', 'mutual fund', 'stocks', 'is an fhsa an investment', 'inside', 'lose'],
  },
  {
    id: 'gov-fhsa-withdrawals',
    topic: 'Taking money out of an FHSA',
    content:
      'A qualifying withdrawal used to buy or build a qualifying home is not taxed if all conditions are met, such as having a written agreement to buy or build, being a Canadian resident, and intending to live in the home as your principal residence. Other withdrawals are generally added to your income and taxed. The account holder is responsible for making sure the conditions are met.',
    publisher: CRA,
    pageTitle: 'Withdrawals and transfers out of your FHSAs',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/withdrawals-transfers-out-your-fhsas.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['A form must be submitted to the FHSA issuer for a qualifying withdrawal.'],
    openQuestions: ['Processing times or withdrawal mechanics at any specific institution.'],
    keywords: ['withdraw', 'withdrawal', 'take money out', 'access', 'taxable', 'qualifying'],
  },
  {
    id: 'gov-tfsa',
    topic: 'What a TFSA is',
    content:
      'A Tax-Free Savings Account (TFSA) is a registered account that can hold cash savings or investments. Contributions are not tax-deductible, but income earned inside it (interest, dividends, capital gains) is generally tax-free, including when withdrawn. You can withdraw at any time, for any reason, and withdrawals affect contribution room.',
    publisher: CRA,
    pageTitle: 'What is a TFSA',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/what.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['Contribution room rules apply; over-contributing has tax consequences.'],
    openQuestions: [],
    keywords: ['tfsa', 'tax-free savings account', 'tax free', 'flexible', 'withdraw', 'difference'],
  },
  {
    id: 'gov-hbp',
    topic: "Home Buyers' Plan (RRSP)",
    content:
      "The Home Buyers' Plan (HBP) lets you withdraw money from your RRSPs to buy or build a qualifying home, up to a set limit. The amount withdrawn must be repaid to your RRSPs over a 15-year period. You can also make a qualifying FHSA withdrawal for the same home if you meet the conditions for both.",
    publisher: CRA,
    pageTitle: "The Home Buyers' Plan",
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/what-home-buyers-plan.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['Repayment rules apply; temporary relief changes when repayment starts for some withdrawals.'],
    openQuestions: ['Current withdrawal limit should be checked on the CRA page.'],
    keywords: ['hbp', 'home buyers plan', 'rrsp', 'rsp', 'retirement'],
  },
  {
    id: 'fcac-down-payment',
    topic: 'Minimum down payment',
    content:
      'In Canada the minimum down payment depends on the purchase price: 5% of a price up to $500,000; for $500,000 to $1.5 million, 5% of the first $500,000 plus 10% of the portion above; 20% at $1.5 million or more. With less than 20% down you typically need mortgage loan insurance, which protects the lender. The minimum down payment normally must come from your own funds.',
    publisher: FCAC,
    pageTitle: 'How much you need for a down payment',
    url: 'https://www.canada.ca/en/financial-consumer-agency/services/mortgages/down-payment.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['These are minimums, not a recommendation; closing costs are extra.', 'Rules can change; check the FCAC page.'],
    openQuestions: ['What a specific customer can afford or qualify for.'],
    keywords: ['down payment', 'how much', 'need', 'minimum', 'mortgage insurance', '20%', 'target'],
  },
  {
    id: 'fcac-buying-home',
    topic: 'Saving for a home: keep it safe and accessible',
    content:
      'For a home purchase, the FCAC suggests making saving part of your budget, for example with automatic transfers each pay period, and keeping the money you save protected and easily accessible. It lists savings accounts, GICs and low-risk mutual funds as short-term options, and notes closing costs of roughly 1.5% to 4% of the purchase price on top of the down payment.',
    publisher: FCAC,
    pageTitle: 'Buying a home',
    url: 'https://www.canada.ca/en/financial-consumer-agency/services/buying-home.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['General guidance, not a recommendation for an individual.'],
    openQuestions: [],
    keywords: ['timeline', 'short-term', 'accessible', 'closing costs', 'automatic', 'budget', 'start', 'where to start'],
  },
  {
    id: 'fcac-preparing-mortgage',
    topic: 'Preparing to talk to a lender',
    content:
      'Lenders generally review your income, expenses, debts, credit report and score, the amount you want to borrow and the amortization period. FCAC suggests ordering your credit report before shopping for a mortgage and checking it for errors, and getting preapproved before house hunting.',
    publisher: FCAC,
    pageTitle: 'Preparing to get a mortgage',
    url: 'https://www.canada.ca/en/financial-consumer-agency/services/mortgages/preparing-mortgage.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['Lenders apply qualification tests; Sunny does not assess mortgage affordability.'],
    openQuestions: [],
    keywords: ['mortgage', 'lender', 'prepare', 'credit', 'preapproval', 'documents', 'affordability'],
  },
  {
    id: 'fcac-emergency-fund',
    topic: 'Emergency savings',
    content:
      'An emergency fund is money set aside for unexpected expenses such as car or home repairs, job loss or a health problem that stops you from working. Having one can help you avoid going into debt when something unexpected happens.',
    publisher: FCAC,
    pageTitle: 'Limiting future debt',
    url: 'https://www.canada.ca/en/financial-consumer-agency/services/debt/limiting-debt.html',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['How much to keep aside is the customer’s decision.'],
    openQuestions: ['The source does not explain keeping emergency money in a separate account.'],
    keywords: ['emergency', 'emergencies', 'unexpected', 'reserve', 'rainy day'],
  },
  {
    id: 'cdic-coverage',
    topic: 'Deposit insurance: what is and isn’t covered',
    content:
      'CDIC insures eligible deposits at member institutions, including savings deposits and GICs, up to $100,000 (principal and interest) per insured category. TFSA deposits and FHSA deposits are separate categories. Mutual funds, stocks, bonds and ETFs are not covered by CDIC.',
    publisher: CDIC,
    pageTitle: 'What’s covered',
    url: 'https://www.cdic.ca/your-coverage/whats-covered/',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['Coverage applies only at CDIC member institutions and to eligible deposits.'],
    openQuestions: ['Whether a specific Tangerine product is an eligible deposit is not stated on the Tangerine pages reviewed; describe the general CDIC rule and suggest confirming with Tangerine or CDIC.'],
    keywords: ['lose money', 'safe', 'risk', 'insured', 'cdic', 'protected', 'guaranteed', 'mutual fund'],
  },
  {
    id: 'cdic-gic',
    topic: 'What a GIC is',
    content:
      'A guaranteed investment certificate (GIC) is a type of secured investment: you lend money to the issuing institution for a set term in exchange for return of your principal and the potential to earn interest.',
    publisher: CDIC,
    pageTitle: 'Guaranteed Investment Certificates (GICs)',
    url: 'https://cdic.ca/?p=116',
    reviewed: REVIEW_DATE,
    kind: 'general',
    conditions: ['Terms and redemption rules vary by issuer and product.'],
    openQuestions: [],
    keywords: ['gic', 'guaranteed investment certificate', 'term', 'term deposit'],
  },

  {
    id: 'fcac-goals',
    topic: 'Saving vs investing, time horizon and risk',
    content:
      'The FCAC explains that saving and investing can both help reach goals. It describes short-term goals as 2 years or less and long-term goals as 6 years or more, and notes that many investments offer the potential for a higher return but involve some risk, which may be more acceptable for longer-term goals because there is more time to recover from losses. Risk tolerance depends on your emotional willingness to accept risk and your financial ability to absorb loss. One risk is that investments may not keep up with inflation. The FCAC also notes you’re generally better off paying down debt first, because debt interest is usually more than you can earn by investing.',
    publisher: FCAC,
    pageTitle: 'Setting savings and investment goals',
    url: 'https://www.canada.ca/en/financial-consumer-agency/services/savings-investments/savings-investment-goals.html',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'general',
    conditions: ['General guidance, not a recommendation for an individual.'],
    openQuestions: [],
    keywords: ['saving', 'investing', 'risk', 'return', 'time horizon', 'horizon', 'next year', 'long term', 'short term', 'lose money', 'debt', 'inflation', 'risk tolerance', 'build wealth'],
  },
  {
    id: 'fcac-investing-basics',
    topic: 'Before investing: factors and costs',
    content:
      'The FCAC suggests considering your financial situation, goals, investment time horizon and risk tolerance before investing. It explains that investment costs can come from buying, selling and managing an investment, and that costs reduce your return.',
    publisher: FCAC,
    pageTitle: 'Basics of investing',
    url: 'https://www.canada.ca/en/financial-consumer-agency/services/savings-investments/investing-basics.html',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'general',
    conditions: [],
    openQuestions: [],
    keywords: ['fees', 'costs', 'before investing', 'how investing works', 'factors', 'not ready', 'decide'],
  },
  {
    id: 'fcac-gic-rights',
    topic: 'GICs: rights and early cash-out',
    content:
      'The FCAC explains that with a GIC or term deposit you get back the amount you invest at the end of the term. Before you buy, institutions must tell you whether you can cash it in before the end date and how that affects interest, and whether CDIC insures the product.',
    publisher: FCAC,
    pageTitle: 'Guaranteed investment certificates and term deposits: know your rights',
    url: 'https://www.canada.ca/en/financial-consumer-agency/services/rights-responsibilities/rights-investing/rights-guaranteed-investment-certificates.html',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'general',
    conditions: [],
    openQuestions: [],
    keywords: ['gic', 'term', 'cash in', 'early', 'principal', 'need the money', 'next year'],
  },
  {
    id: 'gov-rrsp',
    topic: 'What an RRSP is',
    content:
      'An RRSP is a registered retirement savings plan you set up. Contributions can reduce your taxable income, income earned in the plan is usually exempt from tax while it stays in the plan, and withdrawals are generally taxable when received.',
    publisher: CRA,
    pageTitle: 'Registered Retirement Savings Plan (RRSP)',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/registered-retirement-savings-plan-rrsp.html',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'general',
    conditions: ['Contribution limits and rules apply.'],
    openQuestions: ['The page does not list what investments an RRSP can hold.'],
    keywords: ['rrsp', 'rsp', 'retirement', 'tax deductible', 'difference', 'tfsa vs rrsp'],
  },

  // -------------------------------------------------------------- Tangerine
  {
    id: 'tng-savings-account',
    topic: 'Tangerine Savings Account',
    content:
      'The Tangerine Savings Account has no monthly fee and no minimum balance. Interest is calculated daily and paid monthly, and rates can change. Clients can hold up to 10 non-registered Savings Accounts (for example, one per goal), set up an Automatic Savings Program that can be changed, skipped or cancelled at any time, and use a Savings Goals tool to estimate when a goal could be reached.',
    publisher: T,
    pageTitle: 'Savings Account',
    url: 'https://www.tangerine.ca/en/personal/save/savings-account',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['A fee applies to transfers to another financial institution (see Tangerine’s fee schedule).', 'Opening an interest-earning account online requires a SIN.'],
    openQuestions: ['Current interest rates (intentionally not stored; promotional rates change).'],
    keywords: ['tangerine', 'savings account', 'automatic savings', 'savings goals', 'separate', 'no fee', 'help'],
  },
  {
    id: 'tng-tfsa-options',
    topic: 'TFSA options at Tangerine',
    content:
      'Tangerine offers three ways to hold a TFSA: a TFSA Savings Account (tax-free interest with the features of a Tangerine Savings Account), a Tax-Free Guaranteed Investment (a GIC held in a TFSA), and a Tax-Free Investment Fund Account (Tangerine investment funds held in a TFSA). Registered accounts have no fees while funds stay with Tangerine.',
    publisher: T,
    pageTitle: 'TFSAs',
    url: 'https://www.tangerine.ca/en/personal/invest/tfsa',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['A fee applies when transferring funds to another financial institution.', 'Clients are responsible for confirming their own contribution limits.'],
    openQuestions: ['The page does not state CDIC coverage for each TFSA option; investment funds are not CDIC-insured per CDIC.'],
    keywords: ['tangerine', 'tfsa', 'tax-free', 'investment fund', 'gic', 'options', 'offer'],
  },
  {
    id: 'tng-tfsa-savings',
    topic: 'Tangerine TFSA Savings Account access',
    content:
      'Tangerine’s TFSA Savings Account has no monthly fee and no minimum balance, and money can be accessed at any time: Tangerine says “You’re never locked in, and there are no minimums.” Interest and withdrawals are not taxed as long as contributions stay within CRA limits.',
    publisher: T,
    pageTitle: 'TFSA Savings Account',
    url: 'https://www.tangerine.ca/en/personal/save/tfsa',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['Open to individuals 18 and older.', 'A fee applies to transfers out to another institution.'],
    openQuestions: ['Promotional rates shown on the page were deliberately not recorded.'],
    keywords: ['tangerine', 'tfsa', 'withdraw', 'access', 'locked in', 'whenever', 'take money out'],
  },
  {
    id: 'tng-gic',
    topic: 'Tangerine GICs',
    content:
      'Tangerine offers non-registered GICs (including US-dollar GICs) and registered GICs held in a TFSA, RSP or RIF. Terms range from short terms (such as 90 days) to multiple years, and there is no minimum balance to open one. Tangerine GICs are not cashable before maturity, except where an application for early redemption due to financial hardship has been approved. At maturity, the GIC follows the instruction you set (renew, reinvest or pay out), which can be changed during the term.',
    publisher: T,
    pageTitle: 'Types of GICs: Non-Registered & Registered',
    url: 'https://www.tangerine.ca/en/personal/invest/guaranteed-investments',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['Money in a Tangerine GIC is locked in until maturity, apart from approved hardship redemptions.'],
    openQuestions: ['An FHSA GIC is not listed on this page.', 'Current GIC rates were deliberately not recorded.'],
    keywords: ['tangerine', 'gic', 'guaranteed', 'cashable', 'redeem', 'maturity', 'term', 'locked', 'take money out'],
  },
  {
    id: 'tng-investment-funds',
    topic: 'Tangerine Investment Funds (portfolios)',
    content:
      'Tangerine offers mutual-fund portfolios: Core Portfolios, Global ETF Portfolios (a mutual fund holding a selection of ETFs), Socially Responsible Global Portfolios, and a Money Market Fund described as a stable short-term option. The portfolios hold stocks, bonds or cash equivalents in different mixes. Tangerine states annual management fees of 0.80% (Core), 0.50% (Global ETF) and 0.55% (Socially Responsible), plus a fixed administration fee of 0.15% of each portfolio’s value and other fund expenses. They can be held in a TFSA, RSP, RIF or non-registered account.',
    publisher: T,
    pageTitle: 'Mutual Fund Investments in Canada',
    url: 'https://www.tangerine.ca/en/personal/invest/mutual-funds',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'tangerine',
    conditions: [
      'Mutual funds are not guaranteed or insured by CDIC, and their values change frequently.',
      'All securities, including mutual funds, carry a risk of loss of capital; diversification does not eliminate it.',
      'Read the prospectus before investing. Tangerine Investment Funds Limited is the principal distributor.',
    ],
    openQuestions: ['Minimum investment amounts and total MER figures are not stated on this page.', 'Whether any portfolio suits a particular customer (Sunny cannot determine suitability).'],
    keywords: ['tangerine', 'invest', 'investment', 'investing', 'mutual fund', 'fund', 'portfolio', 'etf', 'lose money', 'risk', 'fees', 'management fee', 'build wealth', 'grow'],
  },
  {
    id: 'tng-rsp-options',
    topic: 'RSP options at Tangerine',
    content:
      'Tangerine offers an RSP Savings Account, an RSP Guaranteed Investment (GIC) and an RSP Investment Fund Account. Tangerine states that RSP contributions are tax deductible, and that withdrawals are taxable income with tax withheld. Registered accounts have no fees while funds stay with Tangerine.',
    publisher: T,
    pageTitle: 'RSPs',
    url: 'https://www.tangerine.ca/en/personal/invest/rsp',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'tangerine',
    conditions: ['Transferring an RSP to another institution has a $50 fee.', 'Contribution limits apply; customers confirm their own room with the CRA.'],
    openQuestions: ['Minimum contributions are not stated on the page.'],
    keywords: ['rsp', 'rrsp', 'retirement', 'tax deductible', 'tangerine', 'options', 'registered'],
  },
  {
    id: 'tng-advisors',
    topic: 'Tangerine Advisors',
    content:
      'Tangerine describes advisors who offer phone or video consultations, including a no-obligation investment consultation and financial-planning conversations, which can be booked online. Tangerine states its advisors don’t receive commissions based on the portfolio a client chooses or how much they invest.',
    publisher: T,
    pageTitle: 'Tangerine Advisors | Personalized Investment Advice & Guidance',
    url: 'https://www.tangerine.ca/en/personal/invest/advisors',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'tangerine',
    conditions: ['Booking in this prototype is not real; nothing is scheduled or sent.'],
    openQuestions: ['Advice fees, minimums or eligibility for the advisory service are not stated on the page.'],
    keywords: ['advisor', 'adviser', 'advice', 'person', 'human', 'talk to', 'consultation', 'book', 'planning', 'help me decide'],
  },
  {
    id: 'tng-saving-vs-investing',
    topic: 'Saving vs investing (Tangerine article)',
    content:
      'Tangerine’s article “What’s the difference between saving and investing?” (Nov 22, 2023) explains that savings accounts aim to pay interest with little to no risk of losing money and keep funds easy to access, while investments carry varying levels of risk in pursuit of higher potential returns and suit longer timeframes. It notes savings interest may not keep up with rising costs, investing fees are generally higher and returns aren’t guaranteed, and that the two can work together.',
    publisher: T,
    pageTitle: 'What’s the difference between saving and investing?',
    url: 'https://www.tangerine.ca/en/thejuice/invest/whats-the-difference-between-saving-and-investing',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'tangerine',
    conditions: ['Educational article, not advice; published in 2023.'],
    openQuestions: [],
    keywords: ['saving', 'investing', 'difference', 'build wealth', 'grow', 'risk', 'return', 'how investing works', 'start'],
  },
  {
    id: 'tng-beginners-guide',
    topic: 'Accounts vs. investment products (Tangerine article)',
    content:
      'Tangerine’s “A beginner’s guide to investing” (Jan 10, 2024) describes accounts such as a TFSA or RRSP as the container, and GICs, bonds, stocks, mutual funds and ETFs as the products that go inside. It notes GICs are a low-risk tool, mutual funds and ETFs carry a risk of loss, and fund fees vary.',
    publisher: T,
    pageTitle: 'A beginner’s guide to investing',
    url: 'https://www.tangerine.ca/en/thejuice/invest/a-beginners-guide-to-investing',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'tangerine',
    conditions: ['Educational article, not advice.'],
    openQuestions: [],
    keywords: ['container', 'account', 'is a tfsa an investment', 'inside', 'holdings', 'products', 'beginner', 'how investing works'],
  },
  {
    id: 'tng-chequing-vs-savings',
    topic: 'Chequing vs savings (Tangerine article)',
    content:
      'Tangerine’s article “Chequing vs. savings accounts” (June 20, 2024) describes chequing accounts as typically used for day-to-day banking, with low or no interest, and savings accounts as a place to set money aside for emergencies or a future purpose, generally with higher interest than chequing.',
    publisher: T,
    pageTitle: 'Chequing vs. savings accounts: your questions answered',
    url: 'https://www.tangerine.ca/en/thejuice/save/chequing-vs-savings-accounts-your-questions-answered',
    reviewed: REVIEW_DATE_WEALTH,
    kind: 'tangerine',
    conditions: ['Educational article; current account rates were deliberately not recorded.'],
    openQuestions: [],
    keywords: ['chequing', 'leave it in chequing', 'why not leave', 'savings account', 'interest', 'everyday'],
  },
  {
    id: 'tng-fhsa-status',
    topic: 'FHSA availability at Tangerine (unconfirmed)',
    content:
      'We could not confirm that Tangerine currently offers an FHSA. Tangerine’s “Official Information about Tangerine for AI Systems” page (last updated August 2026) lists FHSAs among its investment solutions and educational topics, but no Tangerine FHSA product or account page was found, and Tangerine’s Invest and GIC pages do not list an FHSA option. Customers should confirm directly with Tangerine.',
    publisher: T,
    pageTitle: 'Official Information about Tangerine for AI Systems',
    url: 'https://www.tangerine.ca/en/ai-information',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['Treat FHSA availability at Tangerine as unconfirmed.'],
    openQuestions: ['Does Tangerine offer an FHSA today, and with which holdings (savings, GICs, funds)?'],
    keywords: ['tangerine', 'fhsa', 'offer', 'does tangerine', 'available', 'open'],
  },
  {
    id: 'tng-mortgage',
    topic: 'Tangerine mortgages and tools',
    content:
      'Tangerine offers a closed mortgage with fixed or variable rates, a rate hold of up to 120 days before closing, prepayment options, portability, and a dedicated Mortgage Specialist after you apply. Its website has a Mortgage Affordability Calculator, Mortgage Payment Calculator, Rent vs Buy Calculator and a Mortgage Checklist. Tangerine says to allow at least 15 business days from submission to funding.',
    publisher: T,
    pageTitle: 'Mortgages: Fixed & Variable Mortgage Loans',
    url: 'https://www.tangerine.ca/en/personal/borrow/mortgage',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['Approval is subject to Tangerine’s review; Sunny cannot assess qualification.'],
    openQuestions: ['Pre-approval is not described on this page.', 'There is no dedicated first-time buyer section on this page.'],
    keywords: ['tangerine', 'mortgage', 'calculator', 'affordability', 'specialist', 'checklist', 'rate hold', 'help'],
  },
  {
    id: 'tng-contact',
    topic: 'Contacting Tangerine',
    content:
      'Tangerine’s Contact Us page lists phone support at 1-888-826-4374 (everyday banking 24/7; mortgage line on weekdays), a separate Investment Funds line at 1-877-464-5678, and live chat for saving, chequing and investing during set hours.',
    publisher: T,
    pageTitle: 'Contact Us',
    url: 'https://www.tangerine.ca/en/help-centre/contact-us',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['Hours vary by line and on holidays; check the page for current hours.'],
    openQuestions: ['Tangerine’s AI-information page lists shorter mortgage and investment-fund hours than the Contact Us page; the hours conflict was not resolved.'],
    keywords: ['contact', 'phone', 'call', 'chat', 'talk to', 'human', 'person', 'support', 'help'],
  },
  {
    id: 'tng-first-home-article',
    topic: 'Tangerine article: saving for a first home',
    content:
      'Tangerine’s article “How to save for your first home” (July 8, 2024) suggests setting milestone goals, budgeting savings as its own line item, paying down high-interest debt, earning interest through options such as high-interest savings or GICs matched to risk tolerance, and automating transfers. It mentions Tangerine tools such as Automatic Savings Plans and the Left to Spend tool for Chequing.',
    publisher: T,
    pageTitle: 'How to save for your first home',
    url: 'https://www.tangerine.ca/en/thejuice/borrow/how-to-save-for-your-first-home',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: ['Published in 2024: some figures in the article (for example down-payment thresholds) have since changed; use FCAC/CRA for current rules.'],
    openQuestions: ['The article does not say whether Tangerine offers an FHSA.'],
    keywords: ['tangerine', 'start', 'where to start', 'tips', 'budget', 'automate', 'first home', 'help'],
  },
  {
    id: 'tng-about',
    topic: 'About Tangerine',
    content:
      'Tangerine is a trade name of Tangerine Bank, a wholly owned subsidiary of The Bank of Nova Scotia (Scotiabank) and a CDIC member in its own right. Tangerine lists savings accounts, GICs, registered accounts (such as TFSAs and RRSPs), mutual funds and investment portfolios, and mortgages among its services.',
    publisher: T,
    pageTitle: 'Official Information about Tangerine for AI Systems',
    url: 'https://www.tangerine.ca/en/ai-information',
    reviewed: REVIEW_DATE,
    kind: 'tangerine',
    conditions: [],
    openQuestions: [],
    keywords: ['tangerine', 'scotiabank', 'cdic', 'about', 'what can tangerine', 'offer'],
  },
];

const BY_ID = new Map(KNOWLEDGE.map((e) => [e.id, e]));

export function getEntry(id: string): KnowledgeEntry | undefined {
  return BY_ID.get(id);
}

/** Keep only ids that exist in the knowledge base, de-duplicated, in order. */
export function validateSourceIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const id of ids) if (typeof id === 'string' && BY_ID.has(id) && !out.includes(id)) out.push(id);
  return out.slice(0, 4);
}

/** Simple keyword retrieval: score entries by keyword and topic-word overlap with the query. */
export function retrieve(query: string, k = 6, always: string[] = []): KnowledgeEntry[] {
  const q = ` ${query.toLowerCase().replace(/[^a-z0-9%$ ]+/g, ' ')} `;
  const scored = KNOWLEDGE.map((e) => {
    let score = 0;
    for (const kw of e.keywords) if (q.includes(` ${kw}`) || q.includes(kw)) score += kw.includes(' ') ? 3 : 2;
    for (const w of e.topic.toLowerCase().split(/\W+/)) if (w.length > 3 && q.includes(` ${w}`)) score += 1;
    if (always.includes(e.id)) score += 100;
    return { e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.e);
}
