import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, PRESETS } from '../data/customers';
import { calculateScenario } from '../lib/calc';
import type { ChatResponse } from '../shared/api';
import { buildChatRequest } from './aiClient';
import { createInitialState, reduce, scenarioInput } from './engine';
import { interpretText } from './intents';
import { getPrompt } from './prompts';
import { buildSummary } from './summary';
import type { ConversationState, SunnyEvent } from './types';

const run = (state: ConversationState, ...events: SunnyEvent[]) => events.reduce((s, event) => reduce(s, { event }), state);
const typed = (state: ConversationState, text: string) => reduce(state, interpretText(text, state));
const lastSunny = (s: ConversationState) => [...s.messages].reverse().find((m) => m.role === 'sunny' && m.text)!.text;
const allText = (s: ConversationState) => s.messages.map((m) => m.text).join('\n');
const opened = () => run(createInitialState(DEFAULT_PROFILE), { type: 'open' });

/** Click the quick reply with this label in the current prompt. */
function click(state: ConversationState, label: string) {
  const r = getPrompt(state).replies.find((x) => x.label === label);
  if (!r) throw new Error(`No reply "${label}" at step ${state.step}: ${getPrompt(state).replies.map((x) => x.label).join(' | ')}`);
  return reduce(state, r.turn);
}

/** Alex's goal exploration up to the home-savings question, via the account snapshot. */
function alexToHomeSavings() {
  let s = click(opened(), 'Help me explore a savings goal.');
  s = click(s, 'Use my account snapshot.');
  s = click(s, 'In 1–5 years');
  s = run(s, { type: 'setTimelineMonths', months: 36 }, { type: 'setTarget', amount: 50000 });
  expect(s.step).toBe('homeSavings');
  return s;
}

describe('education-first opening', () => {
  it('greets with an open question and optional starters', () => {
    const s = opened();
    expect(s.messages[0].text).toBe('Hi Alex, what would you like to understand about saving for your first home?');
    expect(getPrompt(s).replies.map((r) => r.label)).toEqual([
      'I don’t know where to start.',
      'What can Tangerine help me with?',
      'Explain home-saving accounts.',
      'Help me explore a savings goal.',
    ]);
  });

  it('answers educational questions before any onboarding, without asking for account access', () => {
    let s = typed(opened(), 'What is an FHSA?');
    expect(lastSunny(s)).toMatch(/registered account/);
    expect(s.messages.at(-1)!.sources).toContain('gov-fhsa-overview');
    s = typed(s, 'Is an FHSA an investment?');
    expect(lastSunny(s)).toMatch(/Not by itself/);
    s = typed(s, 'Does Tangerine offer one?');
    expect(lastSunny(s)).toMatch(/can’t confirm/);
    s = typed(s, 'Can I take the money out whenever I want?');
    s = typed(s, 'Can I lose money?');
    s = typed(s, 'What can Tangerine actually help me with?');
    s = typed(s, 'I don’t know how much I need yet.');
    expect(lastSunny(s)).toMatch(/don’t need a number yet/);
    s = typed(s, 'I’m overwhelmed. Can you explain that more simply?');
    expect(lastSunny(s)).toMatch(/minimum you need to put down/);
    expect(s.facts.dataSource).toBeNull();
    expect(s.facts.goalConfirmed).toBe(false);
    expect(allText(s)).not.toMatch(/account snapshot/);
    expect(allText(s)).not.toMatch(/can’t help with that/);
  });

  it('offers related follow-ups and the optional goal explorer after a topic', () => {
    const s = click(opened(), 'Explain home-saving accounts.');
    const labels = getPrompt(s).replies.map((r) => r.label);
    expect(labels).toContain('Is an FHSA an investment?');
    expect(labels).toContain('Help me explore a savings goal.');
  });
});

