/**
 * Keyword interpreter for typed text in the scripted demo mode. Deliberately
 * limited: maps text to a supported event, otherwise a clarifying reply.
 * AI mode doesn't use this; the model interprets text on the server.
 */
import type { Allocation, Purpose } from '../domain/allocations';
import { findAmounts } from '../lib/parse';
import type { GoalType } from '../shared/offerings';
import type { ConversationState, CustomerTurn, Horizon, NextStepId, SunnyEvent } from './types';

const has = (text: string, re: RegExp) => re.test(text);

const PURPOSE_WORDS: [Purpose, RegExp][] = [
  ['emergency', /emergenc|rainy day|safety net|cushion/],
  ['upcoming_expenses', /bill|expense|rent|upcoming|spending|living costs|day.to.day/],
  ['tuition', /tuition|school|college|university|course/],
  ['debt_repayment', /debt|loan|credit card|line of credit/],
];

/** "I need $3,000 for bills and $10,000 for emergencies" → chequing allocations by purpose. */
export function parseAllocations(raw: string): Allocation[] {
  const text = raw.toLowerCase();
  const re = /\$?\s?\d[\d,]*(?:\.\d+)?\s?k?\b/g;
  const matches = [...text.matchAll(re)].filter((m) => !/^\s*(years?|months?|%)/.test(text.slice((m.index ?? 0) + m[0].length)));
  const out: Allocation[] = [];
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const nextStart = matches[i + 1]?.index ?? text.length;
    const after = text.slice(end, Math.min(nextStart, end + 60));
    const before = text.slice(Math.max(0, start - 30), start);
    const amount = findAmounts(m[0])[0];
    if (!amount || amount.negative) return;
    const purpose = PURPOSE_WORDS.find(([, w]) => w.test(after))?.[0] ?? PURPOSE_WORDS.find(([, w]) => w.test(before))?.[0];
    if (purpose && !out.some((a) => a.purpose === purpose)) out.push({ account: 'chequing', purpose, amount: amount.value });
  });
  return out;
}

export function parseGoal(t: string): GoalType | null {
  if (has(t, /build wealth|grow (it|my money|this)|invest|long.term|wealth|retire/)) return 'build_wealth';
  if (has(t, /accessible|earn(ing)? (some )?interest|keep it (safe|available)|high.interest|savings account/)) return 'accessible_interest';
  if (has(t, /home|house|condo|down payment|fhsa/)) return 'first_home';
  if (has(t, /understand|options|learn|before deciding|not sure what/)) return 'understand_options';
  return null;
}

export function parseHorizon(t: string): Horizon | null {
  if (has(t, /not sure|don.t know|no idea|unsure/)) return 'not_sure';
  if (has(t, /next year|within (a|one) year|this year|few months|soon|1 year|under a year/)) return 'under_1_year';
  if (has(t, /(5|five)\+|more than (5|five)|over (5|five)|long.term|decade|10 years|retire|many years|at least (5|five)/)) return 'over_5_years';
  if (has(t, /(2|3|4|two|three|four|couple|few) years|1.5 years|1-5|one to five/)) return '1_to_5_years';
  return null;
}

export function parseNextStep(t: string): NextStepId | null {
  if (has(t, /risk/) && has(t, /learn|understand|first|before/)) return 'learn_risk';
  if (has(t, /compare/)) return 'compare_options';
  if (has(t, /scenario|calculat|illustrat|what if i (put|save|add)/)) return 'explore_scenario';
  if (has(t, /official|product page|read (more|the page)/)) return 'read_product_page';
  if (has(t, /prepare questions|questions for/)) return 'prepare_questions';
  if (has(t, /come back|save (this|it) for later|later\b|remind me/)) return 'save_for_later';
  if (has(t, /not right now|no thanks|don.t want to|not interested|stop here/)) return 'not_proceeding';
  return null;
}

function earmarkNote(t: string): string | null {
  if (has(t, /tuition|school|college|university/)) return 'for tuition';
  if (has(t, /home|house|condo|down payment/)) return 'for a home purchase';
  if (has(t, /wedding/)) return 'for a wedding';
  if (has(t, /car|vehicle/)) return 'for a vehicle';
  if (has(t, /trip|travel/)) return 'for travel';
  return null;
}

