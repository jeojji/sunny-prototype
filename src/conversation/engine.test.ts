import { describe, expect, it } from 'vitest';
import { buildPreset } from '../data/customers';
import type { ChatResponse } from '../shared/api';
import { buildChatRequest } from './aiClient';
import { allocationSnapshot, createInitialState, dashboardCard, pendingCheckin, reduce } from './engine';
import { interpretText } from './intents';
import { getPrompt } from './prompts';
import { buildSummary } from './summary';
import type { ConversationState, SunnyEvent } from './types';

const run = (s: ConversationState, ...events: SunnyEvent[]) => events.reduce((x, event) => reduce(x, { event }), s);
const typed = (s: ConversationState, text: string) => reduce(s, interpretText(text, s));
const lastSunny = (s: ConversationState) => [...s.messages].reverse().find((m) => m.role === 'sunny' && m.text)!.text;
const allText = (s: ConversationState) => s.messages.map((m) => m.text).join('\n');
const fresh = (id = 'alex') => createInitialState(buildPreset(id));

function click(s: ConversationState, label: string) {
  const r = getPrompt(s).replies.find((x) => x.label === label);
  if (!r) throw new Error(`No reply "${label}" at stage ${s.stage}: ${getPrompt(s).replies.map((x) => x.label).join(' | ')}`);
  return reduce(s, r.turn);
}

/** Alex: nudge → permission → "$3,000 for bills and $10,000 for emergencies" → confirmed. */
function alexConfirmed() {
  let s = run(fresh(), { type: 'open', origin: 'nudge' });
  s = click(s, 'Yes, use my account details');
  s = click(s, 'I need $3,000 for bills and $10,000 for emergencies.');
  s = click(s, 'Yes, that’s right');
  return s;
}

describe('dashboard signal and nudge', () => {
  it('shows a nudge for Alex built from the actual signal, and none for Sam', () => {
    const card = dashboardCard(fresh());
    expect(card?.kind).toBe('nudge');
    if (card?.kind === 'nudge') expect(card.signal.evidence.daysBelowThreshold).toBe(0);
    expect(dashboardCard(fresh('sam'))).toBeNull();
  });

  it('“Not now” hides the nudge until the snooze ends', () => {
    let s = run(fresh(), { type: 'dismissNudge' });
    expect(dashboardCard(s)?.kind).toBe('notice');
    s = run(s, { type: 'simulateLaterVisit', days: 15 });
    expect(dashboardCard(s)).toBeNull();
    s = run(s, { type: 'simulateLaterVisit', days: 15 });
    expect(dashboardCard(s)?.kind).toBe('nudge');
  });

  it('“This money is already set aside” suppresses the nudge on later visits (undo restores it)', () => {
    let s = run(fresh(), { type: 'earmarkFromDashboard' });
    expect(dashboardCard(s)).toMatchObject({ kind: 'notice', undo: 'earmark' });
    expect(dashboardCard(run(s, { type: 'undoEarmark' }))?.kind).toBe('nudge');
    s = run(s, { type: 'simulateLaterVisit', days: 30 }, { type: 'simulateLaterVisit', days: 30 });
    expect(dashboardCard(s)).toBeNull();
  });

  it('is not repeated after the customer engaged with it', () => {
    const s = run(alexConfirmed(), { type: 'setView', view: 'dashboard' }, { type: 'simulateLaterVisit', days: 30 });
    expect(dashboardCard(s)).toBeNull();
  });

  it('review flag and short history suppress the nudge', () => {
    expect(dashboardCard(run(fresh(), { type: 'setProfileFlags', reviewFlag: true }))).toBeNull();
    expect(dashboardCard(run(fresh(), { type: 'setProfileFlags', historyDaysAvailable: 30 }))).toBeNull();
  });
});

