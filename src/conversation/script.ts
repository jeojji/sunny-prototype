/**
 * Sunny's deterministic dialogue copy (scripted mode, plus the local opening
 * messages used in both modes). Pure functions of current values only.
 */
import { PURPOSE_LABEL, type Allocation } from '../domain/allocations';
import type { SignalResult } from '../domain/signal';
import { money } from '../lib/format';
import type { ProjectionResult } from '../lib/calc';
import type { GoalType } from '../shared/offerings';
import type { Horizon, Memory, NextStepId } from './types';

export const GOAL_LABEL: Record<GoalType, string> = {
  build_wealth: 'Build wealth over time',
  accessible_interest: 'Keep money accessible while earning interest',
  first_home: 'Save for a first home',
  understand_options: 'Understand the options before deciding',
  other: 'Something else',
};

export const HORIZON_LABEL: Record<Horizon, string> = {
  under_1_year: 'Within a year',
  '1_to_5_years': 'In 1–5 years',
  over_5_years: 'More than 5 years away',
  not_sure: 'Not sure yet',
};

export const NEXT_STEP_LABEL: Record<NextStepId, string> = {
  learn_risk: 'Learn about investment risk first',
  compare_options: 'Compare these options',
  explore_scenario: 'Explore an illustrative scenario',
  read_product_page: 'Read the official product pages',
  prepare_questions: 'Prepare questions for a person',
  save_for_later: 'Save this and come back later',
  not_proceeding: 'Not right now',
};

/** How the next step reads in a later check-in ("Last time, you wanted to …"). */
const NEXT_STEP_CHECKIN: Record<NextStepId, string> = {
  learn_risk: 'understand investment risk before deciding what to do',
  compare_options: 'compare the options we looked at',
  explore_scenario: 'explore an illustrative scenario',
  read_product_page: 'read the official product pages',
  prepare_questions: 'prepare questions for a conversation with a person',
  save_for_later: 'come back to our conversation',
  not_proceeding: '',
};

const listAllocations = (items: Allocation[]) =>
  items.map((a) => `${money(a.amount)} ${a.purpose === 'emergency' ? 'is your emergency reserve' : `is for ${PURPOSE_LABEL[a.purpose].toLowerCase()}`}`).join(' and ');

