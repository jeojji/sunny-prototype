import type { CustomerProfile } from '../data/customers';
import type { TopicId } from '../data/education';
import type { TimelineBand } from '../lib/calc';
import type { AiErrorCode, ChatResponse } from '../shared/api';

export type View = 'dashboard' | 'chat' | 'handoff' | 'summary';

/** 'ai' = live model via the local API; 'scripted' = deterministic demo responses. */
export type EngineMode = 'ai' | 'scripted';

/** Where the scripted conversation is waiting. AI mode stays at 'intro'/'explore'. */
export type Step =
  | 'intro'
  | 'permission'
  | 'timeline'
  | 'timelineMonths'
  | 'target'
  | 'homeSavings'
  | 'homeSavingsAmount'
  | 'confirmElsewhere'
  | 'reserveAmount'
  | 'monthly'
  | 'explore'
  | 'nextSteps'
  | 'editPicker'
  | 'editTimeline'
  | 'editTarget'
  | 'editHomeSavings'
  | 'editMonthly'
  | 'confirmRestart';

export type EditableField = 'timelineMonths' | 'target' | 'homeSavings' | 'monthly';

/**
 * Facts the customer has stated/confirmed. `null` = unknown.
 * Derived numbers (gap, totals) are never stored; they are computed from these.
 * Account balances live in the profile snapshot, not here.
 */
export interface ConfirmedFacts {
  /** Customer chose to explore a savings goal (scripted flow). */
  goalConfirmed: boolean;
  /** 'snapshot' = permission granted; 'manual' = declined; null = not asked. */
  dataSource: 'snapshot' | 'manual' | null;
  timelineBand: TimelineBand | null;
  timelineMonths: number | null;
  target: number | null;
  homeSavings: number | null;
  /** Money the customer said to keep separate (e.g. for emergencies). */
  reservedSeparately: number | null;
  /** Customer confirmed some home savings are held outside the snapshot accounts. */
  homeSavingsHeldElsewhere: boolean;
  monthly: number | null;
}

export type Offer = 'investment' | 'menu' | 'detour';

export type NextStepId = 'learnFhsa' | 'reviewBudget' | 'gatherInfo' | 'revisit' | 'talkToPerson';

export interface ScenarioSnapshot {
  startingSavings: number;
  target: number;
  monthly: number;
  months: number;
}

export type MessageCard =
  | { kind: 'education'; topic: TopicId; simple?: boolean }
  | { kind: 'scenario'; snapshot: ScenarioSnapshot; hypothetical?: boolean }
  | { kind: 'snapshot' }
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
  /** Excluded from the history sent to the model (errors, system notes). */
  local?: boolean;
}

/** A customer-stated amount that needs clarification before it is applied (scripted mode). */
export interface PendingFact {
  field: 'homeSavings';
  amount: number;
}

export interface ConversationState {
  profile: CustomerProfile;
  mode: EngineMode;
  view: View;
  step: Step;
  /** Step to return to after an edit, clarification or cancelled restart. */
  resumeStep: Step | null;
  facts: ConfirmedFacts;
  /** Contextual quick replies offered alongside the current step until the next event (scripted). */
  offer: Offer | null;
  /** AI asked for snapshot permission and is waiting for Allow / Not now. */
  permissionPending: boolean;
  /** Follow-up suggestions from the latest AI reply. */
  suggestions: string[];
  pending: PendingFact | null;
  activeTopic: TopicId | null;
  topicsExplored: TopicId[];
  /** Knowledge-base ids cited during the conversation. */
  sourcesCited: string[];
  supportQuestions: string[];
  handoffNote: string;
  handoffNoteEdited: boolean;
  nextSteps: NextStepId[];
  messages: Message[];
  /** Monotonic counter for message ids (keeps the reducer pure). */
  seq: number;
}

/** Everything that can happen in a conversation. */
export type SunnyEvent =
  | { type: 'open' }
  | { type: 'confirmGoal' }
  | { type: 'chooseDataSource'; source: 'snapshot' | 'manual' }
  | { type: 'setTimelineBand'; band: TimelineBand }
  | { type: 'setTimelineMonths'; months: number }
  | { type: 'setTarget'; amount: number }
  | { type: 'setHomeSavings'; amount: number }
  | { type: 'askHomeSavingsAmount' }
  | { type: 'confirmHeldElsewhere'; yes: boolean }
  | { type: 'setEmergencyReserve'; amount: number | null }
  | { type: 'setMonthly'; amount: number }
  | { type: 'invalidAmount'; reason: 'negative' | 'unclear' }
  | { type: 'openTopic'; topic: TopicId }
  | { type: 'simpler' }
  | { type: 'askInvestment' }
  | { type: 'prepareSupport' }
  | { type: 'continue' }
  | { type: 'back' }
  | { type: 'pickEdit' }
  | { type: 'startEdit'; field: EditableField }
  | { type: 'updateFacts'; patch: Partial<Pick<ConfirmedFacts, EditableField>>; brief?: boolean }
  | { type: 'pickNextSteps' }
  | { type: 'chooseNextSteps'; steps: NextStepId[] }
  | { type: 'showSummary' }
  | { type: 'showHandoff' }
  | { type: 'setView'; view: View }
  | { type: 'requestRestart' }
  | { type: 'confirmRestart' }
  | { type: 'cancel' }
  | { type: 'unsupported' }
  | { type: 'help' }
  | { type: 'setHandoffNote'; text: string }
  | { type: 'setSupportQuestions'; questions: string[] }
  | { type: 'toggleNextStep'; step: NextStepId }
  | { type: 'loadProfile'; profile: CustomerProfile; mode?: EngineMode }
  | { type: 'setMode'; mode: EngineMode; announce?: boolean }
  // AI mode
  | { type: 'customerMessage'; text: string }
  | { type: 'aiTurn'; response: ChatResponse }
  | { type: 'aiError'; code: AiErrorCode; message: string }
  | { type: 'clearAiError' }
  | { type: 'snapshotDecision'; allow: boolean };

/** An event plus what the customer visibly said (quick-reply label or typed text). */
export interface CustomerTurn {
  event: SunnyEvent;
  say?: string;
}