describe('main demo loop (scripted)', () => {
  it('asks permission before using account details, then what the money is for', () => {
    let s = run(fresh(), { type: 'open', origin: 'nudge' });
    expect(s.stage).toBe('permission');
    expect(allText(s)).toMatch(/stayed above \$25,000 for the past 90 days/);
    expect(allText(s)).not.toMatch(/too much|doing nothing|should invest|available to invest/i);
    s = click(s, 'Yes, use my account details');
    expect(s.memory.permission).toBe('granted');
    expect(lastSunny(s)).toMatch(/upcoming expenses, emergencies, or something else/);
  });

  it('allocations: $28,000 − $3,000 − $10,000 = $15,000 not yet assigned; savings not added', () => {
    let s = run(fresh(), { type: 'open', origin: 'nudge' });
    s = click(s, 'Yes, use my account details');
    s = click(s, 'I need $3,000 for bills and $10,000 for emergencies.');
    const snap = allocationSnapshot(s);
    expect(snap).toMatchObject({ balance: 28_000, unassigned: 15_000, savingsBalance: 12_000 });
    expect(lastSunny(s)).toMatch(/leaves \$15,000 not yet assigned to a purpose/);
    expect(lastSunny(s)).toMatch(/\$12,000 savings balance is separate/);
    expect(allText(s)).not.toMatch(/available to invest/i);
  });

  it('goal → education first → one follow-up → offerings → next step', () => {
    let s = alexConfirmed();
    expect(lastSunny(s)).toBe('What would you like this money to help you do?');
    s = click(s, 'I want to build wealth, but I don’t know how investing works.');
    expect(s.memory.goal?.type).toBe('build_wealth');
    expect(allText(s)).toMatch(/Investing means buying things like funds/);
    expect(lastSunny(s)).toMatch(/when might you need this money/);
    s = click(s, 'More than 5 years away');
    const offers = s.messages.find((m) => m.card?.kind === 'offerings')?.card;
    expect(offers).toMatchObject({ kind: 'offerings' });
    if (offers?.kind === 'offerings') expect(offers.ids).toEqual(expect.arrayContaining(['investment-funds', 'tfsa', 'rsp', 'gic']));
    expect(allText(s)).toMatch(/isn’t a recommendation, and they aren’t the only options/);
    s = click(s, 'Learn about investment risk first');
    expect(s.memory.nextStep).toBe('learn_risk');
    expect(allText(s)).toMatch(/you can lose money/);
    const sum = buildSummary(s);
    expect(sum.prompted).toMatch(/stayed above \$25,000 for 90 days/);
    expect(sum.goal).toBe('Build wealth over time');
    expect(sum.nextStep).toBe('Learn about investment risk first');
    expect(sum.offeringsShown).toContain('Tangerine Investment Funds');
    expect(sum.offeringsExplored).toEqual([]);
    expect(sum.unknowns.join(' ')).toMatch(/comfort with investment risk/);
  });
});

describe('natural answers about the money', () => {
  const atPurpose = () => click(run(fresh(), { type: 'open', origin: 'nudge' }), 'Yes, use my account details');

  it('understands each example answer', () => {
    expect(typed(atPurpose(), 'I’m buying a home next year.').memory.prefs).toMatchObject({ earmarked: true, earmarkNote: 'for a home purchase' });
    expect(typed(atPurpose(), 'That money is for tuition.').memory.prefs).toMatchObject({ earmarked: true, earmarkNote: 'for tuition' });
    expect(typed(atPurpose(), 'I don’t have a goal. I just haven’t done anything with it.').stage).toBe('purposeAmounts');
    const debt = typed(atPurpose(), 'I have debt at another bank.');
    expect(debt.memory.topicsExplored).toContain('debt');
    expect(allText(debt)).toMatch(/I can only see your Tangerine accounts/);
  });

  it('allocations above the balance need clarification and are not saved', () => {
    const s = typed(atPurpose(), 'I need $20,000 for bills and $10,000 for emergencies.');
    expect(s.stage).toBe('clarifyOver');
    expect(s.memory.allocations).toEqual([]);
    expect(lastSunny(s)).toMatch(/\$30,000, which is more than the \$28,000/);
  });

  it('negative amounts are rejected', () => {
    expect(typed(atPurpose(), 'Keep -500 for emergencies').stage).toBe('purpose');
    expect(lastSunny(typed(atPurpose(), 'Keep -500 for emergencies'))).toMatch(/negative amount/);
  });

  it('Priya’s tuition answer suppresses future nudges', () => {
    let s = run(createInitialState(buildPreset('priya')), { type: 'open', origin: 'nudge' });
    s = click(s, 'Yes, use my account details');
    s = click(s, 'That money is for my tuition in January.');
    expect(lastSunny(s)).toMatch(/set aside for tuition and won’t suggest exploring it again/);
    s = run(s, { type: 'simulateLaterVisit', days: 30 });
    expect(dashboardCard(s)).toBeNull();
  });
});

