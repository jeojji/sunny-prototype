import { describe, expect, it } from 'vitest';
import { nudgeHeadline } from '../components/Dashboard';
import { buildPreset, visibleHistory } from '../data/customers';
import { TOPICS } from '../data/education';
import { evaluateElevatedBalance, explainSignal } from '../domain/signal';
import type { ChatResponse } from '../shared/api';
import { buildChatRequest } from './aiClient';
import { createInitialState, dashboardCard, normalizeMemory, pendingCheckin, reduce } from './engine';
import { interpretText } from './intents';
import { getPrompt } from './prompts';
import { buildSummary } from './summary';
import type { ConversationState, SunnyEvent } from './types';

const run = (s: ConversationState, ...events: SunnyEvent[]) => events.reduce((x, event) => reduce(x, { event }), s);
const typed = (s: ConversationState, text: string) => reduce(s, interpretText(text, s));
const labels = (s: ConversationState) => getPrompt(s).replies.map((r) => r.label);
const allText = (s: ConversationState) => s.messages.map((m) => m.text).join('\n');
function click(s: ConversationState, label: string) {
  const r = getPrompt(s).replies.find((x) => x.label === label);
  if (!r) throw new Error(`No reply "${label}" at stage ${s.stage}: ${labels(s).join(' | ')}`);
  return reduce(s, r.turn);
}

/** Priya: nudge → permission → "That money is for my tuition in January." */
function priyaEarmarked() {
  let s = run(createInitialState(buildPreset('priya')), { type: 'open', origin: 'nudge' });
  s = click(s, 'Yes, use my account details');
  return click(s, 'That money is for my tuition in January.');
}

function alexToHorizon() {
  let s = run(createInitialState(buildPreset('alex')), { type: 'open', origin: 'nudge' });
  s = click(s, 'Yes, use my account details');
  s = click(s, 'I need $3,000 for bills and $10,000 for emergencies.');
  s = click(s, 'Yes, that’s right');
  return click(s, 'I want to build wealth, but I don’t know how investing works.');
}

describe('conversation navigation', () => {
  it('earmarked → “What if I need the money next year?” → several distinct, relevant follow-ups', () => {
    let s = priyaEarmarked();
    expect(s.stage).toBe('earmarked');
    s = click(s, 'What if I need the money next year?');
    const next = labels(s);
    expect(next).not.toContain('What if I need the money next year?');
    expect(next).toEqual(expect.arrayContaining(['How do savings accounts and GICs compare?', 'How does a TFSA work?', 'Explore a different goal']));
    expect(next.length).toBeGreaterThanOrEqual(3);
    expect(next.length).toBeLessThanOrEqual(5);
    expect(new Set(next).size).toBe(next.length);
    // Following one leads somewhere new again (no fixed menu).
    s = click(s, 'How do savings accounts and GICs compare?');
    expect(labels(s)).not.toContain('How do savings accounts and GICs compare?');
    expect(labels(s)).not.toEqual(next);
  });

  it('never immediately repeats the question just answered, across a long chain of follow-ups', () => {
    let s = run(createInitialState(buildPreset('alex')), { type: 'open', origin: 'self' }, { type: 'openTopic', topic: 'saving_vs_investing' });
    for (let i = 0; i < 10; i++) {
      const answered = TOPICS[s.activeTopic!].question;
      expect(labels(s)).not.toContain(answered);
      const nextTopic = getPrompt(s).replies.find((r) => r.turn.event.type === 'openTopic');
      expect(nextTopic, `no topic follow-up after ${answered}`).toBeTruthy();
      s = reduce(s, nextTopic!.turn);
    }
    expect(s.memory.topicsExplored.length).toBe(11);
  });

  it('other topics are reachable mid-question without resetting the conversation', () => {
    let s = run(createInitialState(buildPreset('alex')), { type: 'open', origin: 'nudge' });
    s = click(s, 'Yes, use my account details');
    const before = s.messages.length;
    s = run(s, { type: 'openTopic', topic: 'fees' }); // as from “Explore other topics”
    expect(s.stage).toBe('purpose');
    expect(s.messages.length).toBeGreaterThan(before);
    expect(labels(s)[0]).toBe('Continue where we left off');
    expect(labels(s)).not.toContain(TOPICS.fees.question);
    s = click(s, 'Continue where we left off');
    expect(s.messages.at(-1)!.text).toMatch(/upcoming expenses, emergencies, or something else/);
  });

  it('“Back to my goal” returns to an unfinished goal conversation', () => {
    let s = alexToHorizon(); // horizon question pending
    s = run(s, { type: 'openTopic', topic: 'fees' }, { type: 'setView', view: 'dashboard' }, { type: 'open', origin: 'nudge' });
    s = run(s, { type: 'resumeGoal' });
    expect(s.stage).toBe('horizon');
  });
});

