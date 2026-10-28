/**
 * Deterministic conversation engine: (state, customer turn) -> next state.
 *
 * Pure: no timers, randomness or I/O. Balances come from the synthetic
 * relationship, allocations and goals only from what the customer confirms,
 * and every number from code. In AI mode the model's proposed effects arrive
 * via 'aiTurn' and are re-validated here before anything changes.
 */
import { balancesOn, visibleHistory, type Relationship } from '../data/customers';
import { TOPICS, type TopicId } from '../data/education';
import { applyAllocations, summarizeAccount, type Allocation } from '../domain/allocations';
import { DEFAULT_SIGNAL_CONFIG, evaluateElevatedBalance, type SignalConfig, type SignalResult } from '../domain/signal';
import { projectWithoutReturns } from '../lib/calc';
import { GOALS, HORIZONS, NEXT_STEPS, type ChatEffect } from '../shared/api';
import { validateSourceIds } from '../shared/knowledge';
import { getOffering, offeringPlan, OFFERINGS, validateOfferingIds } from '../shared/offerings';
import { cleanSuggestions, latestCustomerText } from './navigation';
import { GOAL_LABEL, HORIZON_LABEL, NEXT_STEP_LABEL, script } from './script';
import type {
  AllocationSnapshot,
  ConversationState,
  CustomerTurn,
  EngineMode,
  Memory,
  MessageCard,
  Message,
  NextStepId,
  Origin,
  Stage,
} from './types';

export const NUDGE_SNOOZE_DAYS = 30;
export const REMIND_LATER_DAYS = 14;

export function createMemory(): Memory {
  return {
    permission: 'not_asked',
    allocations: [],
    goal: null,
    horizon: null,
    nextStep: null,
    prompt: null,
    topicsExplored: [],
    offeringsShown: [],
    offeringsExplored: [],
    sourcesCited: [],
    supportQuestions: [],
    scenario: null,
    nextStepDone: false,
    completedSteps: [],
    prefs: { earmarked: false, earmarkNote: null, dismissedUntil: null, checkinsStopped: false, remindAfter: null },
    lastConversationDay: null,
    visit: 1,
  };
}

/**
 * Make saved memory safe to use: fill fields added in later versions and map
 * the old `offeringsViewed` (which meant "shown") to `offeringsShown`.
 * Account-data permission never carries over into a new session.
 */
export function normalizeMemory(raw: unknown): Memory {
  const base = createMemory();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Memory> & { offeringsViewed?: string[] };
  return {
    ...base,
    ...r,
    permission: 'not_asked',
    offeringsShown: r.offeringsShown ?? r.offeringsViewed ?? [],
    offeringsExplored: r.offeringsExplored ?? [],
    nextStepDone: r.nextStepDone ?? false,
    completedSteps: r.completedSteps ?? [],
    prefs: { ...base.prefs, ...(r.prefs ?? {}) },
  };
}

export function createInitialState(
  profile: Relationship,
  opts: { memory?: Memory; todayIndex?: number; mode?: EngineMode; signalConfig?: SignalConfig } = {},
): ConversationState {
  return {
    profile,
    signalConfig: opts.signalConfig ?? DEFAULT_SIGNAL_CONFIG,
    todayIndex: opts.todayIndex ?? profile.spec.todayIndex,
    mode: opts.mode ?? 'scripted',
    view: 'dashboard',
    stage: 'start',
    resumeStage: null,
    origin: null,
    memory: opts.memory ?? createMemory(),
    offer: null,
    permissionPending: false,
    suggestions: [],
    pendingAllocations: null,
    activeTopic: null,
    notice: null,
    handoffNote: '',
    handoffNoteEdited: false,
    messages: [],
    seq: 0,
  };
}

// ---------------------------------------------------------------------------
// Derived values (pure; used by UI, summary and the API request)
// ---------------------------------------------------------------------------

export function currentBalances(state: ConversationState) {
  return balancesOn(state.profile, state.todayIndex);
}

export function signalFor(state: ConversationState): SignalResult {
  return evaluateElevatedBalance({
    history: visibleHistory(state.profile, state.todayIndex),
    todayIndex: state.todayIndex,
    config: state.signalConfig,
    reviewFlag: state.profile.reviewFlag,
    prefs: { earmarked: state.memory.prefs.earmarked, dismissedUntil: state.memory.prefs.dismissedUntil },
  });
}

