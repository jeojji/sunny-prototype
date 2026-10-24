import type { Relationship } from '../data/customers';
import type { TopicId } from '../data/education';
import type { Allocation } from '../domain/allocations';
import type { SignalConfig } from '../domain/signal';
import type { AiErrorCode, ChatResponse } from '../shared/api';
import type { GoalType } from '../shared/offerings';

export type View = 'dashboard' | 'chat' | 'handoff' | 'summary';

/** 'ai' = live model via the local API; 'scripted' = deterministic demo responses. */
export type EngineMode = 'ai' | 'scripted';

/** What started a conversation. */
export type Origin = 'nudge' | 'self' | 'checkin';

export type Horizon = 'under_1_year' | '1_to_5_years' | 'over_5_years' | 'not_sure';

export type NextStepId =
  | 'learn_risk'
  | 'compare_options'
  | 'explore_scenario'
  | 'read_product_page'
  | 'prepare_questions'
  | 'save_for_later'
  | 'not_proceeding';

/** Permission to use account details (balances, activity, signal evidence) in the conversation. */
export type Permission = 'not_asked' | 'granted' | 'declined';

/** Where the scripted conversation is waiting. AI mode mostly stays at 'start'/'explore'. */
export type Stage =
  | 'start'
  | 'permission'
  | 'purpose'
  | 'purposeAmounts'
  | 'confirmAllocations'
  | 'clarifyOver'
  | 'goal'
  | 'horizon'
  | 'explore'
  | 'scenario'
  | 'earmarked'
  | 'confirmRestart';

export interface Goal {
  type: GoalType;
  /** The customer's own words, when given. */
  detail: string | null;
}

export interface Prefs {
  /** Customer said the elevated balance is already set aside: never show that opportunity nudge again. */
  earmarked: boolean;
  earmarkNote: string | null;
  /** "Not now": nudge hidden until this simulated day index. */
  dismissedUntil: number | null;
  /** "Stop these check-ins". */
  checkinsStopped: boolean;
  /** "Remind me later": check-in hidden until this simulated day index. */
  remindAfter: number | null;
}

export interface ScenarioFacts {
  start: number;
  monthly: number;
  months: number;
  /** Optional self-selected target. */
  target: number | null;
}

/**
 * What Sunny remembers about the customer between visits (synthetic demo
 * state; may be saved in the browser). Only customer-confirmed information.
 */
export interface Memory {
  permission: Permission;
  allocations: Allocation[];
  goal: Goal | null;
  horizon: Horizon | null;
  nextStep: NextStepId | null;
  /** What prompted the first conversation. */
  prompt: Origin | null;
  topicsExplored: TopicId[];
  offeringsViewed: string[];
  sourcesCited: string[];
  supportQuestions: string[];
  scenario: ScenarioFacts | null;
  prefs: Prefs;
  /** Simulated day of the most recent conversation. */
  lastConversationDay: number | null;
  /** Number of simulated visits (1 = first visit). */
  visit: number;
}

export interface AllocationSnapshot {
  balance: number;
  items: Allocation[];
  unassigned: number;
  savingsBalance: number;
}

export type MessageCard =
  | { kind: 'education'; topic: TopicId }
  | { kind: 'signal' }
  | { kind: 'allocations'; snapshot: AllocationSnapshot }
  | { kind: 'offerings'; ids: string[]; reason: string }
  | { kind: 'scenario'; input: ScenarioFacts; hypothetical?: boolean }
  | { kind: 'factsUpdated'; changes: string[] }
  | { kind: 'action'; action: 'summary' | 'handoff' }
  | { kind: 'error'; code: AiErrorCode; message: string };

export interface Message {
  id: string;
  role: 'sunny' | 'customer';
  text: string;
  card?: MessageCard;
  /** Validated knowledge-base ids supporting this message. */
  sources?: string[];
  /** AI-generated text (rendered with light formatting). */
  ai?: boolean;
  /** Excluded from the history sent to the model (errors, cards, notes). */
  local?: boolean;
}