describe('education before any goal', () => {
  it('answers the example questions without a goal or account data', () => {
    let s = run(fresh(), { type: 'open', origin: 'self' });
    for (const q of [
      'Can I lose money?',
      'Is a TFSA an investment?',
      'What’s the difference between a GIC and an investment fund?',
      'What if I need the money next year?',
      'Why wouldn’t I just leave it in chequing?',
      'I’m overwhelmed. Explain it more simply.',
      'What can Tangerine help me with?',
      'I’m not ready to decide.',
    ]) {
      s = typed(s, q);
      expect(lastSunny(s), q).not.toMatch(/I’m not sure I followed/);
    }
    expect(s.memory.topicsExplored).toEqual(expect.arrayContaining(['risk', 'account_vs_holdings', 'gic_vs_fund', 'need_next_year', 'leave_in_chequing', 'tangerine_help', 'not_ready']));
    expect(s.memory.goal).toBeNull();
    expect(s.memory.allocations).toEqual([]);
    expect(allText(s)).not.toMatch(/first-home saving/);
  });

  it('keeps individual recommendations out of scope', () => {
    const s = typed(run(fresh(), { type: 'open', origin: 'self' }), 'Should I invest the $15,000?');
    expect(lastSunny(s)).toMatch(/can’t tell you whether to invest this money/);
  });
});

describe('corrections update the summary and scenario', () => {
  it('“Actually, keep $8,000 for emergencies” replaces the earlier amount', () => {
    let s = click(alexConfirmed(), 'Understand the options before deciding');
    s = typed(s, 'Actually, keep $8,000 for emergencies.');
    expect(s.memory.allocations.find((a) => a.purpose === 'emergency')?.amount).toBe(8_000);
    expect(allocationSnapshot(s).unassigned).toBe(17_000);
    s = click(s, 'Yes, that’s right');
    expect(buildSummary(s).allocations.unassigned).toBe(17_000);
    expect(buildSummary(s).note).toMatch(/\$17,000 isn’t assigned/);
    s = run(s, { type: 'startScenario' });
    expect(getPrompt(s).scenarioForm?.initial.start).toBe(17_000);
    s = run(s, { type: 'runScenario', input: { start: 17_000, monthly: 400, months: 60, target: null } });
    expect(lastSunny(s)).toMatch(/total of \$41,000 before any interest or returns/);
    expect(buildSummary(s).scenario?.result.total).toBe(41_000);
  });
});

describe('later visits', () => {
  const withNextStep = (label: string) => {
    let s = click(alexConfirmed(), 'I want to build wealth, but I don’t know how investing works.');
    s = click(s, 'More than 5 years away');
    return click(s, label);
  };

  it('check-in reflects the actual saved next step, and takes priority over the nudge', () => {
    let s = run(withNextStep('Learn about investment risk first'), { type: 'setView', view: 'dashboard' });
    expect(pendingCheckin(s)).toBeNull();
    s = run(s, { type: 'simulateLaterVisit', days: 30 });
    expect(dashboardCard(s)).toMatchObject({ kind: 'checkin', text: 'Last time, you wanted to understand investment risk before deciding what to do. Would you like to pick that up?' });
    s = run(s, { type: 'checkin', action: 'continue' });
    expect(s.view).toBe('chat');
    expect(allText(s)).toMatch(/Welcome back, Alex/);
    expect(allText(s)).toMatch(/you can lose money/);
    expect(pendingCheckin(s)).toBeNull();
  });

  it('a different next step gives a different check-in', () => {
    const s = run(withNextStep('Compare these options'), { type: 'simulateLaterVisit', days: 30 });
    expect(pendingCheckin(s)?.text).toMatch(/compare the options we looked at/);
  });

  it('“Stop these check-ins”, “Remind me later” and “Not right now” are respected', () => {
    let s = run(withNextStep('Learn about investment risk first'), { type: 'simulateLaterVisit', days: 30 }, { type: 'checkin', action: 'stop' });
    s = run(s, { type: 'simulateLaterVisit', days: 30 });
    expect(pendingCheckin(s)).toBeNull();
    let r = run(withNextStep('Learn about investment risk first'), { type: 'simulateLaterVisit', days: 30 }, { type: 'checkin', action: 'remind_later' });
    expect(pendingCheckin(r)).toBeNull();
    r = run(r, { type: 'simulateLaterVisit', days: 30 });
    expect(pendingCheckin(r)).not.toBeNull();
    expect(pendingCheckin(run(click(withNextStep('More next steps'), 'Not right now'), { type: 'simulateLaterVisit', days: 30 }))).toBeNull();
  });

  it('“Change my goal” asks the goal question again', () => {
    const s = run(withNextStep('Learn about investment risk first'), { type: 'simulateLaterVisit', days: 30 }, { type: 'checkin', action: 'change_goal' });
    expect(s.stage).toBe('goal');
    expect(lastSunny(s)).toMatch(/What would you like this money to help you do now/);
  });
});

