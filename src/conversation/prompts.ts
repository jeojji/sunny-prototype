/**
 * Derives the customer's available controls (quick replies, amount/month
 * inputs, multi-select) from the current state. Pure; nothing here is stored.
 */
import { ALL_TOPIC_IDS, TOPICS, TOPICS_BY_BAND, type TopicId } from '../data/education';
import { bandForMonths, calculateScenario } from '../lib/calc';
import { money } from '../lib/format';
import { QUESTION_STEPS, scenarioInput } from './engine';
import { BAND_DEFAULT_MONTHS, BAND_LABEL, NEXT_STEP_LABEL } from './script';
import type { ConversationState, CustomerTurn, EditableField, NextStepId, Step } from './types';

export interface Reply {
  label: string;
  turn: CustomerTurn;
  primary?: boolean;
}

export interface InputSpec {
  kind: 'amount' | 'months';
  label: string;
  initial: number | null;
  submitLabel: string;
  /** Allow $0 (false for targets). */
  allowZero: boolean;
  toTurn: (value: number) => CustomerTurn;
}

export interface MultiSpec {
  options: { id: NextStepId; label: string }[];
  selected: NextStepId[];
  submitLabel: string;
  toTurn: (ids: NextStepId[]) => CustomerTurn;
}

export interface Prompt {
  replies: Reply[];
  input?: InputSpec;
  multi?: MultiSpec;
}

export const STARTERS = [
  'I don’t know where to start.',
  'What can Tangerine help me with?',
  'Explain home-saving accounts.',
  'Help me explore a savings goal.',
] as const;

const reply = (label: string, turn: CustomerTurn['event'], primary = false): Reply => ({
  label,
  turn: { event: turn, say: label },
  primary,
});

const topicReply = (id: TopicId) => reply(TOPICS[id].question, { type: 'openTopic', topic: id });
const back = () => reply('Go back', { type: 'back' });
const never = () => reply('Never mind', { type: 'cancel' });
const exploreGoal = () => reply('Help me explore a savings goal.', { type: 'confirmGoal' }, true);
const simpler = () => reply('Explain that more simply', { type: 'simpler' });

function amountInput(
  label: string,
  initial: number | null,
  toEvent: (n: number) => CustomerTurn['event'],
  allowZero = true,
): InputSpec {
  return { kind: 'amount', label, initial, submitLabel: 'Confirm', allowZero, toTurn: (n) => ({ event: toEvent(n), say: `${money(n)}` }) };
}

function monthsInput(label: string, initial: number | null, toEvent: (n: number) => CustomerTurn['event']): InputSpec {
  return {
    kind: 'months',
    label,
    initial,
    submitLabel: 'Confirm',
    allowZero: false,
    toTurn: (n) => ({ event: toEvent(n), say: `About ${n} ${n === 1 ? 'month' : 'months'}` }),
  };
}

/** Topics related to the current discussion that haven't been covered yet. */
function relatedTopics(state: ConversationState, max: number, fallback: readonly TopicId[] = ALL_TOPIC_IDS): TopicId[] {
  const seeds = state.activeTopic ? TOPICS[state.activeTopic].related : [];
  return [...seeds, ...fallback].filter((t, i, arr) => arr.indexOf(t) === i && !state.topicsExplored.includes(t)).slice(0, max);
}

function exploreReplies(state: ConversationState): Reply[] {
  const { facts, topicsExplored } = state;
  const input = scenarioInput(facts);
  const result = input ? calculateScenario(input) : null;
  const zeroBranch = input?.monthly === 0 && result && !result.targetAlreadyReached;

  if (zeroBranch) {
    return [
      reply('Save a summary of this conversation', { type: 'showSummary' }, true),
      ...(topicsExplored.includes('emergency') ? [] : [topicReply('emergency')]),
      reply('Try a monthly amount', { type: 'startEdit', field: 'monthly' }),
      ...(topicsExplored.includes('tangerine') ? [] : [topicReply('tangerine')]),
      reply('Talk to someone', { type: 'prepareSupport' }),
    ];
  }

  const band = facts.timelineBand ?? 'oneToFive';
  return [
    ...relatedTopics(state, 3, TOPICS_BY_BAND[band]).map(topicReply),
    ...(state.activeTopic ? [simpler()] : []),
    reply('Which investment should I buy?', { type: 'askInvestment' }),
    reply('Change an assumption', { type: 'pickEdit' }),
    reply('Prepare questions for support', { type: 'prepareSupport' }),
    ...(state.nextSteps.length === 0 ? [reply('Choose my next steps', { type: 'pickNextSteps' })] : []),
    reply('See my summary', { type: 'showSummary' }, topicsExplored.length > 0 || state.nextSteps.length > 0),
  ];
}