describe('earmarks survive educational exploration', () => {
  it('keeps the earmark and nudge suppression; a new goal does not use the committed money', () => {
    let s = priyaEarmarked();
    s = click(s, 'What if I need the money next year?');
    s = click(s, 'How does a TFSA work?');
    s = click(s, 'Explore a different goal');
    expect(s.messages.at(-1)!.text).toMatch(/separate from the money you set aside for tuition\. I won’t use it/);
    s = typed(s, 'I want to build wealth over the long term');
    s = click(s, 'More than 5 years away');
    expect(s.memory.prefs).toMatchObject({ earmarked: true, earmarkNote: 'for tuition' });
    expect(s.memory.allocations).toEqual([]);
    s = run(s, { type: 'setView', view: 'dashboard' }, { type: 'simulateLaterVisit', days: 30 });
    expect(dashboardCard(s)?.kind).not.toBe('nudge');
  });
});

describe('product exploration follows goal and timeline', () => {
  const offeringsCard = (s: ConversationState) => [...s.messages].reverse().find((m) => m.card?.kind === 'offerings')!.card as { ids: string[] };

  it('short-term emphasises access and restrictions; long-term introduces investment funds', () => {
    const short = click(alexToHorizon(), 'Within a year');
    expect(offeringsCard(short).ids).toEqual(['savings-account', 'gic', 'tfsa']);
    expect(allText(short)).toMatch(/within a year.*access and stability.*can’t be cashed before maturity/s);
    const long = click(alexToHorizon(), 'More than 5 years away');
    expect(offeringsCard(long).ids).toEqual(expect.arrayContaining(['investment-funds', 'rsp', 'tfsa']));
    const unsure = click(alexToHorizon(), 'Not sure yet');
    expect(offeringsCard(unsure).ids).not.toContain('investment-funds');
    expect(allText(unsure)).toMatch(/timing isn’t settled/);
  });

  it('the full catalogue stays one explicit action away', () => {
    const s = run(click(alexToHorizon(), 'Within a year'), { type: 'browseOfferings' });
    expect(offeringsCard(s).ids).toHaveLength(6);
  });
});

describe('account-data permission is per session', () => {
  it('a later visit needs fresh permission, and no account details reach the model before it', () => {
    let s = run(createInitialState(buildPreset('alex')), { type: 'open', origin: 'nudge' });
    s = click(s, 'Yes, use my account details');
    s = click(s, 'I need $3,000 for bills and $10,000 for emergencies.');
    expect(buildChatRequest(s).account?.chequingBalance).toBe(28_000);
    s = run(s, { type: 'simulateLaterVisit', days: 30 });
    expect(s.memory.permission).toBe('not_asked');
    expect(s.memory.allocations).toHaveLength(2); // continuity of confirmed facts
    s = run(s, { type: 'open', origin: 'self' }, { type: 'customerMessage', text: 'What is a GIC?' });
    const req = buildChatRequest(s);
    expect(req.account).toBeNull();
    expect(JSON.stringify(req.messages)).not.toMatch(/28,000|28000/);
  });

  it('revoking permission keeps earlier account-detail messages out of model requests', () => {
    let s = createInitialState(buildPreset('alex'), { mode: 'scripted' });
    s = run(s, { type: 'open', origin: 'nudge' });
    s = click(s, 'Yes, use my account details');
    s = click(s, 'I need $3,000 for bills and $10,000 for emergencies.');
    expect(JSON.stringify(buildChatRequest(s).messages)).toMatch(/\$28,000/);
    s = run(s, { type: 'revokePermission' }, { type: 'customerMessage', text: 'What is a TFSA?' });
    const req = buildChatRequest(s);
    expect(req.permission).toBe('declined');
    expect(req.account).toBeNull();
    expect(JSON.stringify(req.messages)).not.toMatch(/28,000|25,000/);
  });

  it('saved memory from an earlier session never restores permission', () => {
    expect(normalizeMemory({ permission: 'granted' }).permission).toBe('not_asked');
  });
});