describe('permission before model access', () => {
  it('sends account details to the model only after permission', () => {
    let s = run(fresh(), { type: 'open', origin: 'nudge' });
    expect(buildChatRequest(s).account).toBeNull();
    const general = click(s, 'Keep it general');
    expect(buildChatRequest(general).account).toBeNull();
    s = click(s, 'Yes, use my account details');
    const req = buildChatRequest(s);
    expect(req.account).toMatchObject({ chequingBalance: 28_000, savingsBalance: 12_000, monthlyIncome: 5_200, monthlyExpenses: 3_600 });
    expect(req.account?.signal).toMatchObject({ threshold: 25_000, observationDays: 90 });
  });
});

describe('AI effects are re-validated', () => {
  const aiState = () => {
    let s = createInitialState(buildPreset('alex'), { mode: 'ai' });
    s = run(s, { type: 'open', origin: 'self' }, { type: 'permission', allow: true }, { type: 'customerMessage', text: 'hi' });
    return s;
  };
  const respond = (s: ConversationState, r: Partial<ChatResponse>) =>
    run(s, { type: 'aiTurn', response: { reply: 'ok', sourceIds: [], suggestions: [], effects: [], ...r } });

  it('rejects allocations above the balance and unknown offering/source ids', () => {
    let s = respond(aiState(), { effects: [{ type: 'allocationsUpdated', allocations: [{ account: 'chequing', purpose: 'emergency', amount: 40_000 }] }] });
    expect(s.memory.allocations).toEqual([]);
    expect(allText(s)).toMatch(/more than the \$28,000 in your chequing account, so I haven’t saved it/);
    s = respond(s, { sourceIds: ['tng-investment-funds', 'made-up'], effects: [{ type: 'offeringsShown', ids: ['investment-funds', 'crypto-fund'], reason: 'You asked' }] });
    expect(s.messages.find((m) => m.ai && m.text === 'ok' && m.sources)?.sources).toEqual(['tng-investment-funds']);
    expect(s.messages.at(-1)?.card).toMatchObject({ kind: 'offerings', ids: ['investment-funds'] });
  });

  it('applies valid goal, horizon, next step and allocations', () => {
    const s = respond(aiState(), {
      effects: [
        { type: 'allocationsUpdated', allocations: [{ account: 'chequing', purpose: 'upcoming_expenses', amount: 3_000 }, { account: 'chequing', purpose: 'emergency', amount: 10_000 }] },
        { type: 'goalSet', goal: { type: 'build_wealth', detail: 'learn investing' } },
        { type: 'horizonSet', horizon: 'over_5_years' },
        { type: 'nextStepSet', step: 'learn_risk' },
      ],
    });
    expect(allocationSnapshot(s).unassigned).toBe(15_000);
    expect(s.memory).toMatchObject({ goal: { type: 'build_wealth' }, horizon: 'over_5_years', nextStep: 'learn_risk' });
  });
});

describe('reset and isolation', () => {
  it('reset clears memory, conversation and simulated time', () => {
    let s = run(alexConfirmed(), { type: 'simulateLaterVisit', days: 30 });
    s = run(s, { type: 'confirmRestart' });
    expect(s.memory.allocations).toEqual([]);
    expect(s.messages).toEqual([]);
    expect(s.todayIndex).toBe(s.profile.spec.todayIndex);
  });

  it('loading another scenario starts clean', () => {
    const s = run(alexConfirmed(), { type: 'loadPreset', profile: buildPreset('sam') });
    expect(s.profile.firstName).toBe('Sam');
    expect(s.memory.allocations).toEqual([]);
    expect(s.memory.prefs.earmarked).toBe(false);
    expect(dashboardCard(s)).toBeNull();
  });
});

describe('summary topics', () => {
  it('lists only topics actually discussed, not supporting sources', () => {
    let s = click(alexConfirmed(), 'I want to build wealth, but I don’t know how investing works.');
    s = click(s, 'More than 5 years away');
    const topics = buildSummary(s).topics;
    expect(topics).toEqual(['Saving vs investing']);
  });
});