describe('snapshot permission', () => {
  it('is asked only when exploring a personal goal, and both routes work', () => {
    let s = click(opened(), 'Help me explore a savings goal.');
    expect(s.step).toBe('permission');
    const viaSnapshot = click(s, 'Use my account snapshot.');
    expect(viaSnapshot.facts.dataSource).toBe('snapshot');
    expect(viaSnapshot.messages.some((m) => m.card?.kind === 'snapshot')).toBe(true);
    s = click(s, 'I’d rather enter the details myself.');
    expect(s.facts.dataSource).toBe('manual');
    expect(buildChatRequest(s).snapshot).toBeNull();
    expect(buildChatRequest(viaSnapshot).snapshot?.savingsBalance).toBe(24000);
    // Only snapshot fields are sent: the customer's own pre-filled answers are never included.
    expect(JSON.stringify(buildChatRequest(viaSnapshot).snapshot)).not.toMatch(/emergencyReserve|homeTarget/);
  });
});

describe('default goal journey', () => {
  it('handles the emergency reserve: $24,000 savings, keep $10,000 aside → $14,000', () => {
    let s = alexToHomeSavings();
    expect(lastSunny(s)).toMatch(/\$24,000 in savings/);
    expect(s.facts.reservedSeparately).toBeNull();
    s = click(s, 'Keep $10,000 aside for emergencies');
    expect(s.facts.homeSavings).toBe(14000);
    expect(s.facts.reservedSeparately).toBe(10000);
    expect(allText(s)).toContain(
      'Thanks for clarifying. I’ll keep that $10,000 separate and use $14,000 as your starting amount for this goal.',
    );
    expect(s.step).toBe('monthly');
  });

  it('produces the default scenario numbers and summary', () => {
    let s = click(alexToHomeSavings(), 'Keep $10,000 aside for emergencies');
    s = run(s, { type: 'setMonthly', amount: 700 });
    expect(s.step).toBe('explore');
    expect(allText(s)).toContain('$10,800 short');
    expect(allText(s)).toContain('$1,000 a month');
    const summary = buildSummary(s);
    expect(summary.result?.projectedTotal).toBe(39200);
    expect(summary.reservedSeparately).toBe(10000);
  });

  it('zero monthly amount responds respectfully without a product path', () => {
    let s = click(alexToHomeSavings(), 'Keep $10,000 aside for emergencies');
    s = click(s, 'I can’t set anything aside right now');
    expect(allText(s)).toMatch(/completely okay/);
    const labels = getPrompt(s).replies.map((r) => r.label);
    expect(labels).toContain('Save a summary of this conversation');
    expect(labels).not.toContain('Which investment should I buy?');
  });

  it('target already reached shows no negative gap', () => {
    let s = alexToHomeSavings();
    s = run(s, { type: 'askHomeSavingsAmount' }, { type: 'setHomeSavings', amount: 20000 });
    s = run(s, { type: 'updateFacts', patch: { target: 15000 } }, { type: 'setMonthly', amount: 700 });
    expect(allText(s)).toMatch(/already meet the \$15,000 target/);
    expect(allText(s)).not.toMatch(/-\$|NaN|Infinity/);
  });

  it('keeps investment requests within educational scope', () => {
    const s = typed(opened(), 'Which investment should I buy?');
    expect(lastSunny(s)).toMatch(/can’t determine the right investment for you/);
    expect(getPrompt(s).replies.slice(0, 2).map((r) => r.label)).toEqual(['Explain the options', 'Prepare questions for human support']);
  });

  it('clarifies unclear messages instead of refusing', () => {
    const s = typed(opened(), 'What is the weather tomorrow?');
    expect(lastSunny(s)).toMatch(/I’m not sure I followed/);
    expect(getPrompt(s).replies.length).toBeGreaterThan(2);
  });
});

