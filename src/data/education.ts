/**
 * Scripted-mode educational answers for the wealth conversation. Each cites
 * knowledge-base entries (src/shared/knowledge.ts). AI mode uses the knowledge
 * base directly. Review status: CONTENT_SOURCES.md.
 */

export type TopicId =
  | 'why_asking'
  | 'saving_vs_investing'
  | 'horizon'
  | 'risk'
  | 'account_vs_holdings'
  | 'tfsa'
  | 'rrsp'
  | 'tfsa_vs_rrsp'
  | 'gic'
  | 'funds'
  | 'gic_vs_fund'
  | 'savings_vs_gic'
  | 'fees'
  | 'leave_in_chequing'
  | 'need_next_year'
  | 'tangerine_help'
  | 'not_ready'
  | 'emergency'
  | 'debt'
  | 'first_home'
  | 'fhsa_tangerine'
  | 'advisors'
  | 'contact';

export interface TopicContent {
  id: TopicId;
  /** Customer phrasing for suggestion chips. */
  question: string;
  title: string;
  /** Default answer: 2–5 sentences. */
  body: string[];
  points?: string[];
  /** Plainer version for "explain that more simply". */
  simple: string;
  sources: string[];
  related: TopicId[];
  /** True when some wording is team-drafted beyond what sources state. */
  draft: boolean;
}