describe('offerings shown vs explored', () => {
  it('tracks cards shown separately from offerings the customer opened, and migrates old memory', () => {
    let s = click(alexToHorizon(), 'More than 5 years away');
    expect(s.memory.offeringsShown.length).toBeGreaterThan(0);
    expect(s.memory.offeringsExplored).toEqual([]);
    s = run(s, { type: 'exploreOffering', id: 'investment-funds' }, { type: 'exploreOffering', id: 'not-real' });
    expect(s.memory.offeringsExplored).toEqual(['investment-funds']);
    const sum = buildSummary(s);
    expect(sum.offeringsExplored).toEqual(['Tangerine Investment Funds']);
    expect(sum.offeringsShown.length).toBeGreaterThan(1);
    expect(normalizeMemory({ offeringsViewed: ['tfsa'] })).toMatchObject({ offeringsShown: ['tfsa'], offeringsExplored: [] });
  });
});

describe('signal wording with missing days', () => {
  it('says “on all observed days” and how many days have data', () => {
    const r = buildPreset('alex');
    const history = visibleHistory(r, 119).filter((b) => ![60, 70, 80].includes(b.day));
    const signal = evaluateElevatedBalance({ history, todayIndex: 119 });
    expect(signal.status).toBe('qualifies');
    const why = explainSignal(signal, 90);
    expect(why).toMatch(/Balance data is available for 87 of the last 90 days\. On all observed days/);
    expect(why).toMatch(/3 days have no data/);
    expect(why).not.toMatch(/end of each day/);
    expect(nudgeHeadline(signal, 90)).toMatch(/on every day with data over the past three months \(87 of 90 days\)/);
    const complete = evaluateElevatedBalance({ history: visibleHistory(r, 119), todayIndex: 119 });
    expect(nudgeHeadline(complete, 90)).toBe('Your chequing balance has stayed above $25,000 over the past three months.');
  });
});

describe('later-visit follow-through', () => {
  const withRiskStep = () => {
    let s = click(alexToHorizon(), 'More than 5 years away');
    s = click(s, 'Learn about investment risk first');
    return run(s, { type: 'setView', view: 'dashboard' }, { type: 'simulateLaterVisit', days: 30 });
  };

  it('“I did this” records completion and stops prompting the same step', () => {
    let s = run(withRiskStep(), { type: 'checkin', action: 'done' });
    expect(s.memory).toMatchObject({ nextStepDone: true, completedSteps: ['learn_risk'] });
    expect(s.messages.at(-1)!.text).toMatch(/marked “Learn about investment risk first” as done\. Nothing in your accounts has changed/);
    expect(labels(s)).not.toContain('Learn about investment risk first');
    s = run(s, { type: 'setView', view: 'dashboard' }, { type: 'simulateLaterVisit', days: 30 });
    expect(pendingCheckin(s)).toBeNull();
    expect(buildSummary(s).nextStepDone).toBe(true);
  });

  it('“Choose another next step” offers choices; a new step gets its own check-in', () => {
    let s = run(withRiskStep(), { type: 'checkin', action: 'another_step' });
    expect(s.memory.nextStepDone).toBe(false);
    s = click(s, 'Compare these options');
    s = run(s, { type: 'setView', view: 'dashboard' }, { type: 'simulateLaterVisit', days: 30 });
    expect(pendingCheckin(s)?.text).toMatch(/compare the options/);
  });
});

describe('AI suggestions', () => {
  const aiAfter = (suggestions: string[]) => {
    let s = createInitialState(buildPreset('alex'), { mode: 'ai' });
    s = run(s, { type: 'open', origin: 'self' }, { type: 'customerMessage', text: 'Can I lose money?' });
    const response: ChatResponse = { reply: 'It depends on what you hold.', sourceIds: [], suggestions, effects: [] };
    return run(s, { type: 'aiTurn', response });
  };

  it('empty or repetitive model suggestions get usable contextual fallbacks', () => {
    for (const bad of [[], ['', 'Can I lose money?', 'can i lose money', 'Can I lose money??']]) {
      const replies = getPrompt(aiAfter(bad)).replies;
      expect(replies.length).toBeGreaterThanOrEqual(3);
      for (const r of replies) {
        expect(r.label.toLowerCase()).not.toMatch(/^can i lose money/);
        expect(r.turn.event).toMatchObject({ type: 'customerMessage' });
      }
      expect(new Set(replies.map((r) => r.label)).size).toBe(replies.length);
    }
  });

  it('duplicate model suggestions are removed but good ones kept', () => {
    const replies = getPrompt(aiAfter(['What is a GIC?', 'What is a GIC?', 'How do TFSAs work?'])).replies.map((r) => r.label);
    expect(replies.slice(0, 2)).toEqual(['What is a GIC?', 'How do TFSAs work?']);
  });
});
