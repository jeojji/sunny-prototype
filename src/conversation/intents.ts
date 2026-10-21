/**
 * Keyword interpreter for typed text in the scripted demo mode. Maps text to
 * a supported event; anything else becomes a clarifying 'unsupported' reply.
 * AI mode does not use this file: the model interprets text on the server.
 */
import { parseAmount } from '../lib/calc';
import { findAmounts, parseDuration } from '../lib/parse';
import type { ConversationState, CustomerTurn, SunnyEvent } from './types';

const has = (text: string, re: RegExp) => re.test(text);

/** First amount in the text: positive value, or a flag that it was negative. */
function firstAmount(text: string): { value: number; negative: boolean } | null {
  return findAmounts(text)[0] ?? null;
}

function classify(raw: string, state: ConversationState): SunnyEvent {
  const t = raw.toLowerCase().trim().replace(/[’]/g, "'");
  const step = state.step;
  const amount = firstAmount(t);

  if (has(t, /\b(restart|start over|reset)\b/)) return { type: 'requestRestart' };

  // Advice requests come before topic matching ("should I buy a GIC?" is a recommendation request).
  if (
    (has(t, /\brecommend|\badvi[cs]e me\b|\bwhich (one )?should i\b|\bbest (one|option|account|investment) for me\b/) ||
      has(t, /\b(which|what|should i)\b.*\b(invest\w*|buy|stocks?|etfs?|funds?|put my money)\b/)) &&
    !has(t, /\bwhat (is|are|does)\b/)
  ) {
    return { type: 'askInvestment' };
  }

  // Emergency-money allocation in context, e.g. "keep $10,000 for emergencies" or "I need some of that for emergencies".
  if (has(t, /emergenc/) && has(t, /\b(keep|need|set aside|aside|hold back|reserve|save|leave|separate)\b/) && !has(t, /\bwhy\b/)) {
    if (amount?.negative) return { type: 'invalidAmount', reason: 'negative' };
    return { type: 'setEmergencyReserve', amount: amount ? amount.value : null };
  }

  // Negative amounts are never silently made positive.
  if (amount?.negative) return { type: 'invalidAmount', reason: 'negative' };

  // Bare answers to the current question.
  if (/^\$?\s?[\d,]+(\.\d+)?\s?k?$/.test(t)) {
    const n = parseAmount(t);
    if (n !== null) {
      switch (step) {
        case 'target':
          return { type: 'setTarget', amount: n };
        case 'homeSavings':
        case 'homeSavingsAmount':
          return { type: 'setHomeSavings', amount: n };
        case 'reserveAmount':
          return { type: 'setEmergencyReserve', amount: n };
        case 'monthly':
          return { type: 'setMonthly', amount: n };
        case 'timelineMonths':
          return Number.isInteger(n) ? { type: 'setTimelineMonths', months: n } : { type: 'invalidAmount', reason: 'unclear' };
        case 'editTarget':
          return { type: 'updateFacts', patch: { target: n } };
        case 'editHomeSavings':
          return { type: 'updateFacts', patch: { homeSavings: n } };
        case 'editMonthly':
          return { type: 'updateFacts', patch: { monthly: n } };
        case 'editTimeline':
          return Number.isInteger(n) ? { type: 'updateFacts', patch: { timelineMonths: n } } : { type: 'invalidAmount', reason: 'unclear' };
      }
    }
  }
  const duration = parseDuration(t);
  if (duration !== null && (step === 'timeline' || step === 'timelineMonths')) return { type: 'setTimelineMonths', months: duration };
  if (duration !== null && step === 'editTimeline') return { type: 'updateFacts', patch: { timelineMonths: duration } };
  if (step === 'confirmElsewhere') {
    if (has(t, /^(yes|yep|yeah|sure)\b|elsewhere|another|other (bank|account)/)) return { type: 'confirmHeldElsewhere', yes: true };
    if (has(t, /^(no|nope)\b|re-?enter|mistake|typo/)) return { type: 'confirmHeldElsewhere', yes: false };
  }

  // Simplify / overwhelmed.
  if (has(t, /overwhelm|simpler|simply|plain english|too much|confus|eli5|don't understand|lost me/)) return { type: 'simpler' };

  // Education topics (more specific first).
  if (has(t, /timeline matter|why (does|is) (the |my )?timeline|why.*timing/)) return { type: 'openTopic', topic: 'timeline' };
  if (has(t, /\bfhsa\b|first home savings/)) {
    if (has(t, /tangerine|you (guys )?offer|do you have|can i open|available/)) return { type: 'openTopic', topic: 'fhsaTangerine' };
    if (has(t, /\binvest|risk|lose|inside|hold\b/)) return { type: 'openTopic', topic: 'fhsaInvestment' };
    if (has(t, /\btfsa\b|tax.free savings|differ/)) return { type: 'openTopic', topic: 'tfsa' };
    return { type: 'openTopic', topic: 'fhsa' };
  }
  if (has(t, /(does|do) (tangerine|you) offer (one|it)|offer one\b/) && state.activeTopic && ['fhsa', 'fhsaInvestment', 'accounts', 'tfsa'].includes(state.activeTopic)) {
    return { type: 'openTopic', topic: 'fhsaTangerine' };
  }
  if (has(t, /\btfsa\b|tax.free savings/)) return { type: 'openTopic', topic: 'tfsa' };
  if (has(t, /\bgics?\b|guaranteed investment/)) return { type: 'openTopic', topic: 'gic' };
  if (has(t, /lose (my )?money|risky|risk|safe\b|insured|cdic|guaranteed\b/)) return { type: 'openTopic', topic: 'risk' };
  if (has(t, /take (the |my )?money out|withdraw|whenever i want|access (my|the) money|locked in|get my money/)) return { type: 'openTopic', topic: 'access' };
  if (has(t, /what can tangerine|tangerine (actually )?help|how can tangerine|what does tangerine offer|tangerine products?/)) {
    return { type: 'openTopic', topic: 'tangerine' };
  }
  if (has(t, /don't know (where|how) to start|where (do|should) i (start|begin)|no idea where/)) return { type: 'openTopic', topic: 'start' };
  if (has(t, /how much (do|will|would) i need|don't know how much|down payment|minimum/)) return { type: 'openTopic', topic: 'downPayment' };
  if (has(t, /home.saving accounts?|accounts? (for|to) (save|saving)|which accounts|types of accounts|home buyers'? plan|\bhbp\b|\brrsp\b/)) {
    return { type: 'openTopic', topic: 'accounts' };
  }
  if (has(t, /emergenc/)) return { type: 'openTopic', topic: 'emergency' };
  if (has(t, /prepare|documents?|what (info|information)|bring|before (speaking|talking|meeting)|checklist/)) return { type: 'openTopic', topic: 'prepare' };
  if (has(t, /contact|phone|call (tangerine|them)|chat with|reach (tangerine|them)|hours/)) return { type: 'openTopic', topic: 'contact' };
  if (has(t, /\boptions?\b|compare/) && state.offer === 'investment') return { type: 'openTopic', topic: 'options' };

  // Assumption changes.
  const value = amount && !amount.negative ? amount.value : null;
  if (has(t, /monthly|per month|a month|each month|\/\s?mo/)) {
    return value !== null ? { type: 'updateFacts', patch: { monthly: value } } : { type: 'startEdit', field: 'monthly' };
  }
  if (has(t, /starting (savings|amount)|already saved|saved so far|home savings|savings (for|toward) (the|this|my) (goal|home)/)) {
    return value !== null ? { type: 'updateFacts', patch: { homeSavings: value } } : { type: 'startEdit', field: 'homeSavings' };
  }
  if (has(t, /\btarget\b|goal amount/)) {
    return value !== null && value > 0 ? { type: 'updateFacts', patch: { target: value } } : { type: 'startEdit', field: 'target' };
  }
  if (has(t, /timeline|buy in|buying in|purchase in|when i buy/) || (duration !== null && has(t, /change|instead|actually/))) {
    return duration !== null ? { type: 'updateFacts', patch: { timelineMonths: duration } } : { type: 'startEdit', field: 'timelineMonths' };
  }
  if (has(t, /change|edit|update|correct/) && has(t, /assumption|number|detail|answer/)) return { type: 'pickEdit' };

  // Navigation and journey.
  if (has(t, /human|person|advis|someone|support|talk to|speak (to|with)|call me|agent/)) return { type: 'prepareSupport' };
  if (has(t, /summary|recap|wrap up/)) return { type: 'showSummary' };
  if (has(t, /next steps?/)) return { type: 'pickNextSteps' };
  if (has(t, /savings goal|explore (a |my )?goal|how much (could|can) i save|calculat|scenario|how long (will|would) it take/)) return { type: 'confirmGoal' };
  if (!state.facts.goalConfirmed && has(t, /buy (a|my) (first )?(home|house|condo|place)|buying a (home|house|condo)|homeowner/)) {
    return { type: 'openTopic', topic: 'start' };
  }
  if (step === 'permission') {
    if (has(t, /snapshot|use my account|^(yes|sure|ok|okay)\b/)) return { type: 'chooseDataSource', source: 'snapshot' };
    if (has(t, /myself|manual|enter|^no\b/)) return { type: 'chooseDataSource', source: 'manual' };
  }
  if (step === 'confirmRestart') {
    if (has(t, /^(yes|yep|sure)\b/)) return { type: 'confirmRestart' };
    if (has(t, /^(no|nope|cancel)\b/)) return { type: 'cancel' };
  }
  if (has(t, /^(continue|go on|next|carry on|resume)\b/)) return { type: 'continue' };
  if (has(t, /^(back|go back|previous)\b/)) return { type: 'back' };
  if (has(t, /help|what can you|what do you do/)) return { type: 'help' };
  return { type: 'unsupported' };
}

export function interpretText(text: string, state: ConversationState): CustomerTurn {
  return { event: classify(text, state), say: text.trim() };
}

export { parseDuration };