export const script = {
  greetingSelf: (name: string) => `Hi ${name}, what would you like to understand or work on today?`,
  scopeNote:
    'I can explain saving and investing, introduce Tangerine options, and help you think through a goal. I don’t make financial decisions for you.',

  nudgeOpen: (name: string, signal: SignalResult, days: number) =>
    `Hi ${name}. Here’s what prompted this: your chequing balance has stayed above ${money(signal.evidence.threshold)} for the past ${days} days. That’s only an observation. A balance doesn’t tell me what the money is for.`,
  permissionAsk:
    'To make this conversation relevant, may I use your Tangerine account details, like balances and recent activity? If you’d rather keep it general, that’s fine too.',
  permissionYes: 'Thanks. I’ll use your Tangerine account details in this conversation only.',
  permissionNo: 'No problem. I’ll keep it general and only use what you tell me.',
  purposeAsk: 'Before we explore anything, is this money set aside for upcoming expenses, emergencies, or something else?',

  allocationsAck: (balance: number, items: Allocation[], unassigned: number, savings: number) =>
    items.length
      ? `Thanks. Of the ${money(balance)} in chequing, ${listAllocations(items)}. That leaves ${money(unassigned)} not yet assigned to a purpose. Your ${money(savings)} savings balance is separate, and I haven’t counted it here. Did I get that right?`
      : `Thanks. So none of the ${money(balance)} in chequing is set aside yet; it’s all not yet assigned to a purpose. Your ${money(savings)} savings balance is separate. Did I get that right?`,
  allocationsAckGeneral: (items: Allocation[]) =>
    items.length ? `Thanks. I’ve noted that ${listAllocations(items)}. Did I get that right?` : 'Thanks. I’ve noted that none of it is set aside yet. Is that right?',
  allocationsOver: (total: number, balance: number) =>
    `Those add up to ${money(total)}, which is more than the ${money(balance)} in your chequing account. Is some of it held somewhere else, or should we adjust the amounts?`,
  allocationsReenter: 'No problem. How much of the money in this chequing account is for upcoming expenses, and how much is your emergency reserve?',
  allocationsElsewhere: 'Got it. I can only see your Tangerine accounts, so let’s count just what’s in this chequing account. How much of each is held here?',

  earmarkedAck: (note: string | null) =>
    `Thanks for letting me know. I’ll treat this money as set aside${note ? ` ${note}` : ''} and won’t suggest exploring it again. If anything changes, you can always ask me.`,
  noPlan: 'That’s common, and there’s no rush. Before anything else: is any of it needed for upcoming bills or emergencies?',
  afterDebt: 'Before we go further: is any of this chequing money set aside for upcoming bills or emergencies?',

  goalAsk: 'What would you like this money to help you do?',
  goalAskAgain: 'Of course. What would you like this money to help you do now?',
  goalLead: {
    build_wealth: 'That’s a great place to start, and you don’t need to know how investing works yet. Here’s the core idea:',
    accessible_interest: 'Keeping money accessible while it earns interest is a common goal. Here’s how people usually think about it:',
    first_home: 'A first home is a common goal. Here’s some quick context:',
    understand_options: 'Understanding the options first is a sensible approach. Here’s the big picture:',
    other: 'Thanks for sharing that. Here’s a starting point:',
  } satisfies Record<GoalType, string>,
  horizonAsk: 'One question that shapes everything else: roughly when might you need this money?',

  horizonAck: {
    under_1_year: 'Since you might need it within a year, stability and access usually matter most.',
    '1_to_5_years': 'With one to five years, people often weigh access and stability alongside some growth.',
    over_5_years: 'With more than five years, there’s more time to recover from ups and downs, which is why longer-term investing often comes up for goals like this.',
    not_sure: 'That’s fine. Not knowing yet is a good reason to keep some flexibility.',
  } satisfies Record<Horizon, string>,

  offeringsIntro: {
    build_wealth: 'You mentioned wanting to understand longer-term investing. Here are Tangerine offerings you could learn about, with their features, fees and risks. This isn’t a recommendation, and they aren’t the only options available.',
    accessible_interest: 'You mentioned keeping money accessible while earning interest. Here are Tangerine offerings you could learn about, with their features and conditions. This isn’t a recommendation, and they aren’t the only options available.',
    first_home: 'You mentioned saving for a first home. Here are Tangerine offerings you could learn about. I couldn’t confirm an FHSA at Tangerine, so that’s worth asking them. This isn’t a recommendation.',
    understand_options: 'You wanted to understand the options before deciding. Here’s what Tangerine offers, with features, fees and risks. This isn’t a recommendation, and they aren’t the only options available.',
    other: 'Here are Tangerine offerings you could learn about. This isn’t a recommendation, and they aren’t the only options available.',
  } satisfies Record<GoalType, string>,
  offeringsReason: (goal: GoalType | null) =>
    goal === 'build_wealth' ? 'You said you want to build wealth and learn how investing works.' : goal ? `You said: ${GOAL_LABEL[goal].toLowerCase()}.` : 'You asked about Tangerine options.',

  nextStepAsk: 'What would you like to do next? There’s no need to decide anything today.',
  nextStepAck: {
    learn_risk: 'Good place to start. Here’s the short version:',
    compare_options: 'Here’s a side-by-side of how these differ:',
    explore_scenario: 'Let’s look at an illustrative scenario.',
    read_product_page: 'Here are Tangerine’s official pages for the options we looked at. Reading them doesn’t commit you to anything.',
    prepare_questions: 'I’ve drafted questions you could bring to a person. Nothing is sent or booked.',
    save_for_later: 'Saved. Next time you visit, I’ll offer to pick up where we left off. You can turn that off anytime.',
    not_proceeding: 'Understood. Nothing changes, and I won’t follow up on this. You can always ask me later.',
  } satisfies Record<NextStepId, string>,
  remember: (step: NextStepId) =>
    step === 'not_proceeding' || step === 'save_for_later' ? '' : `I’ll remember that you wanted to ${NEXT_STEP_CHECKIN[step]}.`,

  checkinPrompt: (m: Memory) =>
    m.nextStep === 'save_for_later'
      ? `Last time, you saved our conversation${m.goal ? ` about ${GOAL_LABEL[m.goal.type].toLowerCase()}` : ''} to come back to. Would you like to pick that up?`
      : `Last time, you wanted to ${NEXT_STEP_CHECKIN[m.nextStep ?? 'save_for_later']}. Would you like to pick that up?`,
  checkinWelcome: (name: string, m: Memory) =>
    `Welcome back, ${name}. Picking up where you left off: you wanted to ${NEXT_STEP_CHECKIN[m.nextStep ?? 'save_for_later']}${m.goal ? `, with the goal to ${GOAL_LABEL[m.goal.type].toLowerCase()}` : ''}.`,

  scenarioIntro: 'This is simple arithmetic with your numbers: a starting amount plus the same amount each month. It doesn’t include interest or investment returns, and it isn’t a forecast.',
  scenarioResult: (r: ProjectionResult, months: number) =>
    `Over ${months} months, your contributions would add ${money(r.contributions)}, for a total of ${money(r.total)} before any interest or returns.` +
    (r.gapAtEnd !== null && r.gapAtEnd > 0 ? ` That’s ${money(r.gapAtEnd)} short of your target; reaching it would take about ${money(r.requiredMonthly)} a month.` : '') +
    (r.aboveTarget !== null && r.aboveTarget > 0 ? ' That meets your target.' : ''),

  investment:
    'I can’t tell you whether to invest this money or which investment to choose. That depends on your full situation, goals and comfort with risk, which I can’t assess here. I can explain how the options work and what people weigh, or help you prepare questions for a Tangerine advisor.',
  supportPrepared: 'I’ve drafted a support preview with what you’ve confirmed and your questions. You can edit it. Nothing is sent or booked.',
  summaryReady: 'Here’s a summary of our conversation.',
  resumeHint: 'Whenever you’re ready, we can pick up where we left off.',
  simplerNone: 'Sure. In short: saving keeps money safe and easy to reach; investing aims to grow it over years but can go down. What you choose depends on when you’ll need the money and how you feel about ups and downs.',
  negativeAmount: 'That looks like a negative amount. Amounts here need to be $0 or more. What did you mean?',
  unclearAmount: 'I want to get this right. How much do you mean? An approximate dollar amount is fine.',
  carryOn: 'No problem, let’s carry on.',
  confirmRestart: 'Start over? This clears this demo customer’s conversation and everything Sunny remembers about it.',
  unsupported: 'I’m not sure I followed. I can help you understand saving and investing, Tangerine options, or think through a goal. Did you mean one of these?',
  help: 'Here are some things you can ask me about:',
  modeScripted: 'Switched to the scripted demo. From here, my replies are pre-written for this demonstration, not generated by AI.',
  modeAi: 'Switched to live AI conversation.',
  overNotSaved: (balance: number) =>
    `That would add up to more than the ${money(balance)} in your chequing account, so I haven’t saved it. Could you check the amounts?`,
};
