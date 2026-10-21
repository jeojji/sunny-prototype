/**
 * Deterministic conversation engine: (state, customer turn) -> next state.
 *
 * Pure: no timers, randomness or I/O. Facts and derived numbers are owned
 * here. In AI mode the model's proposed effects arrive via 'aiTurn' and are
 * re-validated before anything changes, so the model can never alter figures.
 */
import type { CustomerProfile } from '../data/customers';
import { TOPICS, type TopicId } from '../data/education';
import {
  bandForMonths,
  calculateScenario,
  isValidAmount,
  isValidMonths,
  monthlyCashFlow,
  type ScenarioInput,
} from '../lib/calc';
import { horizon, money } from '../lib/format';
import { checkFactValue, type FactField } from '../shared/api';
import { validateSourceIds } from '../shared/knowledge';
import { script } from './script';
import type {
  ConfirmedFacts,
  ConversationState,
  CustomerTurn,
  EditableField,
  EngineMode,
  Message,
  MessageCard,
  Step,
} from './types';

export const EMPTY_FACTS: ConfirmedFacts = {
  goalConfirmed: false,
  dataSource: null,
  timelineBand: null,
  timelineMonths: null,
  target: null,
  homeSavings: null,
  reservedSeparately: null,
  homeSavingsHeldElsewhere: false,
  monthly: null,
};

export function createInitialState(profile: CustomerProfile, mode: EngineMode = 'scripted'): ConversationState {
  return {
    profile,
    mode,
    view: 'dashboard',
    step: 'intro',
    resumeStep: null,
    facts: { ...EMPTY_FACTS },
    offer: null,
    permissionPending: false,
    suggestions: [],
    pending: null,
    activeTopic: null,
    topicsExplored: [],
    sourcesCited: [],
    supportQuestions: [],
    handoffNote: '',
    handoffNoteEdited: false,
    nextSteps: [],
    messages: [],
    seq: 0,
  };
}

// ---------------------------------------------------------------------------
// Derived values (pure helpers shared with UI, summary and the API request)
// ---------------------------------------------------------------------------

/** Scenario inputs from confirmed facts, or null if any are still unknown. */
export function scenarioInput(facts: ConfirmedFacts): ScenarioInput | null {
  const { homeSavings, target, monthly, timelineMonths } = facts;
  if (homeSavings === null || target === null || monthly === null || timelineMonths === null) return null;
  return { startingSavings: homeSavings, target, monthly, months: timelineMonths };
}

export function hasAnyGoalFact(facts: ConfirmedFacts): boolean {
  return [facts.target, facts.homeSavings, facts.monthly, facts.timelineMonths, facts.reservedSeparately].some((v) => v !== null);
}

/** Monthly cash flow from the snapshot, only when the customer shared it. */
export function sharedCashFlow(state: ConversationState): number | null {
  if (state.facts.dataSource !== 'snapshot') return null;
  const p = state.profile;
  return monthlyCashFlow(p.monthlyIncome, p.monthlyExpenses, p.otherSavingsCommitments);
}

export const QUESTION_STEPS: Step[] = [
  'permission',
  'timeline',
  'timelineMonths',
  'target',
  'homeSavings',
  'homeSavingsAmount',
  'monthly',
];

const EDIT_STEP: Record<EditableField, Step> = {
  timelineMonths: 'editTimeline',
  target: 'editTarget',
  homeSavings: 'editHomeSavings',
  monthly: 'editMonthly',
};

const TRANSIENT: Step[] = ['editPicker', 'editTimeline', 'editTarget', 'editHomeSavings', 'editMonthly', 'confirmRestart', 'confirmElsewhere', 'reserveAmount'];
export const isTransientStep = (s: Step) => TRANSIENT.includes(s);