export const TOPICS: Record<TopicId, TopicContent> = {
  why_asking: {
    id: 'why_asking',
    question: 'Why are you asking?',
    title: 'Why Sunny reached out',
    body: [
      'Your chequing balance has stayed above a set level for a while, so I offered a conversation. That’s only a reason to ask. A balance doesn’t tell me what the money is for, and it might already be spoken for.',
      'If it is, just say so and I won’t bring it up again.',
    ],
    simple: 'I noticed your balance stayed high for a while, so I asked. That’s all. You decide if there’s anything to talk about.',
    sources: [],
    related: ['leave_in_chequing', 'emergency', 'saving_vs_investing'],
    draft: true,
  },
  saving_vs_investing: {
    id: 'saving_vs_investing',
    question: 'What’s the difference between saving and investing?',
    title: 'Saving vs investing',
    body: [
      'Saving usually means keeping money somewhere safe and easy to reach, like a savings account, where it earns interest with little to no risk of loss. Investing means buying things like funds or bonds in pursuit of higher potential returns, which come with risk: values can go down as well as up.',
      'Investing generally suits longer timeframes, because there’s more time to recover from drops. Many people use both: savings for near-term needs, investments for long-term goals.',
    ],
    simple: 'Saving keeps your money safe and ready to use. Investing aims to grow it over many years, but it can go down along the way.',
    sources: ['tng-saving-vs-investing', 'fcac-goals'],
    related: ['horizon', 'risk', 'account_vs_holdings'],
    draft: false,
  },
  horizon: {
    id: 'horizon',
    question: 'Why does my timeline matter?',
    title: 'Access and time horizon',
    body: [
      'Your time horizon is how long until you might need the money. The FCAC describes short-term goals as about 2 years or less and long-term goals as 6 years or more.',
      'Investment risk may be more acceptable for longer-term goals because there’s more time to recover from losses. Money you might need soon is usually kept somewhere stable and accessible.',
    ],
    simple: 'If you’ll need the money soon, keep it safe and easy to reach. If it’s for many years from now, you have more time to ride out ups and downs.',
    sources: ['fcac-goals', 'tng-saving-vs-investing'],
    related: ['risk', 'need_next_year', 'gic_vs_fund'],
    draft: false,
  },
  risk: {
    id: 'risk',
    question: 'Can I lose money?',
    title: 'Risk and potential return',
    body: [
      'It depends on what you hold. Eligible deposits such as savings and GICs at a CDIC member are insured within CDIC’s limits. Investment funds aren’t guaranteed or CDIC-insured, and their values change, so you can lose money.',
      'Investments with higher potential returns generally come with more risk. Your comfort with risk depends on how you’d feel about drops and whether you could afford them.',
    ],
    simple: 'Savings and GICs are protected (within limits). Investment funds can go up and down, and you could get back less than you put in.',
    sources: ['cdic-coverage', 'tng-investment-funds', 'fcac-goals'],
    related: ['horizon', 'gic_vs_fund', 'fees'],
    draft: false,
  },
  account_vs_holdings: {
    id: 'account_vs_holdings',
    question: 'Is a TFSA an investment?',
    title: 'Accounts vs. what’s inside them',
    body: [
      'Not by itself. A TFSA or RRSP is an account (a “container”) with special tax treatment. Inside it you can hold savings, GICs or investment funds, depending on what the institution offers.',
      'The risk and access depend on what’s inside, not on the account label.',
    ],
    simple: 'A TFSA is like a box with tax benefits. What you put in the box (cash, a GIC or funds) decides how risky it is.',
    sources: ['tng-beginners-guide', 'gov-tfsa', 'tng-tfsa-options'],
    related: ['tfsa_vs_rrsp', 'gic_vs_fund', 'risk'],
    draft: false,
  },
  tfsa: {
    id: 'tfsa',
    question: 'How does a TFSA work?',
    title: 'Tax-Free Savings Account (TFSA)',
    body: [
      'A TFSA is a registered account that can hold savings or investments. Contributions aren’t tax-deductible, but income earned inside is generally tax-free, including when you withdraw, and you can withdraw any time for any reason.',
      'At Tangerine, a TFSA can hold a savings account, a GIC or investment funds. You’re responsible for staying within your contribution room.',
    ],
    simple: 'A TFSA lets money grow without tax, and you can take it out whenever you want. You choose what goes inside it.',
    sources: ['gov-tfsa', 'tng-tfsa-options'],
    related: ['tfsa_vs_rrsp', 'account_vs_holdings', 'funds'],
    draft: false,
  },
  rrsp: {
    id: 'rrsp',
    question: 'How does an RRSP work?',
    title: 'Registered Retirement Savings Plan (RRSP)',
    body: [
      'An RRSP is a registered plan for retirement saving. Contributions can reduce your taxable income, growth is usually not taxed while it stays in the plan, and withdrawals are generally taxable.',
      'Tangerine offers RSP savings, GIC and investment fund options. There’s a $50 fee to transfer an RSP to another institution.',
    ],
    simple: 'An RRSP gives you a tax break now for retirement saving, and you pay tax when you take the money out.',
    sources: ['gov-rrsp', 'tng-rsp-options'],
    related: ['tfsa_vs_rrsp', 'account_vs_holdings'],
    draft: false,
  },
  tfsa_vs_rrsp: {
    id: 'tfsa_vs_rrsp',
    question: 'How is a TFSA different from an RRSP?',
    title: 'TFSA and RRSP at a high level',
    body: ['Both are accounts with tax advantages; both can hold savings, GICs or funds. The main difference is when tax applies:'],
    points: [
      'TFSA: contributions aren’t deductible; growth and withdrawals are generally tax-free; withdraw any time.',
      'RRSP: contributions can reduce taxable income; growth is tax-deferred; withdrawals are generally taxable.',
    ],
    simple: 'TFSA: no tax break now, no tax later. RRSP: tax break now, tax later when you withdraw.',
    sources: ['gov-tfsa', 'gov-rrsp'],
    related: ['account_vs_holdings', 'funds', 'fees'],
    draft: false,
  },
  gic: {
    id: 'gic',
    question: 'What is a GIC?',
    title: 'Guaranteed Investment Certificate (GIC)',
    body: [
      'A GIC returns your principal at the end of a set term, plus interest. Before you buy, institutions must tell you whether you can cash it in early and how that affects interest.',
      'At Tangerine, GICs aren’t cashable before maturity except approved financial-hardship redemptions, so the term matters if you might need the money.',
    ],
    simple: 'A GIC keeps your money safe for a set time and pays interest. At Tangerine you generally can’t take it out early.',
    sources: ['fcac-gic-rights', 'tng-gic'],
    related: ['gic_vs_fund', 'need_next_year', 'horizon'],
    draft: false,
  },
  funds: {
    id: 'funds',
    question: 'What are investment funds?',
    title: 'Investment funds',
    body: [
      'A mutual fund pools money to hold many investments (like stocks, bonds or cash equivalents) in one package, which spreads risk but doesn’t remove it. Tangerine offers Core, Global ETF and Socially Responsible portfolios, and a Money Market Fund.',
      'Fund values change frequently, they aren’t CDIC-insured, and fees apply. Tangerine lists management fees of 0.50%–0.80% plus a 0.15% administration fee.',
    ],
    simple: 'A fund is a bundle of many investments. It can grow over time, but its value goes up and down, and there are yearly fees.',
    sources: ['tng-investment-funds', 'tng-beginners-guide'],
    related: ['fees', 'risk', 'gic_vs_fund'],
    draft: false,
  },
  gic_vs_fund: {
    id: 'gic_vs_fund',
    question: 'What’s the difference between a GIC and an investment fund?',
    title: 'GIC vs. investment fund',
    body: ['They work very differently:'],
    points: [
      'GIC: principal returned at the end of the term plus interest; eligible GICs can be CDIC-insured; at Tangerine, locked in until maturity (except approved hardship).',
      'Investment fund: no guarantee; value changes with markets, aiming for higher potential returns over time; ongoing fees; not CDIC-insured.',
    ],
    simple: 'A GIC is predictable but locked in for a time. A fund can grow more but can also go down.',
    sources: ['tng-gic', 'tng-investment-funds', 'cdic-coverage'],
    related: ['horizon', 'fees', 'risk'],
    draft: false,
  },
  savings_vs_gic: {
    id: 'savings_vs_gic',
    question: 'How do savings accounts and GICs compare?',
    title: 'Savings account vs. GIC',
    body: ['Both are ways to keep money stable; the main difference is access:'],
    points: [
      'Tangerine Savings Account: money stays accessible; interest is calculated daily and the rate can change; no monthly fee or minimum balance.',
      'GIC: you get your principal back at the end of a set term, plus interest. Tangerine GICs aren’t cashable before maturity, except approved financial-hardship redemptions.',
      'Eligible deposits and GICs at a CDIC member can be insured within CDIC’s limits.',
    ],
    simple: 'A savings account lets you take money out anytime. A GIC locks it in for a set time, usually in exchange for knowing what you’ll earn.',
    sources: ['tng-savings-account', 'tng-gic', 'fcac-gic-rights', 'cdic-coverage'],
    related: ['tfsa', 'need_next_year', 'horizon'],
    draft: false,
  },
  fees: {
    id: 'fees',
    question: 'What fees should I know about?',
    title: 'Fees and conditions',
    body: [
      'Investment costs can come from buying, selling and managing an investment, and they reduce your return. For Tangerine Investment Funds, Tangerine lists annual management fees (0.80% Core, 0.50% Global ETF, 0.55% Socially Responsible) plus a 0.15% administration fee and other fund expenses.',
      'Tangerine’s registered accounts have no fees while funds stay with Tangerine, but transfers out to another institution have a fee.',
    ],
    simple: 'Funds charge a small yearly percentage. Moving registered accounts to another bank costs a fee.',
    sources: ['fcac-investing-basics', 'tng-investment-funds', 'tng-tfsa-options', 'tng-rsp-options'],
    related: ['funds', 'risk'],
    draft: false,
  },
  leave_in_chequing: {
    id: 'leave_in_chequing',
    question: 'Why wouldn’t I just leave it in chequing?',
    title: 'Chequing vs. other options',
    body: [
      'You can. There’s no requirement to move anything. Chequing accounts are built for day-to-day banking and usually pay little or no interest, while savings accounts are meant for money set aside, generally with more interest.',
      'Whether anything changes is your call. It mostly depends on when you’ll need the money and what it’s for.',
    ],
    simple: 'Chequing is for everyday spending and usually earns little. Savings or other options can earn more for money you don’t need right away. It’s up to you.',
    sources: ['tng-chequing-vs-savings'],
    related: ['saving_vs_investing', 'horizon', 'emergency'],
    draft: false,
  },
  need_next_year: {
    id: 'need_next_year',
    question: 'What if I need the money next year?',
    title: 'Money you might need soon',
    body: [
      'For money you might need within a year or two, people usually prioritise stability and access over growth, because there’s little time to recover from a drop. The FCAC treats 2 years or less as a short-term goal.',
      'Options like savings accounts keep money accessible. With a GIC, check the term and whether early cash-out is allowed (Tangerine GICs generally aren’t cashable early).',
    ],
    simple: 'If you need it soon, keep it somewhere safe and easy to get to.',
    sources: ['fcac-goals', 'tng-gic', 'tng-savings-account'],
    related: ['savings_vs_gic', 'tfsa', 'horizon'],
    draft: false,
  },
  tangerine_help: {
    id: 'tangerine_help',
    question: 'What can Tangerine help me with?',
    title: 'Tangerine offerings you could learn about',
    body: ['Here’s what I could verify on Tangerine’s website:'],
    points: [
      'Savings Accounts with automatic savings and up to 10 accounts for separate goals.',
      'TFSA and RSP options that can hold savings, GICs or investment funds.',
      'GICs over various terms (not cashable early except approved hardship).',
      'Tangerine Investment Funds: diversified portfolios with stated fees and risk of loss.',
      'Tangerine Advisors for phone or video consultations.',
    ],
    simple: 'Tangerine has savings accounts, TFSAs and RSPs, GICs, investment funds and advisors you can talk to.',
    sources: ['tng-savings-account', 'tng-tfsa-options', 'tng-rsp-options', 'tng-investment-funds'],
    related: ['saving_vs_investing', 'advisors', 'fees'],
    draft: false,
  },
  not_ready: {
    id: 'not_ready',
    question: 'I’m not ready to decide.',
    title: 'Not ready to decide',
    body: [
      'That’s completely fine. There’s no deadline here and nothing changes unless you choose. Before investing, the FCAC suggests thinking about your goals, time horizon and comfort with risk.',
      'I can save what we’ve covered so you can come back to it, or we can keep learning.',
    ],
    simple: 'No rush. We can save this and pick it up later.',
    sources: ['fcac-investing-basics'],
    related: ['risk', 'horizon', 'advisors'],
    draft: false,
  },
  emergency: {
    id: 'emergency',
    question: 'Why keep an emergency reserve?',
    title: 'Emergency savings',
    body: [
      'An emergency fund is money for unexpected costs like repairs or a job loss, and it can help you avoid going into debt. How much to keep is your decision. I only use the amount you tell me.',
    ],
    simple: 'Emergency money is for surprises, so you don’t have to borrow.',
    sources: ['fcac-emergency-fund'],
    related: ['leave_in_chequing', 'saving_vs_investing'],
    draft: false,
  },
  debt: {
    id: 'debt',
    question: 'What if I have debt elsewhere?',
    title: 'Debt and investing',
    body: [
      'That’s useful context. I can only see your Tangerine accounts. The FCAC notes you’re generally better off paying down debt first, because debt interest is usually more than you can earn by investing.',
      'You don’t need to share details with me. A person can help weigh this for your situation.',
    ],
    simple: 'Paying down debt with high interest often comes before investing. A person can help you weigh it.',
    sources: ['fcac-goals'],
    related: ['advisors', 'saving_vs_investing'],
    draft: false,
  },
  first_home: {
    id: 'first_home',
    question: 'What about saving for a first home?',
    title: 'Saving for a first home',
    body: [
      'An FHSA is a registered account for first-time buyers: contributions are generally deductible and qualifying withdrawals for a first home are tax-free. A TFSA is another flexible option. The minimum down payment in Canada starts at 5% for homes up to $500,000, and closing costs come on top.',
      'I couldn’t confirm that Tangerine currently offers an FHSA, so that’s worth asking Tangerine directly.',
    ],
    simple: 'There are accounts with tax perks for a first home. I couldn’t confirm Tangerine offers an FHSA, so ask them.',
    sources: ['gov-fhsa-overview', 'fcac-down-payment', 'tng-fhsa-status'],
    related: ['need_next_year', 'tfsa', 'horizon'],
    draft: false,
  },
  fhsa_tangerine: {
    id: 'fhsa_tangerine',
    question: 'Does Tangerine offer an FHSA?',
    title: 'FHSA at Tangerine',
    body: [
      'I can’t confirm that. Tangerine’s information page for AI systems lists FHSAs, but I couldn’t find a Tangerine FHSA product page, and its Invest and GIC pages don’t list one. Tangerine can confirm directly.',
    ],
    simple: 'I’m not sure, and I don’t want to guess. Tangerine can tell you.',
    sources: ['tng-fhsa-status', 'tng-contact'],
    related: ['contact', 'tfsa'],
    draft: false,
  },
  advisors: {
    id: 'advisors',
    question: 'Can I talk to a person?',
    title: 'Talking to a person',
    body: [
      'Tangerine describes advisors who offer phone or video consultations, including a no-obligation investment consultation, booked online. It states advisors aren’t paid commissions based on what you choose.',
      'In this prototype I can prepare questions for you to bring, but nothing is booked or sent.',
    ],
    simple: 'Tangerine has advisors you can call or video chat with. I can help you write down your questions.',
    sources: ['tng-advisors', 'tng-contact'],
    related: ['not_ready', 'fees'],
    draft: false,
  },
  contact: {
    id: 'contact',
    question: 'How do I reach Tangerine?',
    title: 'Contacting Tangerine',
    body: [
      'Tangerine’s Contact Us page lists 1-888-826-4374, an Investment Funds line at 1-877-464-5678, and live chat during set hours. Hours vary, so check the page before calling.',
    ],
    simple: 'Call 1-888-826-4374 or use live chat. Check the Contact Us page for hours.',
    sources: ['tng-contact'],
    related: ['advisors'],
    draft: false,
  },
};

/** Topics most relevant to each goal (for suggestions). */
export const TOPICS_FOR_GOAL: Record<string, TopicId[]> = {
  build_wealth: ['risk', 'account_vs_holdings', 'gic_vs_fund', 'fees', 'funds'],
  accessible_interest: ['leave_in_chequing', 'savings_vs_gic', 'need_next_year', 'tfsa'],
  first_home: ['first_home', 'fhsa_tangerine', 'need_next_year', 'tfsa'],
  understand_options: ['saving_vs_investing', 'account_vs_holdings', 'gic_vs_fund', 'risk'],
  other: ['saving_vs_investing', 'horizon', 'tangerine_help'],
};
