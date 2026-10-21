/**
 * Scripted-mode educational answers. Each is grounded in knowledge-base
 * entries (src/shared/knowledge.ts) via `sources`. AI mode uses the knowledge
 * base directly. Review status: CONTENT_SOURCES.md.
 */

export type TopicId =
  | 'start'
  | 'accounts'
  | 'tangerine'
  | 'fhsa'
  | 'fhsaInvestment'
  | 'fhsaTangerine'
  | 'tfsa'
  | 'gic'
  | 'risk'
  | 'access'
  | 'downPayment'
  | 'timeline'
  | 'emergency'
  | 'prepare'
  | 'options'
  | 'contact';

export interface TopicContent {
  id: TopicId;
  /** Customer-facing phrasing used on suggestion chips. */
  question: string;
  title: string;
  /** Default answer: 2–5 sentences. */
  body: string[];
  points?: string[];
  /** Plainer version for "explain that more simply". */
  simple: string;
  /** Knowledge-base entry ids. */
  sources: string[];
  /** Natural follow-ups to suggest next. */
  related: TopicId[];
  /** True when some wording is team-drafted beyond what sources state. */
  draft: boolean;
}

export const TOPICS: Record<TopicId, TopicContent> = {
  start: {
    id: 'start',
    question: 'I don’t know where to start.',
    title: 'A simple place to start',
    body: [
      'That’s a very common starting point. Most people work through three questions: roughly when they’d like to buy, how much they want to have saved, and where to keep that money in the meantime.',
      'None of these need exact answers today. It often helps to learn how home-saving accounts work first, then decide whether to explore numbers.',
    ],
    simple: 'Start small: when might you buy, about how much would you like saved, and where will you keep it? You can figure these out one at a time.',
    sources: ['fcac-buying-home', 'fcac-down-payment'],
    related: ['accounts', 'downPayment', 'tangerine'],
    draft: true,
  },
  accounts: {
    id: 'accounts',
    question: 'Explain home-saving accounts.',
    title: 'Accounts people use to save for a home',
    body: [
      'In Canada, the main registered options are the First Home Savings Account (FHSA), the Tax-Free Savings Account (TFSA) and, through the Home Buyers’ Plan, an RRSP. Each has different tax treatment and rules.',
    ],
    points: [
      'FHSA: built for a first home; contributions are generally deductible and qualifying withdrawals are tax-free.',
      'TFSA: flexible; contributions aren’t deductible, but growth is generally tax-free and you can withdraw any time.',
      'Home Buyers’ Plan: borrow from your RRSP for a qualifying home, then repay it over 15 years.',
    ],
    simple: 'Think of these as containers with different tax rules. The FHSA is made for a first home, a TFSA is flexible for any goal, and the Home Buyers’ Plan lets you borrow from retirement savings.',
    sources: ['gov-fhsa-overview', 'gov-tfsa', 'gov-hbp'],
    related: ['fhsaInvestment', 'tfsa', 'fhsaTangerine'],
    draft: false,
  },
  tangerine: {
    id: 'tangerine',
    question: 'What can Tangerine help me with?',
    title: 'Tangerine offerings related to saving for a home',
    body: ['Here’s what I could verify on Tangerine’s website that relates to saving for a first home:'],
    points: [
      'Savings Account: no monthly fee or minimum balance; up to 10 accounts for separate goals, an Automatic Savings Program and a Savings Goals tool.',
      'TFSA options: a TFSA Savings Account, Tax-Free GICs, or Tangerine investment funds held in a TFSA.',
      'GICs: various terms; not cashable before maturity except approved hardship cases.',
      'Mortgages, plus affordability, payment and rent-vs-buy calculators and a mortgage checklist.',
      'I couldn’t confirm whether Tangerine currently offers an FHSA.',
    ],
    simple: 'Tangerine has savings accounts you can set up for a goal, TFSAs, GICs and mortgages. I couldn’t confirm an FHSA at Tangerine, so that’s worth asking them directly.',
    sources: ['tng-savings-account', 'tng-tfsa-options', 'tng-gic', 'tng-mortgage'],
    related: ['fhsaTangerine', 'access', 'contact'],
    draft: false,
  },
  fhsa: {
    id: 'fhsa',
    question: 'What is an FHSA?',
    title: 'First Home Savings Account (FHSA)',
    body: [
      'An FHSA is a registered account from the Government of Canada for first-time home buyers. Contributions are generally tax-deductible, and qualifying withdrawals to buy or build a first home are tax-free, up to certain limits.',
      'To open one, you generally need to be a Canadian resident, an adult and a first-time home buyer under CRA’s definition.',
    ],
    simple: 'An FHSA is a savings account with tax perks, made for buying your first home. Money you put in can lower your taxes, and you don’t pay tax when you take it out to buy your home.',
    sources: ['gov-fhsa-overview', 'gov-fhsa-opening'],
    related: ['fhsaInvestment', 'fhsaTangerine', 'tfsa'],
    draft: false,
  },
  fhsaInvestment: {
    id: 'fhsaInvestment',
    question: 'Is an FHSA an investment?',
    title: 'The account vs. what’s inside it',
    body: [
      'Not by itself. An FHSA is an account with special tax treatment; what you hold inside it can be cash, GICs, mutual funds or listed securities, depending on what the institution offers.',
      'Whether you could lose money depends on those holdings, not on the FHSA label.',
    ],
    simple: 'An FHSA is like a box with tax benefits. What you put in the box (cash, a GIC or investments) decides how safe or risky it is.',
    sources: ['gov-fhsa-investments'],
    related: ['risk', 'access', 'fhsaTangerine'],
    draft: false,
  },
  fhsaTangerine: {
    id: 'fhsaTangerine',
    question: 'Does Tangerine offer an FHSA?',
    title: 'FHSA at Tangerine',
    body: [
      'I can’t confirm that. Tangerine’s information page for AI systems lists FHSAs among its investment solutions, but I couldn’t find a Tangerine FHSA product page, and its Invest and GIC pages don’t list one.',
      'The best way to know for sure is to ask Tangerine directly.',
    ],
    simple: 'I’m not sure, and I don’t want to guess. Tangerine can tell you directly.',
    sources: ['tng-fhsa-status', 'tng-contact'],
    related: ['contact', 'tangerine', 'tfsa'],
    draft: false,
  },
  tfsa: {
    id: 'tfsa',
    question: 'How is a TFSA different?',
    title: 'TFSA compared with an FHSA',
    body: [
      'A TFSA can hold savings or investments. Contributions aren’t tax-deductible, but growth is generally tax-free, and you can withdraw at any time for any reason.',
      'An FHSA is purpose-built for a first home with deductible contributions, but tax-free withdrawals require meeting home-purchase conditions. At Tangerine, a TFSA can hold savings, GICs or investment funds.',
    ],
    simple: 'A TFSA is flexible: use it for anything, take money out whenever. An FHSA gives a bigger tax break but is meant only for buying your first home.',
    sources: ['gov-tfsa', 'gov-fhsa-overview', 'tng-tfsa-options'],
    related: ['access', 'gic', 'fhsaTangerine'],
    draft: false,
  },
  gic: {
    id: 'gic',
    question: 'What does a GIC mean?',
    title: 'Guaranteed Investment Certificate (GIC)',
    body: [
      'A GIC is a secured investment: you lend money to the institution for a set term and get your principal back plus potential interest.',
      'At Tangerine, GICs aren’t cashable before maturity except where an early redemption for financial hardship is approved, so the term matters if you might need the money sooner.',
    ],
    simple: 'A GIC means you agree to leave money in place for a set time, and you get it back with interest. At Tangerine you generally can’t take it out early.',
    sources: ['cdic-gic', 'tng-gic', 'cdic-coverage'],
    related: ['access', 'timeline', 'risk'],
    draft: false,
  },
  risk: {
    id: 'risk',
    question: 'Can I lose money?',
    title: 'Can you lose money?',
    body: [
      'It depends on what you hold, not the account type. Eligible deposits such as savings and GICs at a CDIC member are insured within CDIC limits; mutual funds, stocks and ETFs are not covered.',
      'Tangerine notes its mutual funds are not guaranteed and their values change frequently.',
    ],
    simple: 'Cash savings and GICs are protected (within limits). Investments like funds can go down in value.',
    sources: ['cdic-coverage', 'tng-investment-funds'],
    related: ['timeline', 'gic', 'options'],
    draft: false,
  },
  access: {
    id: 'access',
    question: 'Can I take money out whenever I want?',
    title: 'Getting to your money',
    body: ['It depends on the account and what’s in it:'],
    points: [
      'TFSA: you can withdraw at any time; Tangerine’s TFSA Savings Account says you’re never locked in.',
      'FHSA: qualifying withdrawals for a home are tax-free; other withdrawals are generally taxed.',
      'Tangerine GICs: not cashable before maturity except approved hardship redemptions.',
    ],
    simple: 'A savings account or TFSA savings: yes, anytime. A GIC at Tangerine: usually not until it ends. An FHSA: yes, but it’s only tax-free when used for your home.',
    sources: ['gov-tfsa', 'tng-tfsa-savings', 'gov-fhsa-withdrawals', 'tng-gic'],
    related: ['timeline', 'emergency', 'gic'],
    draft: false,
  },
  downPayment: {
    id: 'downPayment',
    question: 'I don’t know how much I need yet.',
    title: 'Figuring out how much you might need',
    body: [
      'That’s fine; you don’t need a number yet. For reference, Canada’s minimum down payment is 5% for homes up to $500,000, with higher percentages above that, and closing costs of roughly 1.5% to 4% come on top.',
      'A savings target is your own choice. It isn’t the same as what a lender would approve.',
    ],
    simple: 'There’s a minimum you need to put down (it starts at 5% of the price), plus extra for closing costs. You can pick a target later.',
    sources: ['fcac-down-payment', 'fcac-buying-home'],
    related: ['prepare', 'timeline', 'accounts'],
    draft: false,
  },
  timeline: {
    id: 'timeline',
    question: 'Why does my timeline matter?',
    title: 'Why your purchase timeline matters',
    body: [
      'Your timeline affects how much time you have to save and how much flexibility you need. For money you’ll need soon, the FCAC notes it’s important to keep savings protected and easily accessible.',
      'With a longer timeline, there’s more room to adjust and to weigh stability against potential growth. A qualified person can help you think that through.',
    ],
    simple: 'If you’re buying soon, keep the money safe and easy to reach. If it’s years away, you have more room to adjust.',
    sources: ['fcac-buying-home'],
    related: ['access', 'risk', 'gic'],
    draft: true,
  },
  emergency: {
    id: 'emergency',
    question: 'Why separate emergency savings?',
    title: 'Keeping emergency savings separate',
    body: [
      'An emergency fund is money set aside for unexpected costs like repairs or a job loss, and it can help you avoid debt. Keeping it separate from a home goal makes it clearer what’s truly available for each.',
      'How much to keep aside is your decision. I only use the amount you tell me.',
    ],
    simple: 'Emergency money is for surprises. Keeping it apart from your home savings helps you see what you really have for the house.',
    sources: ['fcac-emergency-fund', 'tng-savings-account'],
    related: ['access', 'tangerine'],
    draft: true,
  },
  prepare: {
    id: 'prepare',
    question: 'What should I prepare before talking to someone?',
    title: 'Information you might gather',
    body: ['Lenders generally look at income, expenses, debts, your credit report and score, the amount you want to borrow and the amortization period.'],
    points: [
      'Your savings goal and timeline (your summary can help).',
      'Monthly take-home income and regular expenses.',
      'Current debts such as credit cards, loans or lines of credit.',
      'A recent credit report, checked for errors.',
      'Tangerine’s Mortgage Checklist on its mortgage page.',
    ],
    simple: 'Have a rough idea of what you earn, spend and owe, and check your credit report. Tangerine has a mortgage checklist that can help.',
    sources: ['fcac-preparing-mortgage', 'tng-mortgage'],
    related: ['contact', 'downPayment'],
    draft: false,
  },
  options: {
    id: 'options',
    question: 'Explain the options',
    title: 'General things people compare',
    body: ['I can’t tell you which option is right for you, but these are questions people commonly weigh when saving for a home:'],
    points: [
      'Access: how quickly can I reach the money if plans change?',
      'Stability: could the value go down before I need it?',
      'Tax treatment: is it in an FHSA, TFSA or neither, and what rules apply?',
      'Timeline: does the term or holding match when I expect to buy?',
    ],
    simple: 'Ask: can I get to it, could it lose value, how is it taxed, and does it fit my timing?',
    sources: ['fcac-buying-home', 'cdic-coverage'],
    related: ['access', 'risk', 'contact'],
    draft: true,
  },
  contact: {
    id: 'contact',
    question: 'How do I reach Tangerine?',
    title: 'Talking to Tangerine',
    body: [
      'Tangerine’s Contact Us page lists phone support at 1-888-826-4374 (including a mortgage line on weekdays), a separate Investment Funds line at 1-877-464-5678, and live chat during set hours.',
      'Hours vary by line, so check the page before calling.',
    ],
    simple: 'You can call Tangerine at 1-888-826-4374 or use live chat. Check their Contact Us page for hours.',
    sources: ['tng-contact'],
    related: ['prepare', 'tangerine'],
    draft: false,
  },
};

/** Topics suggested first for each timeline band (scripted explore step). */
export const TOPICS_BY_BAND = {
  underOne: ['access', 'prepare', 'gic', 'fhsa'],
  oneToFive: ['fhsa', 'tfsa', 'access', 'timeline'],
  overFive: ['fhsa', 'tfsa', 'risk', 'timeline'],
} as const satisfies Record<string, readonly TopicId[]>;

export const ALL_TOPIC_IDS: TopicId[] = ['fhsa', 'tfsa', 'gic', 'access', 'risk', 'timeline', 'emergency', 'prepare', 'tangerine'];
