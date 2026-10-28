import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { hasPlan, signalFor } from '../conversation/engine';
import { getPrompt, type AllocationFormSpec, type ScenarioFormSpec } from '../conversation/prompts';
import type { ConversationState, CustomerTurn, Message, SunnyEvent } from '../conversation/types';
import type { OrbMode } from '../conversation/useSunny';
import { TOPICS } from '../data/education';
import { TOPIC_MENU } from '../conversation/navigation';
import type { Purpose } from '../domain/allocations';
import { isValidAmount, isValidMonths, MAX_MONTHS, parseAmount } from '../lib/calc';
import { LIMITS } from '../shared/api';
import { AllocationCard, EducationCard, FactsUpdatedCard, OfferingsCard, ScenarioCard, SignalCard, SourceList } from './Cards';
import { PlanPanel } from './PlanPanel';
import { RichText } from './RichText';
import { SunnyOrb } from './SunnyOrb';

interface Props {
  state: ConversationState;
  orb: OrbMode;
  thinking: boolean;
  pendingSay: string | null;
  send: (turn: CustomerTurn) => void;
  sendText: (text: string) => void;
  dispatch: (event: SunnyEvent) => void;
  onRetry: () => void;
  onUseScripted: () => void;
}

export function Chat({ state, orb, thinking, pendingSay, send, sendText, dispatch, onRetry, onUseScripted }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const prompt = getPrompt(state);
  const showPanel = hasPlan(state);
  const slow = useSlowFlag(thinking, 9000);
  const currentScenario = state.memory.scenario ? JSON.stringify(state.memory.scenario) : '';

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => el.scrollTo?.({ top: el.scrollHeight }));
    return () => cancelAnimationFrame(frame);
  }, [state.messages.length, pendingSay, thinking]);

  useEffect(() => {
    if (thinking) return;
    const active = document.activeElement;
    if (!active || active === document.body) controlsRef.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, [thinking, state.stage, state.messages.length]);

  return (
    <main className={`chat-layout${showPanel ? ' has-panel' : ''}`} id="main">
      <section className="chat" aria-label="Conversation with Sunny">
        <div className="chat-head">
          <SunnyOrb mode={orb} size={44} />
          <div className="chat-head-text">
            <h1 className="chat-title">Sunny</h1>
            <p className="chat-status" aria-live="polite">
              {thinking ? 'Thinking…' : 'Your money, your goals'}
            </p>
          </div>
          {state.mode === 'scripted' && (
            <span className="mode-pill" title="Replies are pre-written for this demonstration, not AI-generated.">
              Scripted demo
            </span>
          )}
        </div>

        {showPanel && (
          <details className="panel-mobile">
            <summary>Your plan so far</summary>
            <PlanPanel state={state} />
          </details>
        )}

        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label="Messages">
          {state.messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              showAvatar={m.role === 'sunny' && state.messages[i - 1]?.role !== 'sunny'}
              state={state}
              currentScenario={currentScenario}
              onOpen={(view) => dispatch({ type: 'setView', view })}
              onRetry={onRetry}
              onUseScripted={onUseScripted}
              isLast={i === state.messages.length - 1}
              busy={thinking}
              onExploreOffering={(id) => dispatch({ type: 'exploreOffering', id })}
            />
          ))}
          {pendingSay && (
            <div className="msg msg-customer">
              <div className="bubble">{pendingSay}</div>
            </div>
          )}
          {thinking && (
            <div className="msg msg-sunny">
              <span className="msg-avatar">
                <SunnyOrb mode="thinking" size={28} />
              </span>
              <div className="bubble typing" aria-label="Sunny is typing">
                <span />
                <span />
                <span />
                {slow && <em className="typing-note">Still working on it…</em>}
              </div>
            </div>
          )}
        </div>

        <div className="chat-controls" ref={controlsRef}>
          {!thinking && (
            <>
              {prompt.allocationForm && (
                <AllocationForm key={`alloc-${state.seq}`} spec={prompt.allocationForm} onSubmit={(v) => send(prompt.allocationForm!.toTurn(v))} />
              )}
              {prompt.scenarioForm && <ScenarioForm key={`scen-${state.seq}`} spec={prompt.scenarioForm} onSubmit={(t) => send(t)} />}
              {prompt.replies.length > 0 && (
                <div className="quick-replies" role="group" aria-label="Suggested replies">
                  {prompt.replies.map((r) => (
                    <button key={r.label} type="button" className={`chip${r.primary ? ' chip-primary' : ''}`} onClick={() => send(r.turn)}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <NavRow state={state} disabled={thinking} send={send} sendText={sendText} dispatch={dispatch} />
          <Composer disabled={thinking} onSend={sendText} />
        </div>
      </section>

      {showPanel && (
        <aside className="panel-desktop" aria-label="Your plan so far" id="plan-panel">
          <PlanPanel state={state} />
        </aside>
      )}
    </main>
  );
}

/**
 * Always-available navigation, independent of the current suggestions (and of
 * model output in AI mode): a topic menu, a secondary way to finish, and a way
 * to stop using account details.
 */
function NavRow({
  state,
  disabled,
  send,
  sendText,
  dispatch,
}: {
  state: ConversationState;
  disabled: boolean;
  send: (turn: CustomerTurn) => void;
  sendText: (text: string) => void;
  dispatch: (event: SunnyEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ai = state.mode === 'ai';
  const m = state.memory;
  const pick = (scripted: CustomerTurn, aiText: string) => {
    setOpen(false);
    if (ai) sendText(aiText);
    else send(scripted);
  };
  const goalLabel = m.goal && (!m.horizon || !m.nextStep) ? 'Back to my goal' : m.prefs.earmarked && !m.goal ? 'Explore a different goal' : 'Help me think through a goal';
  return (
    <div className="nav-row">
      <div className="nav-row-actions">
        <button type="button" className="link-button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)} disabled={disabled}>
          {open ? 'Close topics' : 'Explore other topics'}
        </button>
        {m.permission === 'granted' && (
          <button type="button" className="link-button" onClick={() => dispatch({ type: 'revokePermission' })} disabled={disabled}>
            Stop using my account details
          </button>
        )}
        <button type="button" className="link-button nav-done" onClick={() => dispatch({ type: 'setView', view: 'dashboard' })}>
          Done for now
        </button>
      </div>
      {open && (
        <div className="topic-menu" id={menuId} role="group" aria-label="Other topics">
          {TOPIC_MENU.map((g) => (
            <div key={g.heading} className="topic-group">
              <p className="topic-group-h">{g.heading}</p>
              <div className="topic-group-items">
                {g.topics.map((t) => (
                  <button key={t} type="button" className="chip chip-small" onClick={() => pick({ event: { type: 'openTopic', topic: t }, say: TOPICS[t].question }, TOPICS[t].question)}>
                    {TOPICS[t].question}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="topic-group">
            <p className="topic-group-h">More</p>
            <div className="topic-group-items">
              <button type="button" className="chip chip-small" onClick={() => pick({ event: { type: 'browseOfferings' }, say: 'Browse all Tangerine offerings' }, 'Show me all Tangerine offerings.')}>
                Browse all Tangerine offerings
              </button>
              <button
                type="button"
                className="chip chip-small"
                onClick={() => pick({ event: { type: goalLabel === 'Back to my goal' ? 'resumeGoal' : 'exploreGoal' }, say: goalLabel }, goalLabel === 'Back to my goal' ? 'Let’s get back to my goal.' : 'Help me think through a goal.')}
              >
                {goalLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function useSlowFlag(active: boolean, ms: number) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return slow;
}

function MessageRow({
  message,
  showAvatar,
  state,
  currentScenario,
  onOpen,
  onRetry,
  onUseScripted,
  isLast,
  busy,
  onExploreOffering,
}: {
  message: Message;
  showAvatar: boolean;
  state: ConversationState;
  currentScenario: string;
  onOpen: (view: 'summary' | 'handoff') => void;
  onRetry: () => void;
  onUseScripted: () => void;
  isLast: boolean;
  busy: boolean;
  onExploreOffering: (id: string) => void;
}) {
  const sunny = message.role === 'sunny';
  const card = message.card;
  return (
    <div className={`msg ${sunny ? 'msg-sunny' : 'msg-customer'}`}>
      {sunny && <span className="msg-avatar">{showAvatar && <SunnyOrb size={28} />}</span>}
      <div className="msg-body">
        {message.text && (
          <>
            <span className="visually-hidden">{sunny ? 'Sunny said:' : 'You said:'}</span>
            <div className="bubble">{sunny ? <RichText text={message.text} /> : message.text}</div>
          </>
        )}
        {card?.kind === 'education' && <EducationCard topic={card.topic} />}
        {card?.kind === 'signal' && <SignalCard signal={signalFor(state)} observationDays={state.signalConfig.observationDays} />}
        {card?.kind === 'allocations' && <AllocationCard snapshot={card.snapshot} />}
        {card?.kind === 'offerings' && <OfferingsCard ids={card.ids} reason={card.reason} onExplore={onExploreOffering} />}
        {card?.kind === 'scenario' && (
          <ScenarioCard input={card.input} hypothetical={card.hypothetical} outdated={JSON.stringify(card.input) !== currentScenario} />
        )}
        {card?.kind === 'factsUpdated' && <FactsUpdatedCard changes={card.changes} />}
        {card?.kind === 'action' && (
          <button type="button" className="btn btn-secondary action-button" onClick={() => onOpen(card.action)}>
            {card.action === 'summary' ? 'Review your summary' : 'Review the support preview'}
          </button>
        )}
        {card?.kind === 'error' && (
          <div className="error-card" role="alert">
            <p>
              <strong>{card.message}</strong>
            </p>
            {card.code === 'not_configured' ? (
              <p>Live AI needs a one-time setup on this computer (see README). You can continue with the scripted demo.</p>
            ) : card.code === 'rate_limited' ? (
              <p>Your conversation is saved. Wait a minute and try again, or continue with the scripted demo (pre-written replies, not AI).</p>
            ) : (
              <p>Your conversation is saved. You can try again, or continue with the scripted demo (pre-written replies, not AI).</p>
            )}
            {isLast && (
              <div className="error-actions">
                {card.code !== 'not_configured' && card.code !== 'bad_request' && (
                  <button type="button" className="btn btn-primary" onClick={onRetry} disabled={busy}>
                    Try again
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={onUseScripted} disabled={busy}>
                  Use scripted demo instead
                </button>
              </div>
            )}
          </div>
        )}
        {message.sources && message.sources.length > 0 && <SourceList ids={message.sources} />}
      </div>
    </div>
  );
}

function readAmount(raw: string): number | 'negative' | 'invalid' | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^[-−]/.test(t.replace(/^\$/, ''))) return 'negative';
  const n = parseAmount(t);
  return n === null || !isValidAmount(n) ? 'invalid' : n;
}

function AllocationForm({ spec, onSubmit }: { spec: AllocationFormSpec; onSubmit: (v: Partial<Record<Purpose, number>>) => void }) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(spec.fields.map((f) => [f.purpose, f.initial !== null ? String(f.initial) : ''])));
  const [error, setError] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const out: Partial<Record<Purpose, number>> = {};
    for (const f of spec.fields) {
      const v = readAmount(values[f.purpose] ?? '');
      if (v === 'negative') return setError('Amounts can’t be negative. Enter $0 or more.');
      if (v === 'invalid') return setError('Enter dollar amounts, like 3000.');
      if (v !== null) out[f.purpose] = v;
    }
    setError(null);
    onSubmit(out);
  }
  return (
    <form className="amount-form multi-amount" onSubmit={submit} noValidate>
      {spec.fields.map((f) => (
        <div key={f.purpose} className="amount-row-labelled">
          <label htmlFor={`${id}-${f.purpose}`}>{f.label}</label>
          <div className="amount-field">
            <span aria-hidden="true">$</span>
            <input
              id={`${id}-${f.purpose}`}
              inputMode="decimal"
              autoComplete="off"
              value={values[f.purpose]}
              placeholder="0"
              onChange={(e) => setValues((v) => ({ ...v, [f.purpose]: e.target.value }))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-err` : undefined}
            />
          </div>
        </div>
      ))}
      <button type="submit" className="btn btn-primary">
        {spec.submitLabel}
      </button>
      {error && (
        <p className="field-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ScenarioForm({ spec, onSubmit }: { spec: ScenarioFormSpec; onSubmit: (t: CustomerTurn) => void }) {
  const id = useId();
  const init = spec.initial;
  const [v, setV] = useState({
    start: init.start !== null ? String(init.start) : '',
    monthly: init.monthly !== null ? String(init.monthly) : '',
    months: String(init.months),
    target: init.target !== null ? String(init.target) : '',
  });
  const [error, setError] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const start = readAmount(v.start || '0');
    const monthly = readAmount(v.monthly || '0');
    const target = v.target.trim() ? readAmount(v.target) : null;
    const months = Number(v.months.trim());
    if ([start, monthly, target].includes('negative')) return setError('Amounts can’t be negative.');
    if ([start, monthly, target].includes('invalid')) return setError('Enter dollar amounts, like 400.');
    if (!isValidMonths(months)) return setError(`Enter a whole number of months from 1 to ${MAX_MONTHS}.`);
    if (target !== null && target === 0) return setError('Leave the target blank, or enter more than $0.');
    setError(null);
    onSubmit(spec.toTurn({ start: start as number, monthly: monthly as number, months, target: target as number | null }));
  }
  const field = (k: keyof typeof v, label: string, prefix = true, suffix?: string) => (
    <div className="amount-row-labelled">
      <label htmlFor={`${id}-${k}`}>{label}</label>
      <div className="amount-field">
        {prefix && <span aria-hidden="true">$</span>}
        <input id={`${id}-${k}`} inputMode="decimal" autoComplete="off" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
    </div>
  );
  return (
    <form className="amount-form multi-amount" onSubmit={submit} noValidate>
      {field('start', 'Starting amount')}
      {field('monthly', 'Monthly amount')}
      {field('months', 'Months', false, 'months')}
      {field('target', 'Target (optional)')}
      <button type="submit" className="btn btn-primary">
        Show the arithmetic
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const id = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  }
  return (
    <form className="composer" onSubmit={submit}>
      <label htmlFor={id} className="visually-hidden">
        Message Sunny
      </label>
      <input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Sunny anything about saving, investing or Tangerine…" autoComplete="off" maxLength={LIMITS.maxCustomerChars} />
      <button type="submit" className="btn btn-dark" disabled={disabled || !text.trim()} aria-label="Send message">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
        </svg>
      </button>
    </form>
  );
}
