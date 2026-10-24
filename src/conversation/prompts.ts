/**
 * Derives the customer's controls (quick replies and small forms) from the
 * current state. Pure; nothing here is stored.
 */
import { TOPICS, type TopicId } from '../data/education';
import { PURPOSE_LABEL, type Purpose } from '../domain/allocations';
import type { GoalType } from '../shared/offerings';
import { allocationSnapshot, suggestedTopics } from './engine';
import { interpretText } from './intents';
import { GOAL_LABEL, HORIZON_LABEL, NEXT_STEP_LABEL } from './script';
import type { ConversationState, CustomerTurn, Horizon, NextStepId, ScenarioFacts, Stage } from './types';

export interface Reply {
  label: string;
  turn: CustomerTurn;
  primary?: boolean;
}

export interface AllocationFormSpec {
  fields: { purpose: Purpose; label: string; initial: number | null }[];
  submitLabel: string;
  toTurn: (values: Partial<Record<Purpose, number>>) => CustomerTurn;
}

export interface ScenarioFormSpec {
  initial: { start: number | null; monthly: number | null; months: number; target: number | null };
  toTurn: (input: ScenarioFacts) => CustomerTurn;
}

export interface Prompt {
  replies: Reply[];
  allocationForm?: AllocationFormSpec;
  scenarioForm?: ScenarioFormSpec;
}

const reply = (label: string, event: CustomerTurn['event'], primary = false): Reply => ({ label, turn: { event, say: label }, primary });
const topicReply = (id: TopicId) => reply(TOPICS[id].question, { type: 'openTopic', topic: id });
/** A quick reply that behaves exactly like typing the text. */
const typed = (state: ConversationState, label: string, primary = false): Reply => ({ label, turn: interpretText(label, state), primary });

const GOAL_ORDER: GoalType[] = ['build_wealth', 'accessible_interest', 'first_home', 'understand_options', 'other'];
const HORIZON_ORDER: Horizon[] = ['under_1_year', '1_to_5_years', 'over_5_years', 'not_sure'];
const NEXT_ORDER: NextStepId[] = ['learn_risk', 'compare_options', 'explore_scenario', 'read_product_page', 'prepare_questions', 'save_for_later', 'not_proceeding'];

const nextStepReplies = () => NEXT_ORDER.map((s, i) => reply(NEXT_STEP_LABEL[s], { type: 'chooseNextStep', step: s }, i === 0));

function allocationForm(state: ConversationState): AllocationFormSpec {
  const existing = (p: Purpose) => state.memory.allocations.find((a) => a.account === 'chequing' && a.purpose === p)?.amount ?? null;
  return {
    fields: [
      { purpose: 'upcoming_expenses', label: 'Upcoming expenses (chequing)', initial: existing('upcoming_expenses') },
      { purpose: 'emergency', label: 'Emergency reserve (chequing)', initial: existing('emergency') },
    ],
    submitLabel: 'Confirm amounts',
    toTurn: (values) => {
      const allocations = (Object.entries(values) as [Purpose, number][])
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([purpose, amount]) => ({ account: 'chequing' as const, purpose, amount }));
      const say = allocations.length ? allocations.map((a) => `$${a.amount.toLocaleString('en-CA')} for ${PURPOSE_LABEL[a.purpose].toLowerCase()}`).join(' and ') : 'None of it is set aside.';
      return { event: { type: 'setAllocations', allocations }, say };
    },
  };
}