function describeField(facts: ConfirmedFacts, field: EditableField): string {
  const v = facts[field];
  if (v === null) return 'not set yet';
  return field === 'timelineMonths' ? horizon(v) : field === 'monthly' ? `${money(v)} a month` : money(v);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** Mutable working copy used inside a single reduce call. */
type Draft = ConversationState;

function push(d: Draft, msg: Omit<Message, 'id'>) {
  d.seq += 1;
  d.messages = [...d.messages, { id: `m${d.seq}`, ...msg }];
}

function say(d: Draft, text: string, card?: MessageCard, extra?: Partial<Message>) {
  push(d, { role: 'sunny', text, ...(card ? { card } : {}), ...extra });
}

function customerSays(d: Draft, text: string) {
  push(d, { role: 'customer', text });
}

function cite(d: Draft, ids: string[]) {
  for (const id of ids) if (!d.sourcesCited.includes(id)) d.sourcesCited = [...d.sourcesCited, id];
}

/** Emit the question for a step and make it current. */
function ask(d: Draft, step: Step) {
  d.step = step;
  const { profile, facts } = d;
  switch (step) {
    case 'intro':
      say(d, script.whatFirst);
      break;
    case 'permission':
      say(d, script.permission);
      break;
    case 'timeline':
      say(d, script.timeline);
      break;
    case 'timelineMonths':
      say(d, script.timelineMonths(facts.timelineBand ?? 'oneToFive'));
      break;
    case 'target':
      say(d, script.target);
      break;
    case 'homeSavings':
      if (facts.dataSource === 'snapshot') {
        say(d, profile.savingsBalance > 0 ? script.homeSavingsSnapshot(profile.savingsBalance) : script.homeSavingsSnapshotEmpty);
      } else {
        say(d, script.homeSavingsManual);
      }
      break;
    case 'homeSavingsAmount':
      say(d, script.homeSavingsAmount);
      break;
    case 'confirmElsewhere':
      say(d, script.exceedsSnapshot(d.pending?.amount ?? 0, profile.savingsBalance));
      break;
    case 'reserveAmount':
      say(d, script.reserveAsk);
      break;
    case 'monthly': {
      const cf = sharedCashFlow(d);
      if (cf === null) say(d, script.monthlyManual);
      else if (cf <= 0) say(d, script.monthlyNoSurplus);
      else say(d, script.monthlyWithCashFlow(cf));
      break;
    }
    case 'explore':
      say(d, script.explore);
      break;
    case 'nextSteps':
      say(d, script.nextSteps);
      break;
    case 'editPicker':
      say(d, script.editPicker);
      break;
    case 'editTimeline':
      say(d, script.editField('timelineMonths', describeField(facts, 'timelineMonths')));
      break;
    case 'editTarget':
      say(d, script.editField('target', describeField(facts, 'target')));
      break;
    case 'editHomeSavings':
      say(d, script.editField('homeSavings', describeField(facts, 'homeSavings')));
      break;
    case 'editMonthly':
      say(d, script.editField('monthly', describeField(facts, 'monthly')));
      break;
    case 'confirmRestart':
      say(d, script.confirmRestart);
      break;
  }
}

/** Present the scenario using current facts. */
function presentScenario(d: Draft, opts: { withBand: boolean }) {
  const input = scenarioInput(d.facts);
  if (!input) return;
  const r = calculateScenario(input);
  const card: MessageCard = { kind: 'scenario', snapshot: { ...input } };
  // The scenario is now the subject; "explain more simply" shouldn't refer to an earlier topic.
  d.activeTopic = null;
  if (r.targetAlreadyReached) {
    say(d, script.scenarioReached(input.startingSavings, input.target), card);
  } else if (input.monthly === 0) {
    say(d, script.scenarioZero(input.startingSavings, input.target, r.gap), card);
  } else {
    say(d, script.scenarioIntro, card);
    say(d, script.scenarioResult(input.monthly, input.months, r, input.target));
  }
  if (opts.withBand && d.mode === 'scripted') {
    if (input.monthly === 0 && !r.targetAlreadyReached) say(d, script.zeroBranch);
    else if (d.facts.timelineBand) say(d, script.band(d.facts.timelineBand));
  }
}

/** Scripted goal flow: ask the first unknown question, or present the scenario once complete. */
function advance(d: Draft, opts: { withBand: boolean } = { withBand: true }) {
  const f = d.facts;
  if (!f.goalConfirmed) return ask(d, 'intro');
  if (!f.dataSource) return ask(d, 'permission');
  if (f.timelineMonths === null) return ask(d, f.timelineBand ? 'timelineMonths' : 'timeline');
  if (f.target === null) return ask(d, 'target');
  if (f.homeSavings === null) return ask(d, 'homeSavings');
  if (f.monthly === null) return ask(d, 'monthly');
  d.step = 'explore';
  presentScenario(d, opts);
}

/**
 * After a fact changes outside the step-by-step flow: show refreshed numbers if
 * complete; continue the scripted goal flow if one is in progress; otherwise stay put.
 */
function afterFactChange(d: Draft, opts: { withBand: boolean }) {
  if (isTransientStep(d.step)) {
    d.step = d.resumeStep ?? (d.facts.goalConfirmed ? 'explore' : 'intro');
    d.resumeStep = null;
  }
  if (scenarioInput(d.facts)) {
    if (d.mode === 'scripted' && d.step !== 'nextSteps' && d.step !== 'intro') d.step = 'explore';
    presentScenario(d, opts);
  } else if (d.mode === 'scripted' && d.facts.goalConfirmed) {
    advance(d, opts);
  }
}

function snapshotSavings(d: Draft): number | null {
  return d.facts.dataSource === 'snapshot' ? d.profile.savingsBalance : null;
}

/** Reserved money on the snapshot route = savings balance − home-goal savings (never negative). */
function reservedFor(d: Draft, home: number): number | null {
  const savings = snapshotSavings(d);
  return savings === null ? d.facts.reservedSeparately : Math.max(0, savings - home);
}

/**
 * Apply a home-savings amount. On the snapshot route, an amount above the
 * savings balance needs clarification (money held elsewhere?) first.
 * Returns false if clarification was requested.
 */
function applyHomeSavings(d: Draft, amount: number): boolean {
  const savings = snapshotSavings(d);
  if (savings !== null && amount > savings) {
    if (!isTransientStep(d.step)) d.resumeStep = d.step;
    d.pending = { field: 'homeSavings', amount };
    ask(d, 'confirmElsewhere');
    return false;
  }
  d.facts.homeSavings = amount;
  d.facts.homeSavingsHeldElsewhere = false;
  d.facts.reservedSeparately = reservedFor(d, amount);
  return true;
}

function previousStep(step: Step): Step | null {
  const map: Partial<Record<Step, Step>> = {
    permission: 'intro',
    timeline: 'permission',
    timelineMonths: 'timeline',
    target: 'timelineMonths',
    homeSavings: 'target',
    homeSavingsAmount: 'homeSavings',
    monthly: 'homeSavings',
    explore: 'monthly',
    nextSteps: 'explore',
  };
  return map[step] ?? null;
}

function suggestedQuestions(d: Draft, fromInvestment: boolean): string[] {
  const f = d.facts;
  const qs: string[] = [];
  if (fromInvestment) qs.push('Which savings or investment options might suit my timeline and situation?');
  if (d.topicsExplored.some((t) => t === 'fhsa' || t === 'fhsaTangerine') || f.timelineBand === 'oneToFive' || f.timelineBand === 'overFive') {
    qs.push('Does Tangerine offer an FHSA, and how would its rules apply to me?');
  }
  if (f.timelineBand === 'underOne') qs.push('What should I do to get ready for a mortgage pre-approval?');
  const input = scenarioInput(f);
  if (input) {
    const r = calculateScenario(input);
    if (input.monthly === 0 && !r.targetAlreadyReached) qs.push('How could I start building savings with my current budget?');
    else if (r.valid && r.remainingGap > 0) qs.push('What are my options if I don’t reach my target in time?');
  }
  if (qs.length === 0) qs.push('What information should I prepare before a mortgage conversation?');
  return qs;
}

function openTopic(d: Draft, topic: TopicId, simple: boolean) {
  const t = TOPICS[topic];
  d.activeTopic = topic;
  if (!d.topicsExplored.includes(topic)) d.topicsExplored = [...d.topicsExplored, topic];
  cite(d, t.sources);
  const text = simple ? t.simple : t.body.join('\n\n');
  say(d, text, !simple && t.points ? { kind: 'education', topic } : undefined, { sources: t.sources });
  if (QUESTION_STEPS.includes(d.step) || isTransientStep(d.step)) {
    say(d, script.resumeHint);
    d.offer = 'detour';
  }
}

/** Apply validated AI-proposed fact changes; returns human-readable change descriptions. */
function applyAiFacts(d: Draft, patch: Partial<Record<FactField, number>>, heldElsewhere: boolean): string[] {
  const changes: string[] = [];
  const savings = snapshotSavings(d);
  const order: FactField[] = ['reservedSeparately', 'homeSavings', 'target', 'monthly', 'timelineMonths'];
  for (const field of order) {
    const v = patch[field];
    if (v === undefined || checkFactValue(field, v) !== null) continue;
    if (field === 'homeSavings' && savings !== null && v > savings && !heldElsewhere) continue;
    if (field === 'reservedSeparately' && savings !== null && v > savings) continue;
    switch (field) {
      case 'reservedSeparately':
        d.facts.reservedSeparately = v;
        changes.push(`kept separate ${money(v)}`);
        // Same savings balance: a reserve without a matching home amount implies home = savings − reserve.
        if (savings !== null && patch.homeSavings === undefined && !d.facts.homeSavingsHeldElsewhere &&
          (d.facts.homeSavings === null || d.facts.homeSavings + v > savings)) {
          d.facts.homeSavings = savings - v;
          changes.push(`saved for this goal ${money(savings - v)}`);
        }
        break;
      case 'homeSavings':
        d.facts.homeSavings = v;
        d.facts.homeSavingsHeldElsewhere = savings !== null && v > savings;
        changes.push(`saved for this goal ${money(v)}${d.facts.homeSavingsHeldElsewhere ? ' (incl. money held elsewhere)' : ''}`);
        break;
      case 'target':
        d.facts.target = v;
        changes.push(`target ${money(v)}`);
        break;
      case 'monthly':
        d.facts.monthly = v;
        changes.push(`monthly amount ${money(v)}`);
        break;
      case 'timelineMonths':
        d.facts.timelineMonths = v;
        d.facts.timelineBand = bandForMonths(v);
        changes.push(`timeline ${horizon(v)}`);
        break;
    }
  }
  return changes;
}

export function reduce(state: ConversationState, turn: CustomerTurn): ConversationState {
  const { event } = turn;

  // Non-conversational updates: no messages, keep the current offer.
  switch (event.type) {
    case 'setHandoffNote':
      return { ...state, handoffNote: event.text, handoffNoteEdited: true };
    case 'setSupportQuestions':
      return { ...state, supportQuestions: event.questions };
    case 'toggleNextStep': {
      const has = state.nextSteps.includes(event.step);
      return { ...state, nextSteps: has ? state.nextSteps.filter((s) => s !== event.step) : [...state.nextSteps, event.step] };
    }
    case 'setView':
      return { ...state, view: event.view };
    case 'loadProfile':
      return createInitialState(event.profile, event.mode ?? state.mode);
    case 'confirmRestart': {
      const fresh = createInitialState(state.profile, state.mode);
      return reduce(fresh, { event: { type: 'open' } });
    }
    case 'clearAiError': {
      const messages = [...state.messages];
      while (messages.length && messages.at(-1)!.card?.kind === 'error') messages.pop();
      return { ...state, messages };
    }
    default:
      break;
  }

  const d: Draft = { ...state, facts: { ...state.facts }, offer: null };
  if (turn.say) customerSays(d, turn.say);

  switch (event.type) {
    case 'open':
      d.view = 'chat';
      if (state.messages.length === 0) {
        say(d, script.greeting(d.profile));
        say(d, script.scopeNote);
        d.step = 'intro';
      }
      break;

    case 'setMode':
      if (d.mode !== event.mode) {
        d.mode = event.mode;
        d.suggestions = [];
        d.permissionPending = false;
        if (event.announce && d.messages.length) say(d, event.mode === 'scripted' ? script.modeScripted : script.modeAi, undefined, { local: true });
      }
      break;

    // ---------------------------------------------------------------- AI mode
    case 'customerMessage':
      d.view = 'chat';
      d.suggestions = [];
      customerSays(d, event.text.trim());
      break;

    case 'snapshotDecision':
      d.permissionPending = false;
      d.facts.dataSource = event.allow ? 'snapshot' : 'manual';
      break;

    case 'aiTurn': {
      const r = event.response;
      const sources = validateSourceIds(r.sourceIds);
      cite(d, sources);
      say(d, r.reply, undefined, { ai: true, ...(sources.length ? { sources } : {}) });
      d.suggestions = (r.suggestions ?? []).filter((s) => typeof s === 'string' && s.trim()).slice(0, 4);
      for (const effect of r.effects ?? []) {
        switch (effect.type) {
          case 'factsUpdated': {
            const changes = applyAiFacts(d, effect.patch, effect.heldElsewhere === true);
            if (changes.length) say(d, '', { kind: 'factsUpdated', changes }, { local: true });
            break;
          }
          case 'requestSnapshotPermission':
            if (d.facts.dataSource !== 'snapshot') d.permissionPending = true;
            break;
          case 'scenario': {
            const result = calculateScenario(effect.input);
            if (result.valid) {
              say(d, '', { kind: 'scenario', snapshot: { ...effect.input }, hypothetical: effect.hypothetical }, { local: true });
            }
            break;
          }
          case 'summaryReady':
            say(d, '', { kind: 'action', action: 'summary' }, { local: true });
            break;
          case 'handoffReady': {
            const merged = [...d.supportQuestions];
            for (const q of effect.questions) if (q.trim() && !merged.includes(q.trim())) merged.push(q.trim());
            d.supportQuestions = merged.slice(0, 8);
            say(d, '', { kind: 'action', action: 'handoff' }, { local: true });
            break;
          }
        }
      }
      break;
    }

    case 'aiError':
      say(d, '', { kind: 'error', code: event.code, message: event.message }, { local: true });
      break;

    // ---------------------------------------------------------- scripted mode
    case 'confirmGoal':
      if (d.facts.goalConfirmed) {
        say(d, script.carryOn);
        ask(d, d.step === 'intro' ? 'explore' : d.step);
        break;
      }
      d.facts.goalConfirmed = true;
      say(d, script.goalAck);
      advance(d);
      break;

    case 'chooseDataSource':
      if (state.facts.dataSource && state.facts.dataSource !== event.source) {
        // A route change invalidates the savings split; ask again.
        d.facts.homeSavings = null;
        d.facts.reservedSeparately = null;
        d.facts.homeSavingsHeldElsewhere = false;
      }
      d.facts.dataSource = event.source;
      d.permissionPending = false;
      if (event.source === 'snapshot') say(d, script.snapshotAck, { kind: 'snapshot' });
      else say(d, script.manualAck);
      if (d.facts.goalConfirmed) advance(d);
      break;

    case 'setTimelineBand':
      d.facts.timelineBand = event.band;
      ask(d, 'timelineMonths');
      break;

    case 'setTimelineMonths':
      if (!isValidMonths(event.months)) {
        say(d, script.invalidMonths);
        break;
      }
      d.facts.timelineMonths = event.months;
      d.facts.timelineBand = bandForMonths(event.months);
      say(d, script.timelineAck(event.months));
      advance(d);
      break;

    case 'setTarget':
      if (!isValidAmount(event.amount) || event.amount <= 0) {
        say(d, script.invalidTarget);
        break;
      }
      d.facts.target = event.amount;
      say(d, script.targetAck(event.amount));
      advance(d);
      break;

    case 'askHomeSavingsAmount':
      ask(d, 'homeSavingsAmount');
      break;

    case 'setHomeSavings': {
      if (!isValidAmount(event.amount)) {
        say(d, event.amount < 0 ? script.negativeAmount : script.invalidAmount);
        break;
      }
      if (!applyHomeSavings(d, event.amount)) break;
      const home = event.amount;
      const reserved = d.facts.reservedSeparately;
      if (home === 0) say(d, script.homeSavingsAckZero);
      else if (d.facts.dataSource === 'snapshot' && reserved !== null && reserved > 0) say(d, script.homeSavingsAckReserved(reserved, home));
      else if (d.facts.dataSource === 'snapshot') say(d, script.homeSavingsAckAll(home));
      else say(d, script.homeSavingsAck(home));
      advance(d);
      break;
    }

    case 'confirmHeldElsewhere': {
      const pending = d.pending;
      d.pending = null;
      if (!pending) {
        ask(d, d.resumeStep ?? 'explore');
        break;
      }
      if (!event.yes) {
        d.resumeStep = null;
        ask(d, 'homeSavingsAmount');
        break;
      }
      d.facts.homeSavings = pending.amount;
      d.facts.homeSavingsHeldElsewhere = true;
      d.facts.reservedSeparately = 0;
      say(d, script.heldElsewhereAck(pending.amount));
      const resume = d.resumeStep;
      d.resumeStep = null;
      d.step = resume && !isTransientStep(resume) ? resume : 'explore';
      if (scenarioInput(d.facts)) {
        d.step = d.mode === 'scripted' ? 'explore' : d.step;
        presentScenario(d, { withBand: false });
      } else if (d.facts.goalConfirmed) {
        advance(d);
      }
      break;
    }

    case 'setEmergencyReserve': {
      if (event.amount === null) {
        if (!isTransientStep(d.step)) d.resumeStep = d.step;
        ask(d, 'reserveAmount');
        break;
      }
      if (!isValidAmount(event.amount)) {
        say(d, event.amount < 0 ? script.negativeAmount : script.invalidAmount);
        break;
      }
      const savings = snapshotSavings(d);
      if (savings !== null && event.amount > savings) {
        if (!isTransientStep(d.step)) d.resumeStep = d.step;
        say(d, script.reserveTooLarge(event.amount, savings));
        d.step = 'reserveAmount';
        break;
      }
      d.facts.reservedSeparately = event.amount;
      if (savings !== null) {
        d.facts.homeSavings = savings - event.amount;
        d.facts.homeSavingsHeldElsewhere = false;
        say(d, script.homeSavingsAckReserved(event.amount, d.facts.homeSavings));
      } else {
        say(d, script.reserveManualAck(event.amount, d.facts.homeSavings));
      }
      afterFactChange(d, { withBand: false });
      break;
    }

    case 'invalidAmount':
      say(d, event.reason === 'negative' ? script.negativeAmount : script.unclearAmount);
      break;

    case 'setMonthly': {
      if (!isValidAmount(event.amount)) {
        say(d, event.amount < 0 ? script.negativeAmount : script.invalidAmount);
        break;
      }
      d.facts.monthly = event.amount;
      const cf = sharedCashFlow(d);
      if (event.amount === 0) say(d, script.monthlyZero);
      else if (cf !== null && cf > 0 && event.amount > cf) say(d, script.monthlyAboveCashFlow(event.amount, cf));
      else say(d, script.monthlyAck(event.amount));
      advance(d);
      break;
    }

    case 'openTopic':
      openTopic(d, event.topic, false);
      break;

    case 'simpler':
      if (d.activeTopic) openTopic(d, d.activeTopic, true);
      else say(d, script.simplerNone);
      break;

    case 'askInvestment':
      say(d, script.investment);
      d.offer = 'investment';
      break;

    case 'prepareSupport':
    case 'showHandoff': {
      const fromInvestment = event.type === 'prepareSupport' && state.offer === 'investment';
      const merged = [...d.supportQuestions];
      for (const q of suggestedQuestions(d, fromInvestment)) if (!merged.includes(q)) merged.push(q);
      d.supportQuestions = merged;
      say(d, script.supportPrepared);
      d.view = 'handoff';
      break;
    }

    case 'continue':
      ask(d, d.step);
      break;

    case 'back': {
      if (isTransientStep(d.step)) {
        const resume = d.resumeStep ?? (d.facts.goalConfirmed ? 'explore' : 'intro');
        d.resumeStep = null;
        d.pending = null;
        say(d, script.carryOn);
        ask(d, resume);
        break;
      }
      const prev = previousStep(d.step);
      ask(d, prev ?? d.step);
      break;
    }

    case 'pickEdit':
      d.view = 'chat';
      if (!isTransientStep(d.step)) d.resumeStep = d.step;
      ask(d, 'editPicker');
      break;

    case 'startEdit':
      d.view = 'chat';
      if (!isTransientStep(d.step)) d.resumeStep = d.step;
      ask(d, EDIT_STEP[event.field]);
      break;

    case 'updateFacts': {
      const changes: string[] = [];
      const p = event.patch;
      const bandBefore = d.facts.timelineBand;
      if (p.timelineMonths !== undefined && p.timelineMonths !== null) {
        if (!isValidMonths(p.timelineMonths)) {
          say(d, script.invalidMonths);
          break;
        }
        d.facts.timelineMonths = p.timelineMonths;
        d.facts.timelineBand = bandForMonths(p.timelineMonths);
        changes.push(`timeline ${horizon(p.timelineMonths)}`);
      }
      if (p.target !== undefined && p.target !== null) {
        if (!isValidAmount(p.target) || p.target <= 0) {
          say(d, p.target < 0 ? script.negativeAmount : script.invalidTarget);
          break;
        }
        d.facts.target = p.target;
        changes.push(`savings target ${money(p.target)}`);
      }
      if (p.monthly !== undefined && p.monthly !== null) {
        if (!isValidAmount(p.monthly)) {
          say(d, p.monthly < 0 ? script.negativeAmount : script.invalidAmount);
          break;
        }
        d.facts.monthly = p.monthly;
        changes.push(`monthly amount ${money(p.monthly)}`);
      }
      if (p.homeSavings !== undefined && p.homeSavings !== null) {
        if (!isValidAmount(p.homeSavings)) {
          say(d, p.homeSavings < 0 ? script.negativeAmount : script.invalidAmount);
          break;
        }
        if (changes.length) say(d, script.updated(changes));
        if (!applyHomeSavings(d, p.homeSavings)) break;
        const reserved = d.facts.reservedSeparately;
        say(d, script.updated([`starting savings ${money(p.homeSavings)}` + (d.facts.dataSource === 'snapshot' && reserved ? `, with ${money(reserved)} kept separate` : '')]));
        afterFactChange(d, { withBand: bandBefore !== d.facts.timelineBand && !event.brief });
        break;
      }
      if (changes.length) say(d, script.updated(changes));
      afterFactChange(d, { withBand: bandBefore !== d.facts.timelineBand && !event.brief });
      break;
    }

    case 'pickNextSteps':
      ask(d, 'nextSteps');
      break;

    case 'chooseNextSteps':
      d.nextSteps = event.steps;
      say(d, script.nextStepsAck(event.steps.length));
      d.step = 'explore';
      break;

    case 'showSummary':
      say(d, script.summaryReady);
      d.view = 'summary';
      break;

    case 'requestRestart':
      if (!isTransientStep(d.step)) d.resumeStep = d.step;
      ask(d, 'confirmRestart');
      break;

    case 'cancel': {
      const resume = d.resumeStep ?? (d.facts.goalConfirmed ? 'explore' : 'intro');
      d.resumeStep = null;
      d.pending = null;
      say(d, script.carryOn);
      if (resume === 'explore' && !scenarioInput(d.facts) && d.facts.goalConfirmed) advance(d);
      else ask(d, resume);
      break;
    }

    case 'unsupported':
      say(d, script.unsupported);
      d.offer = 'menu';
      break;

    case 'help':
      say(d, script.help);
      d.offer = 'menu';
      break;
  }

  return d;
}