describe('corrections and validation', () => {
  it('“Keep $10,000 for emergencies” typed later is an allocation correction, not a topic', () => {
    let s = click(alexToHomeSavings(), 'All of it');
    s = run(s, { type: 'setMonthly', amount: 700 });
    expect(s.facts.homeSavings).toBe(24000);
    s = typed(s, 'Actually, keep $10,000 for emergencies');
    expect(s.facts.homeSavings).toBe(14000);
    expect(s.facts.reservedSeparately).toBe(10000);
    expect(s.activeTopic).not.toBe('emergency');
    const sum = buildSummary(s);
    expect(sum.result?.projectedTotal).toBe(39200);
    expect(sum.note).toContain('$14,000');
    expect(sum.note).not.toContain('$24,000');
  });

  it('an ambiguous emergency correction asks how much', () => {
    let s = click(alexToHomeSavings(), 'All of it');
    s = typed(s, 'Actually, I need some of that money for emergencies.');
    expect(s.step).toBe('reserveAmount');
    expect(s.facts.homeSavings).toBe(24000);
    s = typed(s, '8000');
    expect(s.facts.reservedSeparately).toBe(8000);
    expect(s.facts.homeSavings).toBe(16000);
  });

  it('negative amounts are never silently made positive', () => {
    let s = click(alexToHomeSavings(), 'Keep $10,000 aside for emergencies');
    s = run(s, { type: 'setMonthly', amount: 700 });
    s = typed(s, 'change monthly to -500');
    expect(s.facts.monthly).toBe(700);
    expect(lastSunny(s)).toMatch(/negative amount/);
    s = run(s, { type: 'setMonthly', amount: -50 });
    expect(s.facts.monthly).toBe(700);
  });

  it('home savings above the snapshot balance ask about money held elsewhere', () => {
    let s = alexToHomeSavings();
    s = run(s, { type: 'askHomeSavingsAmount' }, { type: 'setHomeSavings', amount: 30000 });
    expect(s.step).toBe('confirmElsewhere');
    expect(s.facts.homeSavings).toBeNull();
    expect(lastSunny(s)).toMatch(/more than the \$24,000/);
    const declined = click(s, 'No, let me re-enter it');
    expect(declined.facts.homeSavings).toBeNull();
    expect(declined.step).toBe('homeSavingsAmount');
    s = click(s, 'Yes, some is held elsewhere');
    expect(s.facts.homeSavings).toBe(30000);
    expect(s.facts.homeSavingsHeldElsewhere).toBe(true);
    expect(s.step).toBe('monthly');
  });

  it('updates recalculate and the summary uses only current values', () => {
    let s = click(alexToHomeSavings(), 'Keep $10,000 aside for emergencies');
    s = run(s, { type: 'setMonthly', amount: 700 });
    s = typed(s, 'change monthly to 1000');
    s = typed(s, 'change my timeline to 4 years');
    s = typed(s, 'starting savings 20000');
    expect(s.facts.reservedSeparately).toBe(4000);
    const sum = buildSummary(s);
    expect(sum.result?.projectedTotal).toBe(68000);
    expect(calculateScenario(scenarioInput(s.facts)!).remainingGap).toBe(0);
  });
});

describe('education detours', () => {
  it('preserve progress and allow returning to the goal flow', () => {
    const before = alexToHomeSavings();
    let s = typed(before, 'What is an FHSA?');
    expect(s.step).toBe('homeSavings');
    expect(s.facts).toEqual(before.facts);
    s = typed(s, 'how is a tfsa different?');
    expect(s.topicsExplored).toEqual(['fhsa', 'tfsa']);
    s = click(s, 'Continue where we left off');
    expect(lastSunny(s)).toMatch(/How much of that is available/);
    s = click(s, 'Keep $10,000 aside for emergencies');
    expect(s.facts.homeSavings).toBe(14000);
  });
});