export interface ConversationState {
  profile: Relationship;
  signalConfig: SignalConfig;
  /** Simulated "today" (day index into the synthetic history). */
  todayIndex: number;
  mode: EngineMode;
  view: View;
  stage: Stage;
  resumeStage: Stage | null;
  origin: Origin | null;
  memory: Memory;
  offer: 'investment' | 'menu' | 'detour' | 'nextSteps' | null;
  /** AI asked for account permission and is waiting for Allow / Not now. */
  permissionPending: boolean;
  suggestions: string[];
  /** Allocations awaiting clarification because they exceed the balance. */
  pendingAllocations: Allocation[] | null;
  activeTopic: TopicId | null;
  /** Short dashboard acknowledgement after a customer choice (e.g. "Not now"). */
  notice: { text: string; undo?: 'earmark' } | null;
  handoffNote: string;
  handoffNoteEdited: boolean;
  messages: Message[];
  seq: number;
}

export type PurposeKind = 'allocations' | 'earmarked' | 'no_plan' | 'debt' | 'other';

export type CheckinAction = 'continue' | 'change_goal' | 'remind_later' | 'stop';

/** Everything that can happen. Free text is mapped to these by an interpreter (scripted) or the model's tools (AI). */
export type SunnyEvent =
  | { type: 'open'; origin: Origin }
  | { type: 'permission'; allow: boolean }
  | { type: 'statePurpose'; kind: PurposeKind; allocations?: Allocation[]; note?: string }
  | { type: 'askAllocationAmounts' }
  | { type: 'setAllocations'; allocations: Allocation[] }
  | { type: 'confirmAllocations' }
  | { type: 'clarifyOver'; heldElsewhere: boolean }
  | { type: 'setGoal'; goal: Goal }
  | { type: 'setHorizon'; horizon: Horizon }
  | { type: 'showOfferings' }
  | { type: 'chooseNextStep'; step: NextStepId }
  | { type: 'pickNextStep' }
  | { type: 'openTopic'; topic: TopicId }
  | { type: 'simpler' }
  | { type: 'askInvestment' }
  | { type: 'startScenario' }
  | { type: 'runScenario'; input: ScenarioFacts }
  | { type: 'invalidAmount'; reason: 'negative' | 'unclear' }
  | { type: 'prepareSupport' }
  | { type: 'showSummary' }
  | { type: 'setView'; view: View }
  | { type: 'continue' }
  | { type: 'requestRestart' }
  | { type: 'confirmRestart' }
  | { type: 'cancel' }
  | { type: 'unsupported' }
  | { type: 'help' }
  | { type: 'setHandoffNote'; text: string }
  | { type: 'setSupportQuestions'; questions: string[] }
  // Dashboard and demo controls
  | { type: 'dismissNudge' }
  | { type: 'earmarkFromDashboard' }
  | { type: 'undoEarmark' }
  | { type: 'checkin'; action: CheckinAction }
  | { type: 'simulateLaterVisit'; days: number }
  | { type: 'loadPreset'; profile: Relationship; memory?: Memory; todayIndex?: number; mode?: EngineMode }
  | { type: 'setSignalConfig'; config: SignalConfig }
  | { type: 'setProfileFlags'; reviewFlag?: boolean; historyDaysAvailable?: number | null }
  | { type: 'setMode'; mode: EngineMode; announce?: boolean }
  // AI mode
  | { type: 'customerMessage'; text: string }
  | { type: 'aiTurn'; response: ChatResponse }
  | { type: 'aiError'; code: AiErrorCode; message: string }
  | { type: 'clearAiError' };

/** An event plus what the customer visibly said (quick-reply label or typed text). */
export interface CustomerTurn {
  event: SunnyEvent;
  say?: string;
}