function stepPrompt(state: ConversationState, step: Step): Prompt {
  const { facts, profile } = state;
  switch (step) {
    case 'intro': {
      // Education-first: no forced sequence. Starters until the customer picks a direction.
      if (!state.activeTopic) {
        return {
          replies: [
            reply(STARTERS[0], { type: 'openTopic', topic: 'start' }),
            reply(STARTERS[1], { type: 'openTopic', topic: 'tangerine' }),
            reply(STARTERS[2], { type: 'openTopic', topic: 'accounts' }),
            reply(STARTERS[3], { type: 'confirmGoal' }),
          ],
        };
      }
      return {
        replies: [
          ...relatedTopics(state, 3).map(topicReply),
          simpler(),
          ...(facts.goalConfirmed ? [] : [exploreGoal()]),
        ],
      };
    }
    case 'permission':
      return {
        replies: [
          reply('Use my account snapshot.', { type: 'chooseDataSource', source: 'snapshot' }, true),
          reply('I’d rather enter the details myself.', { type: 'chooseDataSource', source: 'manual' }),
          back(),
        ],
      };
    case 'timeline':
      return {
        replies: [
          reply(BAND_LABEL.underOne, { type: 'setTimelineBand', band: 'underOne' }),
          reply(BAND_LABEL.oneToFive, { type: 'setTimelineBand', band: 'oneToFive' }),
          reply(BAND_LABEL.overFive, { type: 'setTimelineBand', band: 'overFive' }),
          ...(state.topicsExplored.includes('timeline') ? [] : [topicReply('timeline')]),
          back(),
        ],
      };
    case 'timelineMonths': {
      const band = facts.timelineBand ?? 'oneToFive';
      const candidates = [facts.timelineMonths, profile.timelineMonths];
      const initial = candidates.find((m) => m !== null && bandForMonths(m) === band) ?? BAND_DEFAULT_MONTHS[band];
      return {
        replies: [back()],
        input: monthsInput('Months until you hope to buy', initial, (n) => ({ type: 'setTimelineMonths', months: n })),
      };
    }
    case 'target':
      return {
        replies: [...(state.topicsExplored.includes('downPayment') ? [] : [topicReply('downPayment')]), back()],
        input: amountInput('Your home savings target', facts.target ?? profile.homeTarget, (n) => ({ type: 'setTarget', amount: n }), false),
      };
    case 'homeSavings': {
      if (facts.dataSource === 'snapshot' && profile.savingsBalance > 0) {
        const s = profile.savingsBalance;
        const r = profile.emergencyReserve;
        const replies: Reply[] = [reply('All of it', { type: 'setHomeSavings', amount: s })];
        if (r > 0) {
          replies.push(
            reply(r >= s ? 'Keep it all for emergencies' : `Keep ${money(r)} aside for emergencies`, {
              type: 'setEmergencyReserve',
              amount: Math.min(r, s),
            }),
          );
        }
        replies.push(reply('Let me enter another amount', { type: 'askHomeSavingsAmount' }));
        if (!state.topicsExplored.includes('emergency')) replies.push(topicReply('emergency'));
        replies.push(back());
        return { replies };
      }
      return {
        replies: [reply('Nothing yet', { type: 'setHomeSavings', amount: 0 }), back()],
        input: amountInput('Saved for this home goal', facts.homeSavings, (n) => ({ type: 'setHomeSavings', amount: n })),
      };
    }
    case 'homeSavingsAmount':
      return {
        replies: [back()],
        input: amountInput('Amount for this home goal', facts.homeSavings, (n) => ({ type: 'setHomeSavings', amount: n })),
      };
    case 'confirmElsewhere':
      return {
        replies: [
          reply('Yes, some is held elsewhere', { type: 'confirmHeldElsewhere', yes: true }),
          reply('No, let me re-enter it', { type: 'confirmHeldElsewhere', yes: false }),
        ],
      };
    case 'reserveAmount':
      return {
        replies: [never()],
        input: amountInput('Amount to keep aside for emergencies', null, (n) => ({ type: 'setEmergencyReserve', amount: n })),
      };
    case 'monthly': {
      const initial = facts.monthly ?? (profile.monthlyToExplore > 0 ? profile.monthlyToExplore : null);
      return {
        replies: [reply('I can’t set anything aside right now', { type: 'setMonthly', amount: 0 }), back()],
        input: amountInput('Monthly amount to explore', initial, (n) => ({ type: 'setMonthly', amount: n })),
      };
    }
    case 'explore':
      return { replies: exploreReplies(state) };
    case 'nextSteps':
      return {
        replies: [reply('Skip for now', { type: 'chooseNextSteps', steps: [] })],
        multi: {
          options: (Object.keys(NEXT_STEP_LABEL) as NextStepId[]).map((id) => ({ id, label: NEXT_STEP_LABEL[id] })),
          selected: state.nextSteps,
          submitLabel: 'Save next steps',
          toTurn: (ids) => ({
            event: { type: 'chooseNextSteps', steps: ids },
            say: ids.length ? ids.map((id) => NEXT_STEP_LABEL[id]).join(' · ') : 'None for now',
          }),
        },
      };
    case 'editPicker': {
      const fields: [EditableField, string][] = [
        ['monthly', 'Monthly amount'],
        ['timelineMonths', 'Timeline'],
        ['homeSavings', 'Starting savings'],
        ['target', 'Savings target'],
      ];
      return { replies: [...fields.map(([field, label]) => reply(label, { type: 'startEdit', field })), never()] };
    }
    case 'editTimeline':
      return {
        replies: [never()],
        input: monthsInput('New timeline in months', facts.timelineMonths, (n) => ({ type: 'updateFacts', patch: { timelineMonths: n } })),
      };
    case 'editTarget':
      return {
        replies: [never()],
        input: amountInput('New savings target', facts.target, (n) => ({ type: 'updateFacts', patch: { target: n } }), false),
      };
    case 'editHomeSavings':
      return {
        replies: [never()],
        input: amountInput('New starting savings for this goal', facts.homeSavings, (n) => ({ type: 'updateFacts', patch: { homeSavings: n } })),
      };
    case 'editMonthly':
      return {
        replies: [never()],
        input: amountInput('New monthly amount', facts.monthly, (n) => ({ type: 'updateFacts', patch: { monthly: n } })),
      };
    case 'confirmRestart':
      return {
        replies: [reply('Yes, start over', { type: 'confirmRestart' }), reply('No, keep going', { type: 'cancel' }, true)],
      };
  }
}

