/**
 * Builds the conversation summary and the support-preview note from current
 * state only, so corrections are always reflected.
 */
import { TOPICS } from '../data/education';
import { PURPOSE_LABEL } from '../domain/allocations';
import { projectWithoutReturns, type ProjectionResult } from '../lib/calc';
import { money } from '../lib/format';
import { getEntry, type KnowledgeEntry } from '../shared/knowledge';
import { getOffering, OFFERINGS } from '../shared/offerings';
import { allocationSnapshot, currentBalances } from './engine';
import { GOAL_LABEL, HORIZON_LABEL, NEXT_STEP_LABEL } from './script';
import type { AllocationSnapshot, ConversationState, ScenarioFacts } from './types';

export interface Summary {
  firstName: string;
  prompted: string;
  dataUsed: string;
  asOf: string;
  balances: { chequing: number; savings: number };
  allocations: AllocationSnapshot;
  allocationsConfirmed: boolean;
  goal: string | null;
  goalDetail: string | null;
  horizon: string | null;
  topics: string[];
  /** Offerings Sunny displayed. */
  offeringsShown: string[];
  /** Offerings the customer actively opened. */
  offeringsExplored: string[];
  nextStep: string | null;
  nextStepDone: boolean;
  completedSteps: string[];
  questions: string[];
  unknowns: string[];
  scenario: { input: ScenarioFacts; result: ProjectionResult } | null;
  sources: KnowledgeEntry[];
  note: string;
}

/**
 * Topics actually discussed: scripted topics explored, plus general knowledge
 * entries cited in AI replies. Entries only cited as supporting sources for a
 * topic or an offerings card don't count as separate topics.
 */
export function topicsDiscussed(state: ConversationState): string[] {
  const m = state.memory;
  const titles = m.topicsExplored.map((t) => TOPICS[t].title);
  const supporting = new Set([...m.topicsExplored.flatMap((t) => TOPICS[t].sources), ...OFFERINGS.flatMap((o) => o.sources)]);
  for (const id of m.sourcesCited) {
    const e = getEntry(id);
    if (e && e.kind === 'general' && !supporting.has(id) && !titles.includes(e.topic)) titles.push(e.topic);
  }
  return titles;
}

function prompted(state: ConversationState): string {
  switch (state.memory.prompt) {
    case 'nudge':
      return `Sunny noticed your chequing balance stayed above ${money(state.signalConfig.threshold)} for ${state.signalConfig.observationDays} days and offered a conversation. That was only a reason to ask, not a judgment about the money.`;
    case 'checkin':
      return 'A check-in on the next step you chose earlier.';
    case 'self':
      return 'You started a conversation with Sunny.';
    default:
      return 'No conversation yet.';
  }
}

function unknowns(state: ConversationState, snap: AllocationSnapshot): string[] {
  const m = state.memory;
  const out: string[] = [];
  if (m.topicsExplored.includes('debt')) out.push('Debt at another bank was mentioned; details weren’t shared (and aren’t needed for general education).');
  else out.push('Accounts or debts outside Tangerine weren’t discussed.');
  if (m.allocations.length && snap.unassigned > 0) out.push(`What the ${money(snap.unassigned)} not yet assigned to a purpose is for.`);
  if (!m.horizon) out.push('When you might need the money.');
  out.push('Your comfort with investment risk hasn’t been assessed.');
  out.push('Eligibility and suitability for any product haven’t been determined.');
  if (m.goal?.type === 'first_home') out.push('Whether Tangerine currently offers an FHSA (unconfirmed).');
  return out;
}

export function autoNote(state: ConversationState): string {
  const m = state.memory;
  const snap = allocationSnapshot(state);
  const parts: string[] = [];
  if (m.allocations.length) {
    parts.push(
      `In my chequing account, ${m.allocations.map((a) => `${money(a.amount)} is for ${PURPOSE_LABEL[a.purpose].toLowerCase()}`).join(' and ')}; ${money(snap.unassigned)} isn’t assigned to a purpose yet.`,
    );
  }
  if (m.goal) parts.push(`My goal: ${GOAL_LABEL[m.goal.type].toLowerCase()}${m.goal.detail ? ` (“${m.goal.detail}”)` : ''}.`);
  if (m.horizon) parts.push(`Timeframe: ${HORIZON_LABEL[m.horizon].toLowerCase()}.`);
  const topics = topicsDiscussed(state);
  if (topics.length) parts.push(`I’ve learned about: ${topics.slice(0, 5).join('; ')}.`);
  const opened = names(m.offeringsExplored);
  if (opened.length) parts.push(`Offerings I opened: ${opened.join(', ')}.`);
  if (m.nextStep) parts.push(`Next step I chose: ${NEXT_STEP_LABEL[m.nextStep].toLowerCase()}${m.nextStepDone ? ' (done)' : ''}.`);
  return parts.join(' ') || 'I’d like to talk about my options.';
}

const names = (ids: string[]) => ids.map((id) => getOffering(id)?.name).filter((n): n is string => Boolean(n));

export function buildSummary(state: ConversationState): Summary {
  const m = state.memory;
  const b = currentBalances(state);
  const snap = allocationSnapshot(state);
  return {
    firstName: state.profile.firstName,
    prompted: prompted(state),
    dataUsed:
      m.permission === 'granted'
        ? 'Your Tangerine account details (synthetic) plus what you told Sunny'
        : m.permission === 'declined'
          ? 'Only what you told Sunny (account details not used in the conversation)'
          : 'General information; no account details used in the conversation',
    asOf: b.date,
    balances: { chequing: b.chequing, savings: b.savings },
    allocations: snap,
    allocationsConfirmed: m.allocations.length > 0,
    goal: m.goal ? GOAL_LABEL[m.goal.type] : null,
    goalDetail: m.goal?.detail ?? null,
    horizon: m.horizon ? HORIZON_LABEL[m.horizon] : null,
    topics: topicsDiscussed(state),
    offeringsShown: names(m.offeringsShown),
    offeringsExplored: names(m.offeringsExplored),
    nextStep: m.nextStep ? NEXT_STEP_LABEL[m.nextStep] : null,
    nextStepDone: m.nextStepDone,
    completedSteps: m.completedSteps.map((s) => NEXT_STEP_LABEL[s]),
    questions: m.supportQuestions,
    unknowns: unknowns(state, snap),
    scenario: m.scenario ? { input: m.scenario, result: projectWithoutReturns(m.scenario) } : null,
    sources: m.sourcesCited.map(getEntry).filter((e): e is KnowledgeEntry => Boolean(e)),
    note: state.handoffNoteEdited ? state.handoffNote : autoNote(state),
  };
}
