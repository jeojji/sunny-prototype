/**
 * Sunny's scripted dialogue copy. Pure functions of current values only,
 * so any text built here always reflects current confirmed facts.
 */
import type { CustomerProfile } from '../data/customers';
import type { TimelineBand, ScenarioResult } from '../lib/calc';
import { money, horizon } from '../lib/format';
import type { EditableField, NextStepId } from './types';

export const BAND_LABEL: Record<TimelineBand, string> = {
  underOne: 'Within a year',
  oneToFive: 'In 1–5 years',
  overFive: 'More than 5 years',
};

export const BAND_DEFAULT_MONTHS: Record<TimelineBand, number> = { underOne: 12, oneToFive: 36, overFive: 72 };

export const FIELD_LABEL: Record<EditableField, string> = {
  timelineMonths: 'timeline',
  target: 'savings target',
  homeSavings: 'starting savings',
  monthly: 'monthly amount',
};

export const NEXT_STEP_LABEL: Record<NextStepId, string> = {
  learnFhsa: 'Read more about FHSAs on the CRA website',
  reviewBudget: 'Review my monthly budget',
  gatherInfo: 'Gather information before speaking to someone',
  revisit: 'Revisit this scenario in a few months',
  talkToPerson: 'Ask to speak with a person',
};

export const script = {
  greeting: (p: CustomerProfile) => `Hi ${p.firstName}, what would you like to understand about saving for your first home?`,
  scopeNote:
    'I can explain home-saving concepts, point you to Tangerine resources, and help you explore numbers if that’s useful. I don’t make financial decisions for you.',
  whatFirst: 'What would you like to understand?',

  goalAck: 'Happy to help you explore a savings goal. We can take it one step at a time, and you can stop to ask questions whenever you like.',
  permission:
    'To make this personal, may I use your account snapshot? I’d see your balances and typical monthly income and spending, not how you’ve set aside your savings. Or you can share the details yourself.',
  snapshotAck: 'Thanks. Here’s what your snapshot shows:',
  manualAck: 'No problem. I’ll only use the details you share with me.',

  timeline: 'When are you hoping to buy your first home?',
  timelineMonths: (band: TimelineBand) =>
    ({
      underOne: 'Soon, then. Roughly how many months from now? An estimate is fine.',
      oneToFive: 'That gives you some runway. Roughly how many months from now? An estimate is fine, and you can change it later.',
      overFive: 'Planning ahead, great. Roughly how many months from now? An estimate is fine, and you can change it later.',
    })[band],
  timelineAck: (m: number) => `Got it: about ${horizon(m)}.`,

  target:
    'How much would you like to save toward your home? This is your own target, so choose what feels right. It isn’t a required amount, and you can change it anytime.',
  targetAck: (t: number) => `Thanks. I’ll use ${money(t)} as your savings target.`,

  homeSavingsSnapshot: (savings: number) =>
    `Your snapshot shows ${money(savings)} in savings. How much of that is available for this home goal?`,
  homeSavingsSnapshotEmpty:
    'Your snapshot doesn’t show a savings balance yet. Have you set anything aside for this goal elsewhere?',
  homeSavingsManual: 'How much have you already saved specifically for this home goal?',
  homeSavingsAmount: 'How much would you like to count toward this goal?',
  homeSavingsAckReserved: (reserved: number, home: number) =>
    `Thanks for clarifying. I’ll keep that ${money(reserved)} separate and use ${money(home)} as your starting amount for this goal.`,
  homeSavingsAckAll: (home: number) => `Thanks. I’ll use the full ${money(home)} as your starting amount for this goal.`,
  homeSavingsAckZero: 'Thanks. We’ll start this goal from $0, which is a perfectly fine place to begin.',
  homeSavingsAck: (home: number) => `Thanks. I’ll use ${money(home)} as your starting amount for this goal.`,

  monthlyWithCashFlow: (cf: number) =>
    `Your snapshot shows about ${money(cf)} a month left after typical expenses. That’s just context; you know your budget best. What monthly amount would you like to explore?`,
  monthlyNoSurplus:
    'Your snapshot shows typical expenses about equal to or above your take-home income right now. Is there a monthly amount you’d like to explore, or would you rather look at your starting point?',
  monthlyManual: 'What monthly amount would you like to explore for this goal? An estimate is fine.',
  monthlyAck: (m: number) => `Got it. Let’s explore ${money(m)} a month.`,
  monthlyAboveCashFlow: (m: number, cf: number) =>
    `Just so you know, ${money(m)} is more than the ${money(cf)} your snapshot shows left over each month. I’ll still show it, since you know your budget best.`,
  monthlyZero:
    'That’s completely okay. Plenty of people start here, and knowing your starting point is useful on its own.',

  scenarioIntro: 'Here’s the arithmetic, using only the numbers you gave me:',
  scenarioReached: (start: number, target: number) =>
    `Your home-goal savings of ${money(start)} already meet the ${money(target)} target you set, so there’s no gap to close in this scenario.`,
  scenarioZero: (start: number, target: number, gap: number) =>
    `Here’s your starting point: ${money(start)} toward your ${money(target)} target, a gap of ${money(gap)}. With no monthly amount for now, the gap stays the same, and that’s fine to know.`,
  scenarioResult: (monthly: number, months: number, r: ScenarioResult, target: number) =>
    r.reachesTargetInHorizon
      ? `At ${money(monthly)} a month for ${months} months, you’d reach about ${money(r.projectedTotal)}, which meets your ${money(target)} target.`
      : `At ${money(monthly)} a month for ${months} months, you’d reach about ${money(r.projectedTotal)}, which is ${money(r.remainingGap)} short of your ${money(target)} target. Reaching it in ${months} months works out to about ${money(r.requiredMonthly)} a month. That’s arithmetic, not a suggestion: you can try other amounts or timelines anytime.`,

  band: (band: TimelineBand) =>
    ({
      underOne:
        'Since you’re hoping to buy within a year, people often focus on keeping money accessible and getting ready for conversations with a lender. Want to look at any of these?',
      oneToFive:
        'With a one-to-five-year timeline, there’s time to build savings steadily, and it can help to understand the registered plans designed for home saving. Want to look at any of these?',
      overFive:
        'With more than five years to go, you have room to adjust as life changes. It can help to understand how different savings options work over a longer horizon. Want to look at any of these?',
    })[band],
  zeroBranch:
    'We could look more closely at your starting point, learn why emergency savings are kept separate, or I can put together a summary you can come back to. Whatever is useful.',

  explore: 'What would you like to look at next?',
  resumeHint: 'Whenever you’re ready, we can pick up where we left off.',
  simplerNone: 'Sure. In short: decide roughly when you’d like to buy, how much you’d like saved, and where to keep it. We can take any of those one at a time.',

  exceedsSnapshot: (amount: number, savings: number) =>
    `${money(amount)} is more than the ${money(savings)} your snapshot shows in savings. Is some of that held somewhere else, like at another bank?`,
  heldElsewhereAck: (amount: number) =>
    `Thanks. I’ll use ${money(amount)} as your starting amount, including money held outside the accounts in your snapshot.`,
  negativeAmount: 'That looks like a negative amount. Amounts here need to be $0 or more. What did you mean?',
  unclearAmount: 'I want to get this right. How much do you mean? An approximate dollar amount is fine.',
  reserveAsk: 'How much would you like to keep aside for emergencies?',
  reserveTooLarge: (reserve: number, savings: number) =>
    `${money(reserve)} is more than the ${money(savings)} your snapshot shows in savings. How much would you like to keep aside?`,
  reserveManualAck: (reserve: number, home: number | null) =>
    home === null
      ? `Noted: ${money(reserve)} kept separate for emergencies.`
      : `Noted: ${money(reserve)} kept separate for emergencies. I’ll keep ${money(home)} as your home-goal savings unless you tell me otherwise.`,
  modeScripted: 'Switched to the scripted demo. From here, my replies are pre-written for this demonstration, not generated by AI.',
  modeAi: 'Switched to live AI conversation.',

  investment:
    'That’s an important question. The right answer depends on your full financial picture, your timeline and how comfortable you are with ups and downs. I can explain how different options work and what people generally compare, but I can’t determine the right investment for you here. A qualified person can help with that.',
  supportPrepared:
    'I’ve drafted a handoff preview with your goal, numbers and questions. You can review and edit it. Nothing is sent from this preview.',

  nextSteps: 'Which of these would you like to note as next steps? Choose any that feel useful.',
  nextStepsAck: (n: number) =>
    n > 0 ? 'Noted. Your summary is ready whenever you’d like to see it.' : 'No problem. Your summary is ready whenever you’d like to see it.',
  summaryReady: 'I’ve put together a summary of our conversation.',

  editPicker: 'Which assumption would you like to change?',
  editField: (field: EditableField, current: string) => `What should your ${FIELD_LABEL[field]} be? It’s currently ${current}.`,
  updated: (changes: string[]) => `Updated: ${changes.join('; ')}.`,
  invalidAmount: 'That doesn’t look like an amount I can use. Please enter a dollar amount of $0 or more.',
  invalidMonths: 'That doesn’t look like a timeline I can use. Please enter a whole number of months between 1 and 360.',
  invalidTarget: 'Please enter a target greater than $0.',

  confirmRestart: 'Start over? This clears our conversation and the details you’ve confirmed.',
  carryOn: 'No problem, let’s carry on.',
  unsupported:
    'I’m not sure I followed. I focus on saving for a first home: how the accounts work, what Tangerine offers, and exploring a goal if you’d like. Did you mean one of these?',
  help: 'Here are some things you can ask me about:',
} as const;