const aiSay = (label: string, primary = false): Reply => ({ label, turn: { event: { type: 'customerMessage', text: label } }, primary });

/** AI mode: starters, permission choice or the model's own follow-up suggestions. */
function aiPrompt(state: ConversationState): Prompt {
  if (state.messages.at(-1)?.card?.kind === 'error') return { replies: [] };
  if (state.permissionPending) {
    return {
      replies: [
        { label: 'Yes, use my account snapshot', turn: { event: { type: 'snapshotDecision', allow: true }, say: 'Yes, you can use my account snapshot.' }, primary: true },
        { label: 'Not now', turn: { event: { type: 'snapshotDecision', allow: false }, say: 'Not now. I’d rather not share my account snapshot.' } },
      ],
    };
  }
  if (!state.messages.some((m) => m.role === 'customer')) return { replies: STARTERS.map((s) => aiSay(s)) };
  return { replies: state.suggestions.map((s) => aiSay(s)) };
}

export function getPrompt(state: ConversationState): Prompt {
  if (state.mode === 'ai') return aiPrompt(state);
  const base = stepPrompt(state, state.step);
  const resume = reply(QUESTION_STEPS.includes(state.step) ? 'Continue where we left off' : 'Ask something else', { type: 'continue' });
  // Contextual offers replace the step's replies; inputs stay available.
  if (state.offer === 'investment') {
    return {
      ...base,
      replies: [
        reply('Explain the options', { type: 'openTopic', topic: 'options' }, true),
        reply('Prepare questions for human support', { type: 'prepareSupport' }),
        resume,
      ],
    };
  }
  if (state.offer === 'menu') {
    return {
      ...base,
      replies: [
        ...(state.facts.goalConfirmed ? [] : [exploreGoal()]),
        ...(['accounts', 'tangerine', 'fhsa', 'tfsa'] as TopicId[]).filter((t) => !state.topicsExplored.includes(t)).map(topicReply),
        reply('Talk to someone', { type: 'prepareSupport' }),
        { ...resume, primary: state.facts.goalConfirmed },
      ],
    };
  }
  if (state.offer === 'detour' && QUESTION_STEPS.includes(state.step)) {
    return { ...base, replies: [{ ...resume, primary: true }, ...base.replies.map((r) => ({ ...r, primary: false }))] };
  }
  return base;
}