function stagePrompt(state: ConversationState, stage: Stage): Prompt {
  const m = state.memory;
  switch (stage) {
    case 'start':
      return {
        replies: [
          topicReply('tangerine_help'),
          topicReply('saving_vs_investing'),
          topicReply('account_vs_holdings'),
          reply('Help me think through a goal', { type: 'continue' }, true),
        ],
      };
    case 'permission':
      return {
        replies: [
          reply('Yes, use my account details', { type: 'permission', allow: true }, true),
          reply('Keep it general', { type: 'permission', allow: false }),
          topicReply('why_asking'),
        ],
      };
    case 'purpose':
      return {
        replies: [
          typed(state, state.profile.demoAnswers.moneyPurpose, true),
          reply('It’s already set aside for something specific', { type: 'statePurpose', kind: 'earmarked' }),
          typed(state, 'I don’t have a plan for it.'),
          typed(state, 'I have debt at another bank.'),
          topicReply('why_asking'),
        ],
      };
    case 'purposeAmounts':
      return { replies: [reply('None of it is set aside', { type: 'setAllocations', allocations: [] })], allocationForm: allocationForm(state) };
    case 'confirmAllocations':
      return {
        replies: [reply('Yes, that’s right', { type: 'confirmAllocations' }, true), reply('Let me correct that', { type: 'askAllocationAmounts' })],
      };
    case 'clarifyOver':
      return {
        replies: [reply('Some of it is in another account', { type: 'clarifyOver', heldElsewhere: true }), reply('Let me re-enter the amounts', { type: 'clarifyOver', heldElsewhere: false }, true)],
      };
    case 'goal':
      return {
        replies: GOAL_ORDER.map((g, i) =>
          g === 'build_wealth' && state.profile.demoAnswers.goal
            ? typed(state, state.profile.demoAnswers.goal, true)
            : reply(GOAL_LABEL[g], { type: 'setGoal', goal: { type: g, detail: null } }, i === 0),
        ),
      };
    case 'horizon':
      return { replies: [...HORIZON_ORDER.map((h) => reply(HORIZON_LABEL[h], { type: 'setHorizon', horizon: h })), topicReply('horizon')] };
    case 'explore': {
      if (!m.nextStep || state.offer === 'nextSteps') return { replies: [...nextStepReplies(), ...suggestedTopics(state, 2).map(topicReply)] };
      return {
        replies: [
          ...suggestedTopics(state, 3).map(topicReply),
          ...(m.scenario ? [] : [reply('Explore an illustrative scenario', { type: 'startScenario' })]),
          reply('Choose a different next step', { type: 'pickNextStep' }),
          reply('See my summary', { type: 'showSummary' }, true),
        ],
      };
    }
    case 'scenario': {
      const snap = allocationSnapshot(state);
      return {
        replies: [reply('Never mind', { type: 'cancel' })],
        scenarioForm: {
          initial: {
            start: m.scenario?.start ?? (m.allocations.length ? snap.unassigned : null),
            monthly: m.scenario?.monthly ?? null,
            months: m.scenario?.months ?? 60,
            target: m.scenario?.target ?? null,
          },
          toTurn: (input) => ({
            event: { type: 'runScenario', input },
            say: `Start with $${input.start.toLocaleString('en-CA')}, add $${input.monthly.toLocaleString('en-CA')} a month for ${input.months} months${input.target ? `, toward $${input.target.toLocaleString('en-CA')}` : ''}.`,
          }),
        },
      };
    }
    case 'earmarked':
      return {
        replies: [
          topicReply('need_next_year'),
          ...(m.prefs.earmarkNote?.includes('home') ? [topicReply('first_home')] : []),
          reply('That’s all for now', { type: 'setView', view: 'dashboard' }, true),
        ],
      };
    case 'confirmRestart':
      return { replies: [reply('Yes, start over', { type: 'confirmRestart' }), reply('No, keep going', { type: 'cancel' }, true)] };
  }
}

const aiSay = (label: string, primary = false): Reply => ({ label, turn: { event: { type: 'customerMessage', text: label } }, primary });

/** AI mode: local permission/opening choices, then the model's own suggestions. */
function aiPrompt(state: ConversationState): Prompt {
  if (state.messages.at(-1)?.card?.kind === 'error') return { replies: [] };
  if (state.stage === 'permission' || state.permissionPending) {
    return {
      replies: [
        { label: 'Yes, use my account details', turn: { event: { type: 'permission', allow: true }, say: 'Yes, you can use my account details.' }, primary: true },
        { label: 'Keep it general', turn: { event: { type: 'permission', allow: false }, say: 'Please keep it general.' } },
      ],
    };
  }
  const last = state.messages.at(-1);
  // The local purpose question is waiting for an answer (no AI reply yet).
  if (state.stage === 'purpose' && last?.role === 'sunny' && !last.ai && !last.local) {
    return {
      replies: [
        aiSay(state.profile.demoAnswers.moneyPurpose, true),
        aiSay('It’s already set aside for something specific.'),
        aiSay('I don’t have a plan for it.'),
        aiSay('I have debt at another bank.'),
      ],
    };
  }
  if (!state.messages.some((msg) => msg.role === 'customer') && state.origin !== 'nudge') {
    return { replies: [aiSay('What can Tangerine help me with?'), aiSay('What’s the difference between saving and investing?'), aiSay('Is a TFSA an investment?'), aiSay('Help me think through a goal.')] };
  }
  return { replies: state.suggestions.map((s) => aiSay(s)) };
}

export function getPrompt(state: ConversationState): Prompt {
  if (state.mode === 'ai') return aiPrompt(state);
  const base = stagePrompt(state, state.stage);
  const resume = reply('Continue where we left off', { type: 'continue' }, true);
  if (state.offer === 'investment') {
    return {
      ...base,
      replies: [
        topicReply('saving_vs_investing'),
        reply('Prepare questions for a person', { type: 'prepareSupport' }),
        { ...resume, label: 'Back to where we were' },
      ],
    };
  }
  if (state.offer === 'menu') {
    return {
      ...base,
      replies: [
        topicReply('saving_vs_investing'),
        topicReply('risk'),
        topicReply('tangerine_help'),
        ...(state.memory.goal ? [] : [reply('Help me think through a goal', { type: 'continue' })]),
        { ...resume, label: 'Back to where we were', primary: false },
      ],
    };
  }
  if (state.offer === 'detour') return { ...base, replies: [resume, ...base.replies.map((r) => ({ ...r, primary: false }))] };
  return base;
}