export function allocationSnapshot(state: ConversationState): AllocationSnapshot {
  const b = currentBalances(state);
  const s = summarizeAccount('chequing', b.chequing, state.memory.allocations);
  return { balance: b.chequing, items: s.items, unassigned: s.unassigned, savingsBalance: b.savings };
}

/** A later-visit check-in, only when it reflects a real saved next step and the customer hasn't opted out. */
export function pendingCheckin(state: ConversationState): { text: string; step: NextStepId } | null {
  const m = state.memory;
  if (!m.nextStep || m.nextStep === 'not_proceeding' || m.nextStepDone || m.prefs.checkinsStopped) return null;
  if (m.lastConversationDay === null || state.todayIndex <= m.lastConversationDay) return null;
  if (m.prefs.remindAfter !== null && state.todayIndex < m.prefs.remindAfter) return null;
  return { text: script.checkinPrompt(m), step: m.nextStep };
}

export type DashboardCard =
  | { kind: 'checkin'; text: string; step: NextStepId }
  | { kind: 'nudge'; signal: SignalResult }
  | { kind: 'notice'; text: string; undo?: 'earmark' }
  | null;

/**
 * The customer already engaged with the opportunity nudge (said what the money
 * is for, set a goal or chose a next step). Repeating it would be pushy;
 * continuity happens through check-ins instead.
 */
export function engagedWithNudge(state: ConversationState): boolean {
  const m = state.memory;
  return m.prompt === 'nudge' && (m.allocations.length > 0 || m.goal !== null || m.nextStep !== null);
}

export function dashboardCard(state: ConversationState): DashboardCard {
  const checkin = pendingCheckin(state);
  if (checkin) return { kind: 'checkin', ...checkin };
  if (state.notice) return { kind: 'notice', ...state.notice };
  const signal = signalFor(state);
  if (signal.show && !engagedWithNudge(state)) return { kind: 'nudge', signal };
  return null;
}