function classify(raw: string, state: ConversationState): SunnyEvent {
  const t = raw.toLowerCase().replace(/[’]/g, "'").trim();
  const stage = state.stage;
  const amounts = findAmounts(t);

  if (has(t, /\b(restart|start over|reset)\b/)) return { type: 'requestRestart' };

  // Advice requests (individual recommendations) come first.
  if (
    has(t, /should i (invest|put|buy|move)|which (fund|investment|portfolio|one) should|what should i (invest|buy|do with)|recommend|tell me what to (do|buy)|is it a good idea to invest|best (investment|fund|option) for me/) &&
    !has(t, /what is|what are|what's the difference/)
  ) {
    return { type: 'askInvestment' };
  }
  if (amounts.some((a) => a.negative)) return { type: 'invalidAmount', reason: 'negative' };

  // Stage-specific answers.
  if (stage === 'permission') {
    if (has(t, /^(yes|yeah|sure|ok|okay|go ahead)\b|use my (account|details)/)) return { type: 'permission', allow: true };
    if (has(t, /^(no|nope)\b|general|rather not|don't use/)) return { type: 'permission', allow: false };
  }
  if (stage === 'clarifyOver') {
    if (has(t, /another|elsewhere|other (bank|account)|outside/)) return { type: 'clarifyOver', heldElsewhere: true };
    if (has(t, /re-?enter|mistake|wrong|adjust|no\b/)) return { type: 'clarifyOver', heldElsewhere: false };
  }
  if (stage === 'confirmAllocations') {
    if (has(t, /^(yes|yep|yeah|right|correct|that's right|exactly)\b/)) return { type: 'confirmAllocations' };
    if (has(t, /^(no|not quite)\b|correct (that|it)|change|fix/) && !parseAllocations(t).length) return { type: 'askAllocationAmounts' };
  }
  const allocations = parseAllocations(t);
  if (allocations.length && (stage === 'purpose' || stage === 'purposeAmounts' || stage === 'confirmAllocations')) {
    return stage === 'purpose' ? { type: 'statePurpose', kind: 'allocations', allocations } : { type: 'setAllocations', allocations };
  }
  if (stage === 'purpose' || stage === 'purposeAmounts') {
    if (has(t, /debt|loan|credit card|owe/)) return { type: 'statePurpose', kind: 'debt' };
    if (has(t, /no (goal|plan)|don't have (a )?(goal|plan)|haven't done anything|nothing specific|no idea what|just sitting/)) {
      return { type: 'statePurpose', kind: 'no_plan' };
    }
    if (stage === 'purposeAmounts' && has(t, /^(no|none)\b|none of it/)) return { type: 'setAllocations', allocations: [] };
    if (has(t, /already|set aside|for (my |a )?(tuition|school|wedding|car|trip|house|home)|buying a (home|house)|is for|it's for|that's for|spoken for/)) {
      return { type: 'statePurpose', kind: 'earmarked', note: earmarkNote(t) ?? undefined };
    }
  }
  if (stage === 'goal') {
    const g = parseGoal(t);
    if (g) return { type: 'setGoal', goal: { type: g, detail: raw.trim().slice(0, 200) } };
    if (has(t, /something else|other/)) return { type: 'setGoal', goal: { type: 'other', detail: raw.trim().slice(0, 200) } };
  }
  if (stage === 'horizon') {
    const h = parseHorizon(t);
    if (h) return { type: 'setHorizon', horizon: h };
  }
  if (stage === 'explore') {
    const n = parseNextStep(t);
    if (n) return { type: 'chooseNextStep', step: n };
  }

  // Corrections anywhere: "Actually, keep $8,000 for emergencies".
  if (allocations.length && state.memory.allocations.length) return { type: 'setAllocations', allocations };

  // Education topics.
  if (has(t, /overwhelm|simpler|simply|plain english|too much|confus|lost me/)) return { type: 'simpler' };
  if (has(t, /why (are you|am i|did you)|why this|why me/)) return { type: 'openTopic', topic: 'why_asking' };
  if (has(t, /not ready|need (more )?time|don't want to decide|not sure yet|thinking about it/)) return { type: 'openTopic', topic: 'not_ready' };
  if (has(t, /gic.*(fund|etf)|(fund|etf).*gic/)) return { type: 'openTopic', topic: 'gic_vs_fund' };
  if (has(t, /(tfsa|tax.free).*(rrsp|rsp)|(rrsp|rsp).*(tfsa|tax.free)/)) return { type: 'openTopic', topic: 'tfsa_vs_rrsp' };
  if (has(t, /is (a|an|the) (tfsa|rrsp|rsp|fhsa) an investment|account vs|container|what goes inside/)) return { type: 'openTopic', topic: 'account_vs_holdings' };
  if (has(t, /lose (my )?money|risky|\brisk\b|safe\b|insured|cdic/)) return { type: 'openTopic', topic: 'risk' };
  if (has(t, /need (the|this|my|it|that) money (next year|soon)|need it (next year|soon)|what if i need/)) return { type: 'openTopic', topic: 'need_next_year' };
  if (has(t, /leave it in chequing|keep it in chequing|why (wouldn't|not) i (just )?leave|stay in chequing/)) return { type: 'openTopic', topic: 'leave_in_chequing' };
  if (has(t, /what can tangerine|tangerine (actually )?help|what does tangerine offer|tangerine (products|options)/)) return { type: 'openTopic', topic: 'tangerine_help' };
  if (has(t, /saving (vs|versus|and) investing|difference between saving|how (does )?investing works?|what is investing/)) return { type: 'openTopic', topic: 'saving_vs_investing' };
  if (has(t, /fhsa/)) return { type: 'openTopic', topic: has(t, /tangerine|offer/) ? 'fhsa_tangerine' : 'first_home' };
  if (has(t, /\btfsa\b|tax.free savings/)) return { type: 'openTopic', topic: 'tfsa' };
  if (has(t, /\brrsp\b|\brsp\b|retirement savings/)) return { type: 'openTopic', topic: 'rrsp' };
  if (has(t, /\bgics?\b|guaranteed investment/)) return { type: 'openTopic', topic: 'gic' };
  if (has(t, /fees?\b|cost|mer\b|management fee/)) return { type: 'openTopic', topic: 'fees' };
  if (has(t, /fund|etf|portfolio|mutual/)) return { type: 'openTopic', topic: 'funds' };
  if (has(t, /timeline|time horizon|how long/)) return { type: 'openTopic', topic: 'horizon' };
  if (has(t, /emergenc/)) return { type: 'openTopic', topic: 'emergency' };
  if (has(t, /debt|loan|credit card/)) return { type: 'openTopic', topic: 'debt' };
  if (has(t, /first home|buy(ing)? a (home|house)|down payment/)) return { type: 'openTopic', topic: 'first_home' };
  if (has(t, /contact|phone|call tangerine|hours/)) return { type: 'openTopic', topic: 'contact' };

  // Goals stated anywhere.
  const goal = parseGoal(t);
  if (goal && has(t, /\b(i want|i'd like|help me|my goal|i'm (hoping|trying|looking))\b/)) {
    return { type: 'setGoal', goal: { type: goal, detail: raw.trim().slice(0, 200) } };
  }

  // Navigation.
  if (has(t, /advis|talk to|speak (to|with)|a person|human|someone/)) return { type: 'openTopic', topic: 'advisors' };
  if (has(t, /prepare questions|questions for/)) return { type: 'prepareSupport' };
  if (has(t, /summar|recap|wrap up/)) return { type: 'showSummary' };
  if (has(t, /scenario|calculat|what if i (put|save|add)/)) return { type: 'startScenario' };
  if (has(t, /next step/)) return { type: 'pickNextStep' };
  if (stage === 'confirmRestart') {
    if (has(t, /^(yes|yep|sure)\b/)) return { type: 'confirmRestart' };
    if (has(t, /^(no|nope|cancel)\b/)) return { type: 'cancel' };
  }
  if (has(t, /^(continue|go on|next|carry on|resume)\b/)) return { type: 'continue' };
  if (has(t, /help|what can you/)) return { type: 'help' };
  return { type: 'unsupported' };
}

export function interpretText(text: string, state: ConversationState): CustomerTurn {
  return { event: classify(text, state), say: text.trim() };
}
