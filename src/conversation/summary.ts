/**
 * Builds the "Your home-saving conversation" summary and handoff note
 * from current state only, so edits are always reflected.
 */
import { TOPICS } from '../data/education';
import { getEntry, type KnowledgeEntry } from '../shared/knowledge';
import { calculateScenario, type ScenarioResult } from '../lib/calc';
import { horizon, money } from '../lib/format';
import { scenarioInput } from './engine';
import { BAND_LABEL, NEXT_STEP_LABEL } from './script';
import type { ConversationState } from './types';

export interface Summary {
  firstName: string;
  goal: string;
  timeline: string | null;
  dataSource: string;
  startingSavings: number | null;
  reservedSeparately: number | null;
  target: number | null;
  monthly: number | null;
  months: number | null;
  result: ScenarioResult | null;
  assumptions: string[];
  topics: string[];
  sources: KnowledgeEntry[];
  heldElsewhere: boolean;
  nextSteps: string[];
  questions: string[];
  note: string;
  complete: boolean;
}

export const CALCULATION_ASSUMPTIONS = [
  'Uses only the amounts you confirmed in this conversation.',
  'Simple arithmetic: starting savings plus the same amount each month.',
  'Excludes interest, investment returns, fees, taxes and changes in circumstances.',
  'Your target is self-selected. It is not a required down payment or a measure of what you can afford.',
];

/** Topics discussed: scripted topics explored plus knowledge-base topics cited in AI replies. */
export function topicsDiscussed(state: ConversationState): string[] {
  const titles = state.topicsExplored.map((t) => TOPICS[t].title);
  for (const id of state.sourcesCited) {
    const e = getEntry(id);
    if (e && !titles.includes(e.topic)) titles.push(e.topic);
  }
  return titles;
}

export function autoNote(state: ConversationState): string {
  const { facts } = state;
  const topics = topicsDiscussed(state);
  const parts: string[] = [];
  parts.push(
    facts.timelineMonths !== null
      ? `I’d like to buy my first home in about ${horizon(facts.timelineMonths)}.`
      : 'I’d like to buy my first home.',
  );
  if (facts.homeSavings !== null && facts.target !== null) {
    parts.push(`I have ${money(facts.homeSavings)} set aside for this goal, toward my own target of ${money(facts.target)}.`);
  } else if (facts.homeSavings !== null) {
    parts.push(`I have ${money(facts.homeSavings)} set aside for this goal.`);
  } else if (facts.target !== null) {
    parts.push(`My own savings target is ${money(facts.target)}.`);
  }
  if (facts.reservedSeparately) parts.push(`I’m keeping ${money(facts.reservedSeparately)} separate for emergencies.`);
  if (facts.monthly !== null) {
    parts.push(
      facts.monthly > 0
        ? `I explored saving ${money(facts.monthly)} a month as a scenario.`
        : 'I can’t set money aside each month right now.',
    );
  }
  if (topics.length) parts.push(`I asked about: ${topics.slice(0, 6).join('; ')}.`);
  return parts.join(' ');
}

export function buildSummary(state: ConversationState): Summary {
  const { facts } = state;
  const input = scenarioInput(facts);
  const result = input ? calculateScenario(input) : null;
  return {
    firstName: state.profile.firstName,
    goal: 'Save for a first home',
    timeline:
      facts.timelineMonths !== null
        ? `${horizon(facts.timelineMonths)}${facts.timelineBand ? ` · ${BAND_LABEL[facts.timelineBand].toLowerCase()}` : ''}`
        : null,
    dataSource:
      facts.dataSource === 'snapshot'
        ? 'Account snapshot (synthetic) plus your answers'
        : facts.dataSource === 'manual'
          ? 'Only details you shared (account snapshot not used)'
          : 'General information (no account data used)',
    startingSavings: facts.homeSavings,
    reservedSeparately: facts.reservedSeparately,
    target: facts.target,
    monthly: facts.monthly,
    months: facts.timelineMonths,
    result,
    assumptions: CALCULATION_ASSUMPTIONS,
    topics: topicsDiscussed(state),
    sources: state.sourcesCited.map(getEntry).filter((e): e is KnowledgeEntry => Boolean(e)),
    heldElsewhere: facts.homeSavingsHeldElsewhere,
    nextSteps: state.nextSteps.map((s) => NEXT_STEP_LABEL[s]),
    questions: state.supportQuestions,
    note: state.handoffNoteEdited ? state.handoffNote : autoNote(state),
    complete: input !== null,
  };
}