export function hasPlan(state: ConversationState): boolean {
  const m = state.memory;
  return m.allocations.length > 0 || m.goal !== null || m.nextStep !== null || m.scenario !== null;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

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
function mem(d: Draft): Memory {
  if (d.memory === undefined) throw new Error('memory missing');
  return d.memory;
}
function cite(d: Draft, ids: string[]) {
  const m = mem(d);
  for (const id of ids) if (!m.sourcesCited.includes(id)) m.sourcesCited = [...m.sourcesCited, id];
}

const QUESTION_STAGES: Stage[] = ['permission', 'purpose', 'purposeAmounts', 'confirmAllocations', 'clarifyOver', 'goal', 'horizon', 'scenario'];

/** Re-ask the question for a stage. */
function ask(d: Draft, stage: Stage) {
  d.stage = stage;
  switch (stage) {
    case 'start':
      say(d, script.greetingSelf(d.profile.firstName));
      break;
    case 'permission':
      say(d, script.permissionAsk);
      break;
    case 'purpose':
      say(d, script.purposeAsk);
      break;
    case 'purposeAmounts':
      say(d, script.allocationsReenter);
      break;
    case 'confirmAllocations':
      confirmText(d);
      break;
    case 'goal':
      say(d, script.goalAsk);
      break;
    case 'horizon':
      say(d, script.horizonAsk);
      break;
    case 'explore':
      say(d, script.nextStepAsk);
      break;
    case 'scenario':
      say(d, script.scenarioIntro);
      break;
    case 'clarifyOver': {
      const b = currentBalances(d);
      const total = (d.pendingAllocations ?? []).reduce((s, a) => s + a.amount, 0);
      say(d, script.allocationsOver(total, b.chequing));
      break;
    }
    case 'earmarked':
      say(d, script.earmarkedAck(mem(d).prefs.earmarkNote));
      break;
    case 'confirmRestart':
      say(d, script.confirmRestart);
      break;
  }
}

function confirmText(d: Draft) {
  const snap = allocationSnapshot(d);
  if (mem(d).permission === 'granted' || d.mode === 'scripted') {
    const general = mem(d).permission === 'declined';
    say(
      d,
      general ? script.allocationsAckGeneral(snap.items) : script.allocationsAck(snap.balance, snap.items, snap.unassigned, snap.savingsBalance),
      { kind: 'allocations', snapshot: snap },
      general ? {} : { accountDetail: true },
    );
  } else {
    say(d, script.allocationsAckGeneral(snap.items));
  }
}

function openTopic(d: Draft, topic: TopicId, simple: boolean) {
  const t = TOPICS[topic];
  const m = mem(d);
  d.activeTopic = topic;
  if (!m.topicsExplored.includes(topic)) m.topicsExplored = [...m.topicsExplored, topic];
  cite(d, t.sources);
  say(d, simple ? t.simple : t.body.join('\n\n'), !simple && t.points ? { kind: 'education', topic } : undefined, t.sources.length ? { sources: t.sources } : {});
  if (QUESTION_STAGES.includes(d.stage)) {
    say(d, script.resumeHint);
    d.offer = 'detour';
  }
}

function markShown(d: Draft, ids: string[]) {
  const m = mem(d);
  for (const id of ids) if (!m.offeringsShown.includes(id)) m.offeringsShown = [...m.offeringsShown, id];
  cite(d, [...new Set(ids.flatMap((id) => getOffering(id)?.sources ?? []))]);
}

/** Initial product exploration, shaped by goal and timeline (shared rule with the server). */
function showOfferings(d: Draft) {
  const m = mem(d);
  const plan = offeringPlan(m.goal?.type ?? null, m.horizon);
  markShown(d, plan.ids);
  say(d, script.offeringsIntroFor(m.goal?.type ?? null, m.horizon, plan.emphasis), {
    kind: 'offerings',
    ids: plan.ids,
    reason: script.offeringsReason(m.goal?.type ?? null, m.horizon),
  });
  say(d, script.nextStepAsk);
  d.stage = 'explore';
}

function browseOfferings(d: Draft) {
  const ids = OFFERINGS.map((o) => o.id);
  markShown(d, ids);
  say(d, script.browseIntro, { kind: 'offerings', ids, reason: 'The full verified catalogue, shown because you asked to browse.' });
}

function applyAllocationList(d: Draft, list: Allocation[]): 'ok' | 'over' | 'negative' {
  const b = currentBalances(d);
  // Replace this conversation's chequing allocations with the stated set.
  const base = mem(d).allocations.filter((a) => !list.some((x) => x.account === a.account && x.purpose === a.purpose));
  const r = applyAllocations(base, list, { chequing: b.chequing, savings: b.savings });
  if (!r.ok) {
    if (r.reason === 'exceeds_balance') return 'over';
    return 'negative';
  }
  mem(d).allocations = r.list;
  return 'ok';
}

function setAllocations(d: Draft, list: Allocation[]) {
  const result = applyAllocationList(d, list);
  if (result === 'negative') {
    say(d, script.negativeAmount);
    d.stage = 'purposeAmounts';
    return;
  }
  if (result === 'over') {
    d.pendingAllocations = list;
    ask(d, 'clarifyOver');
    return;
  }
  d.pendingAllocations = null;
  d.stage = 'confirmAllocations';
  confirmText(d);
}

function chooseNextStep(d: Draft, step: NextStepId) {
  const m = mem(d);
  m.nextStep = step;
  m.nextStepDone = false;
  switch (step) {
    case 'learn_risk': {
      say(d, script.nextStepAck.learn_risk);
      openTopic(d, 'risk', false);
      break;
    }
    case 'compare_options':
      say(d, script.nextStepAck.compare_options);
      openTopic(d, 'gic_vs_fund', false);
      break;
    case 'explore_scenario':
      say(d, script.nextStepAck.explore_scenario);
      ask(d, 'scenario');
      return;
    case 'read_product_page': {
      const ids = m.offeringsShown.length ? m.offeringsShown : offeringPlan(m.goal?.type ?? null, m.horizon).ids;
      say(d, script.nextStepAck.read_product_page, { kind: 'offerings', ids, reason: 'Official pages for the options you looked at.' });
      break;
    }
    case 'prepare_questions':
      say(d, script.nextStepAck.prepare_questions);
      prepareSupport(d);
      return;
    case 'save_for_later':
    case 'not_proceeding':
      say(d, script.nextStepAck[step]);
      break;
  }
  const r = script.remember(step);
  if (r) say(d, r);
  d.stage = 'explore';
}

function suggestedQuestions(d: Draft): string[] {
  const m = mem(d);
  const qs: string[] = [];
  if (m.goal?.type === 'build_wealth') qs.push('Given my goals and timeline, how should I think about risk?');
  if (m.offeringsShown.includes('investment-funds')) qs.push('How do the Tangerine portfolios differ, and what are the total costs?');
  if (m.offeringsShown.includes('tfsa') || m.offeringsShown.includes('rsp')) qs.push('Would a TFSA or an RSP make more sense for my situation?');
  if (m.goal?.type === 'first_home') qs.push('Does Tangerine offer an FHSA?');
  if (!qs.length) qs.push('What should I consider before deciding what to do with this money?');
  return qs;
}

function prepareSupport(d: Draft) {
  const m = mem(d);
  const merged = [...m.supportQuestions];
  for (const q of suggestedQuestions(d)) if (!merged.includes(q)) merged.push(q);
  m.supportQuestions = merged;
  say(d, script.supportPrepared);
  d.view = 'handoff';
}

function openConversation(d: Draft, origin: Origin) {
  const m = mem(d);
  d.view = 'chat';
  d.notice = null;
  if (d.messages.length && d.origin === origin) return; // resume the same conversation
  d.messages = [];
  d.offer = null;
  d.suggestions = [];
  d.activeTopic = null;
  d.origin = origin;
  m.prompt ??= origin;
  m.lastConversationDay = d.todayIndex;
  if (origin === 'self') {
    say(d, script.greetingSelf(d.profile.firstName));
    say(d, script.scopeNote);
    d.stage = 'start';
    return;
  }
  if (origin === 'nudge') {
    const signal = signalFor(d);
    say(d, script.nudgeOpen(d.profile.firstName, signal, d.signalConfig.observationDays), m.permission === 'granted' ? { kind: 'signal' } : undefined, { accountDetail: true });
    if (m.permission === 'granted') ask(d, 'purpose');
    else ask(d, 'permission');
    return;
  }
  // Check-in: continue from the saved next step.
  say(d, script.checkinWelcome(d.profile.firstName, m));
  if (m.nextStep && m.nextStep !== 'not_proceeding' && m.nextStep !== 'save_for_later') chooseNextStep(d, m.nextStep);
  else if (m.goal) showOfferings(d);
  else ask(d, 'goal');
}

/** Apply validated AI-proposed effects. Returns customer-visible change notes. */
function applyAiEffects(d: Draft, effects: ChatEffect[]) {
  const m = mem(d);
  const changes: string[] = [];
  for (const e of effects) {
    switch (e.type) {
      case 'allocationsUpdated': {
        const list = (e.allocations ?? []).filter((a) => a && (a.account === 'chequing' || a.account === 'savings'));
        const b = currentBalances(d);
        const r = applyAllocations([], list, { chequing: b.chequing, savings: b.savings });
        if (r.ok) {
          m.allocations = r.list;
          const snap = allocationSnapshot(d);
          say(d, '', { kind: 'allocations', snapshot: snap }, { local: true });
        } else if (r.reason === 'exceeds_balance') {
          say(d, script.overNotSaved(b.chequing), undefined, { local: true });
        }
        break;
      }
      case 'goalSet':
        if (GOALS.includes(e.goal?.type)) {
          m.goal = { type: e.goal.type, detail: e.goal.detail?.slice(0, 200) ?? null };
          changes.push(`goal: ${GOAL_LABEL[e.goal.type].toLowerCase()}`);
        }
        break;
      case 'horizonSet':
        if (HORIZONS.includes(e.horizon)) {
          m.horizon = e.horizon;
          changes.push(`timeframe: ${HORIZON_LABEL[e.horizon].toLowerCase()}`);
        }
        break;
      case 'offeringsShown': {
        const ids = validateOfferingIds(e.ids);
        if (ids.length) {
          markShown(d, ids);
          say(d, '', { kind: 'offerings', ids, reason: (e.reason || script.offeringsReason(m.goal?.type ?? null, m.horizon)).slice(0, 200) }, { local: true });
        }
        break;
      }
      case 'nextStepSet':
        if (NEXT_STEPS.includes(e.step)) {
          m.nextStep = e.step;
          m.nextStepDone = false;
          changes.push(`next step: ${NEXT_STEP_LABEL[e.step].toLowerCase()}`);
        }
        break;
      case 'scenario': {
        const input = { start: e.input.start, monthly: e.input.monthly, months: e.input.months, target: e.input.target ?? null };
        if (projectWithoutReturns(input).valid) {
          m.scenario = input;
          say(d, '', { kind: 'scenario', input }, { local: true });
        }
        break;
      }
      case 'requestPermission':
        if (m.permission !== 'granted') d.permissionPending = true;
        break;
      case 'summaryReady':
        say(d, '', { kind: 'action', action: 'summary' }, { local: true });
        break;
      case 'handoffReady': {
        const merged = [...m.supportQuestions];
        for (const q of e.questions ?? []) if (typeof q === 'string' && q.trim() && !merged.includes(q.trim())) merged.push(q.trim());
        m.supportQuestions = merged.slice(0, 8);
        say(d, '', { kind: 'action', action: 'handoff' }, { local: true });
        break;
      }
    }
  }
  if (changes.length) say(d, '', { kind: 'factsUpdated', changes }, { local: true });
}

export function reduce(state: ConversationState, turn: CustomerTurn): ConversationState {
  const { event } = turn;

  // ---- Non-conversational updates
  switch (event.type) {
    case 'setHandoffNote':
      return { ...state, handoffNote: event.text, handoffNoteEdited: true };
    case 'setSupportQuestions':
      return { ...state, memory: { ...state.memory, supportQuestions: event.questions } };
    case 'setView':
      return { ...state, view: event.view, notice: event.view === 'dashboard' ? state.notice : null };
    case 'loadPreset':
      return createInitialState(event.profile, { memory: event.memory, todayIndex: event.todayIndex, mode: event.mode ?? state.mode, signalConfig: state.signalConfig });
    case 'setSignalConfig':
      return { ...state, signalConfig: event.config };
    case 'exploreOffering': {
      const [id] = validateOfferingIds([event.id]);
      if (!id || state.memory.offeringsExplored.includes(id)) return state;
      return { ...state, memory: { ...state.memory, offeringsExplored: [...state.memory.offeringsExplored, id] } };
    }
    case 'setProfileFlags':
      return {
        ...state,
        profile: {
          ...state.profile,
          ...(event.reviewFlag !== undefined ? { reviewFlag: event.reviewFlag } : {}),
          ...(event.historyDaysAvailable !== undefined ? { historyDaysAvailable: event.historyDaysAvailable } : {}),
        },
      };
    case 'clearAiError': {
      const messages = [...state.messages];
      while (messages.length && messages.at(-1)!.card?.kind === 'error') messages.pop();
      return { ...state, messages };
    }
    case 'dismissNudge':
      return {
        ...state,
        memory: { ...state.memory, prefs: { ...state.memory.prefs, dismissedUntil: state.todayIndex + NUDGE_SNOOZE_DAYS } },
        notice: { text: 'Okay. Sunny won’t bring this up for a while.' },
      };
    case 'earmarkFromDashboard':
      return {
        ...state,
        memory: { ...state.memory, prefs: { ...state.memory.prefs, earmarked: true, earmarkNote: null } },
        notice: { text: 'Got it. Sunny won’t suggest exploring this balance again.', undo: 'earmark' },
      };
    case 'undoEarmark':
      return { ...state, memory: { ...state.memory, prefs: { ...state.memory.prefs, earmarked: false, earmarkNote: null } }, notice: null };
    case 'simulateLaterVisit': {
      const maxDay = state.profile.balances.length - 1;
      return {
        ...state,
        todayIndex: Math.min(state.todayIndex + event.days, maxDay),
        view: 'dashboard',
        stage: 'start',
        origin: null,
        messages: [],
        offer: null,
        suggestions: [],
        permissionPending: false,
        pendingAllocations: null,
        activeTopic: null,
        notice: null,
        // A new visit is a new session: account-data permission must be given again.
        memory: { ...state.memory, visit: state.memory.visit + 1, permission: 'not_asked' },
      };
    }
    case 'confirmRestart': {
      const fresh = createInitialState(state.profile, { mode: state.mode, signalConfig: state.signalConfig, todayIndex: state.profile.spec.todayIndex });
      return { ...fresh, notice: { text: 'This demo customer has been reset.' } };
    }
    case 'checkin':
      if (event.action === 'remind_later') {
        return {
          ...state,
          memory: { ...state.memory, prefs: { ...state.memory.prefs, remindAfter: state.todayIndex + REMIND_LATER_DAYS } },
          notice: { text: 'Okay. Sunny will ask again in a couple of weeks (simulated).' },
        };
      }
      if (event.action === 'stop') {
        return {
          ...state,
          memory: { ...state.memory, prefs: { ...state.memory.prefs, checkinsStopped: true } },
          notice: { text: 'Check-ins are off. You can still ask Sunny anything, anytime.' },
        };
      }
      break;
    default:
      break;
  }

  const d: Draft = {
    ...state,
    memory: { ...state.memory, prefs: { ...state.memory.prefs } },
    offer: null,
  };
  if (turn.say) customerSays(d, turn.say);

  switch (event.type) {
    case 'open':
      openConversation(d, event.origin);
      break;

    case 'checkin':
      if (event.action === 'continue') openConversation(d, 'checkin');
      else if (event.action === 'done' || event.action === 'another_step') {
        const m = mem(d);
        d.view = 'chat';
        d.messages = [];
        d.origin = 'checkin';
        d.notice = null;
        d.activeTopic = null;
        m.lastConversationDay = d.todayIndex;
        if (event.action === 'done' && m.nextStep) {
          m.nextStepDone = true;
          if (!m.completedSteps.includes(m.nextStep)) m.completedSteps = [...m.completedSteps, m.nextStep];
          say(d, script.doneAck(NEXT_STEP_LABEL[m.nextStep]));
        } else {
          say(d, script.anotherStep);
        }
        d.stage = 'explore';
        d.offer = 'nextSteps';
      } else if (event.action === 'change_goal') {
        d.view = 'chat';
        d.messages = [];
        d.origin = 'checkin';
        d.notice = null;
        mem(d).lastConversationDay = d.todayIndex;
        say(d, script.goalAskAgain);
        d.stage = 'goal';
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

    case 'permission':
      mem(d).permission = event.allow ? 'granted' : 'declined';
      d.permissionPending = false;
      say(d, event.allow ? script.permissionYes : script.permissionNo, event.allow && d.origin === 'nudge' ? { kind: 'signal' } : undefined, event.allow ? { accountDetail: true } : {});
      if (d.origin === 'nudge' && mem(d).allocations.length === 0 && d.stage === 'permission') ask(d, 'purpose');
      else if (d.stage === 'permission') d.stage = 'start';
      break;

    case 'statePurpose':
      switch (event.kind) {
        case 'allocations':
          setAllocations(d, event.allocations ?? []);
          break;
        case 'earmarked':
        case 'other':
          mem(d).prefs.earmarked = true;
          mem(d).prefs.earmarkNote = event.note ?? null;
          ask(d, 'earmarked');
          break;
        case 'no_plan':
          say(d, script.noPlan);
          d.stage = 'purposeAmounts';
          break;
        case 'debt':
          openTopic(d, 'debt', false);
          d.offer = null;
          say(d, script.afterDebt);
          d.stage = 'purposeAmounts';
          break;
      }
      break;

    case 'askAllocationAmounts':
      ask(d, 'purposeAmounts');
      break;

    case 'setAllocations':
      setAllocations(d, event.allocations);
      break;

    case 'confirmAllocations':
      if (mem(d).goal) {
        say(d, script.carryOn);
        showOfferings(d);
      } else ask(d, 'goal');
      break;

    case 'clarifyOver':
      d.pendingAllocations = null;
      say(d, event.heldElsewhere ? script.allocationsElsewhere : script.allocationsReenter);
      d.stage = 'purposeAmounts';
      break;

    case 'setGoal': {
      const m = mem(d);
      m.goal = event.goal;
      say(d, script.goalLead[event.goal.type]);
      const lead: TopicId =
        event.goal.type === 'build_wealth' || event.goal.type === 'understand_options'
          ? 'saving_vs_investing'
          : event.goal.type === 'accessible_interest'
            ? 'leave_in_chequing'
            : event.goal.type === 'first_home'
              ? 'first_home'
              : 'saving_vs_investing';
      openTopic(d, lead, false);
      d.offer = null;
      if (!m.horizon) ask(d, 'horizon');
      else showOfferings(d);
      break;
    }

    case 'setHorizon':
      mem(d).horizon = event.horizon;
      say(d, script.horizonAck[event.horizon]);
      showOfferings(d);
      break;

    case 'showOfferings':
      showOfferings(d);
      break;

    case 'chooseNextStep':
      chooseNextStep(d, event.step);
      break;

    case 'pickNextStep':
      say(d, script.nextStepAsk);
      d.stage = 'explore';
      d.offer = 'nextSteps';
      break;

    case 'openTopic':
      openTopic(d, event.topic, false);
      break;

    case 'browseOfferings':
      browseOfferings(d);
      break;

    case 'exploreGoal': {
      // Exploring a goal never touches earmarked money or existing allocations.
      if (!QUESTION_STAGES.includes(d.stage)) d.resumeStage = null;
      const m = mem(d);
      say(d, m.prefs.earmarked ? script.exploreGoalIntro(m.prefs.earmarkNote) : script.goalAsk);
      d.stage = 'goal';
      d.activeTopic = null;
      break;
    }

    case 'resumeGoal': {
      const m = mem(d);
      d.activeTopic = null;
      if (!m.goal) ask(d, 'goal');
      else if (!m.horizon) ask(d, 'horizon');
      else showOfferings(d);
      break;
    }

    case 'revokePermission':
      mem(d).permission = 'declined';
      d.permissionPending = false;
      say(d, script.permissionRevoked);
      break;

    case 'simpler':
      if (d.activeTopic) openTopic(d, d.activeTopic, true);
      else say(d, script.simplerNone);
      break;

    case 'askInvestment':
      say(d, script.investment);
      d.offer = 'investment';
      break;

    case 'startScenario':
      ask(d, 'scenario');
      break;

    case 'runScenario': {
      const r = projectWithoutReturns(event.input);
      if (!r.valid) {
        say(d, Object.values(r.errors)[0] ?? script.unclearAmount);
        d.stage = 'scenario';
        break;
      }
      mem(d).scenario = event.input;
      say(d, script.scenarioResult(r, event.input.months), { kind: 'scenario', input: event.input });
      d.stage = 'explore';
      break;
    }

    case 'invalidAmount':
      say(d, event.reason === 'negative' ? script.negativeAmount : script.unclearAmount);
      break;

    case 'prepareSupport':
      prepareSupport(d);
      break;

    case 'showSummary':
      say(d, script.summaryReady);
      d.view = 'summary';
      break;

    case 'continue':
      ask(d, d.stage === 'start' ? 'goal' : d.stage);
      break;

    case 'requestRestart':
      if (d.stage !== 'confirmRestart') d.resumeStage = d.stage;
      ask(d, 'confirmRestart');
      break;

    case 'cancel': {
      const resume = d.resumeStage ?? 'explore';
      d.resumeStage = null;
      say(d, script.carryOn);
      d.stage = resume;
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

    // ---- AI mode
    case 'customerMessage':
      d.view = 'chat';
      d.suggestions = [];
      customerSays(d, event.text.trim());
      break;

    case 'aiTurn': {
      const r = event.response;
      const sources = validateSourceIds(r.sourceIds);
      cite(d, sources);
      // Replies written with account details available may repeat them: flag so they can't bypass a later permission change.
      say(d, r.reply, undefined, { ai: true, ...(sources.length ? { sources } : {}), ...(mem(d).permission === 'granted' ? { accountDetail: true } : {}) });
      d.suggestions = cleanSuggestions(r.suggestions, latestCustomerText(d));
      applyAiEffects(d, r.effects ?? []);
      break;
    }

    case 'aiError':
      say(d, '', { kind: 'error', code: event.code, message: event.message }, { local: true });
      break;
  }

  return d;
}