describe('AI-mode effects', () => {
  const aiState = () => run(createInitialState(DEFAULT_PROFILE, 'ai'), { type: 'open' }, { type: 'customerMessage', text: 'hi' });
  const respond = (s: ConversationState, response: Partial<ChatResponse>) =>
    run(s, { type: 'aiTurn', response: { reply: 'ok', sourceIds: [], suggestions: [], effects: [], ...response } });

  it('drops unknown source ids and keeps valid ones', () => {
    const s = respond(aiState(), { sourceIds: ['gov-tfsa', 'made-up', 'https://evil.example'] });
    expect(s.messages.at(-1)!.sources).toEqual(['gov-tfsa']);
    expect(s.sourcesCited).toEqual(['gov-tfsa']);
  });

  it('re-validates fact updates: negatives and over-balance values are not applied', () => {
    let s = run(aiState(), { type: 'snapshotDecision', allow: true });
    s = respond(s, { effects: [{ type: 'factsUpdated', patch: { monthly: -100, homeSavings: 99999, target: 50000 } }] });
    expect(s.facts.monthly).toBeNull();
    expect(s.facts.homeSavings).toBeNull();
    expect(s.facts.target).toBe(50000);
  });

  it('applies a reserve correction and shows a validated scenario card', () => {
    let s = run(aiState(), { type: 'snapshotDecision', allow: true });
    s = respond(s, { effects: [{ type: 'factsUpdated', patch: { reservedSeparately: 10000, homeSavings: 14000 } }] });
    expect(s.facts.homeSavings).toBe(14000);
    s = respond(s, {
      effects: [{ type: 'scenario', input: { startingSavings: 14000, target: 50000, monthly: 700, months: 36 }, hypothetical: true }],
    });
    expect(s.messages.at(-1)!.card).toMatchObject({ kind: 'scenario', hypothetical: true });
    const bad = respond(s, { effects: [{ type: 'scenario', input: { startingSavings: -1, target: 0, monthly: NaN, months: 0 }, hypothetical: false }] });
    expect(bad.messages.at(-1)!.card).toBeUndefined();
  });

  it('a permission request shows Allow / Not now and declining keeps data private', () => {
    let s = respond(aiState(), { effects: [{ type: 'requestSnapshotPermission', reason: 'To compare with your balances' }] });
    expect(getPrompt(s).replies.map((r) => r.label)).toEqual(['Yes, use my account snapshot', 'Not now']);
    s = run(s, { type: 'snapshotDecision', allow: false });
    expect(buildChatRequest(s).snapshotPermission).toBe('declined');
    expect(buildChatRequest(s).snapshot).toBeNull();
  });

  it('errors are local (not sent to the model) and can be cleared for retry', () => {
    let s = run(aiState(), { type: 'aiError', code: 'timeout', message: 'Too slow' });
    expect(s.messages.at(-1)!.card?.kind).toBe('error');
    expect(buildChatRequest(s).messages.at(-1)).toEqual({ role: 'customer', text: 'hi' });
    s = run(s, { type: 'clearAiError' });
    expect(s.messages.at(-1)!.role).toBe('customer');
  });
});

describe('scenario reset', () => {
  it('restart clears facts and history', () => {
    let s = click(alexToHomeSavings(), 'Keep $10,000 aside for emergencies');
    s = typed(s, 'restart');
    s = click(s, 'Yes, start over');
    expect(s.facts.homeSavings).toBeNull();
    expect(s.messages).toHaveLength(2);
  });

  it('switching presets resets state so nothing leaks between customers', () => {
    let s = click(alexToHomeSavings(), 'Keep $10,000 aside for emergencies');
    s = run(s, { type: 'openTopic', topic: 'gic' });
    const sam = PRESETS.find((p) => p.id === 'sam')!.profile;
    s = run(s, { type: 'loadProfile', profile: sam }, { type: 'open' });
    expect(s.messages[0].text).toMatch(/^Hi Sam/);
    expect(s.facts.homeSavings).toBeNull();
    expect(s.topicsExplored).toEqual([]);
    expect(s.sourcesCited).toEqual([]);
  });
});

describe('AI reserve correction (client re-validation)', () => {
  it('derives home-goal savings from the snapshot when only a reserve arrives', () => {
    let s = run(createInitialState(DEFAULT_PROFILE, 'ai'), { type: 'open' }, { type: 'customerMessage', text: 'keep $10,000 for emergencies' });
    s = run(s, { type: 'snapshotDecision', allow: true });
    s = run(s, { type: 'aiTurn', response: { reply: 'ok', sourceIds: [], suggestions: [], effects: [{ type: 'factsUpdated', patch: { homeSavings: 24000 } }] } });
    s = run(s, { type: 'aiTurn', response: { reply: 'ok', sourceIds: [], suggestions: [], effects: [{ type: 'factsUpdated', patch: { reservedSeparately: 10000 } }] } });
    expect(s.facts.reservedSeparately).toBe(10000);
    expect(s.facts.homeSavings).toBe(14000);
  });
});
