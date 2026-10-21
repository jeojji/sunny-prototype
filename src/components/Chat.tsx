import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { hasAnyGoalFact, scenarioInput } from '../conversation/engine';
import { getPrompt, type InputSpec, type MultiSpec } from '../conversation/prompts';
import type { ConversationState, CustomerTurn, Message, NextStepId, SunnyEvent } from '../conversation/types';
import type { OrbMode } from '../conversation/useSunny';
import { MAX_MONTHS, isValidAmount, isValidMonths, parseAmount } from '../lib/calc';
import { LIMITS } from '../shared/api';
import { EducationCard, FactsUpdatedCard, ScenarioCard, SnapshotCard, SourceList } from './Cards';
import { GoalPanel } from './GoalPanel';
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
  const current = scenarioInput(state.facts);
  const showPanel = hasAnyGoalFact(state.facts);
  const slow = useSlowFlag(thinking, 9000);

  // Keep the newest message in view, after layout.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => el.scrollTo?.({ top: el.scrollHeight }));
    return () => cancelAnimationFrame(frame);
  }, [state.messages.length, pendingSay, thinking]);

  // If the control the customer used disappeared, move focus to the new controls.
  useEffect(() => {
    if (thinking) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      controlsRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    }
  }, [thinking, state.step, state.messages.length]);

  return (
    <main className={`chat-layout${showPanel ? ' has-panel' : ''}`} id="main">
      <section className="chat" aria-label="Conversation with Sunny">
        <div className="chat-head">
          <SunnyOrb mode={orb} size={44} />
          <div className="chat-head-text">
            <h1 className="chat-title">Sunny</h1>
            <p className="chat-status" aria-live="polite">
              {thinking ? 'Thinking…' : 'Saving for your first home'}
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
            <summary>Your goal at a glance</summary>
            <GoalPanel state={state} dispatch={dispatch} disabled={thinking} />
          </details>
        )}

        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label="Messages">
          {state.messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              showAvatar={m.role === 'sunny' && state.messages[i - 1]?.role !== 'sunny'}
              state={state}
              currentKey={current ? JSON.stringify(current) : ''}
              onOpen={(view) => dispatch({ type: 'setView', view })}
              onRetry={onRetry}
              onUseScripted={onUseScripted}
              isLast={i === state.messages.length - 1}
              busy={thinking}
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
              {prompt.multi && <MultiSelect spec={prompt.multi} onSubmit={(ids) => send(prompt.multi!.toTurn(ids))} />}
              {prompt.input && (
                <AmountForm key={`${state.step}-${state.seq}`} spec={prompt.input} onSubmit={(n) => send(prompt.input!.toTurn(n))} />
              )}
              {prompt.replies.length > 0 && (
                <div className="quick-replies" role="group" aria-label="Suggested replies">
                  {prompt.replies.map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      className={`chip${r.primary ? ' chip-primary' : ''}`}
                      onClick={() => send(r.turn)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <Composer disabled={thinking} onSend={sendText} />
        </div>
      </section>

      {showPanel && (
        <aside className="panel-desktop" aria-label="Your goal at a glance" id="goal-panel">
          <GoalPanel state={state} dispatch={dispatch} disabled={thinking} />
        </aside>
      )}
    </main>
  );
}

/** True once `active` has stayed true for `ms`. */
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
  currentKey,
  onOpen,
  onRetry,
  onUseScripted,
  isLast,
  busy,
}: {
  message: Message;
  showAvatar: boolean;
  state: ConversationState;
  currentKey: string;
  onOpen: (view: 'summary' | 'handoff') => void;
  onRetry: () => void;
  onUseScripted: () => void;
  isLast: boolean;
  busy: boolean;
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
            <div className="bubble">
              {sunny ? <RichText text={message.text} /> : message.text}
            </div>
          </>
        )}
        {card?.kind === 'education' && <EducationCard topic={card.topic} />}
        {card?.kind === 'snapshot' && <SnapshotCard profile={state.profile} />}
        {card?.kind === 'scenario' && (
          <ScenarioCard
            snapshot={{ ...card.snapshot }}
            hypothetical={card.hypothetical}
            outdated={JSON.stringify({ ...card.snapshot }) !== currentKey}
          />
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

function AmountForm({ spec, onSubmit }: { spec: InputSpec; onSubmit: (n: number) => void }) {
  const id = useId();
  const [value, setValue] = useState(spec.initial !== null ? String(spec.initial) : '');
  const [error, setError] = useState<string | null>(null);
  const isMonths = spec.kind === 'months';

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (/^[-−]/.test(trimmed.replace(/^\$/, ''))) return setError('Amounts can’t be negative. Enter $0 or more.');
    const n = isMonths ? Number(trimmed) : parseAmount(trimmed);
    if (isMonths) {
      if (!isValidMonths(n)) return setError(`Enter a whole number of months from 1 to ${MAX_MONTHS}.`);
    } else if (n === null || !isValidAmount(n)) {
      return setError('Enter a dollar amount of $0 or more.');
    } else if (!spec.allowZero && n <= 0) {
      return setError('Enter an amount greater than $0.');
    }
    setError(null);
    onSubmit(n as number);
  }

  return (
    <form className="amount-form" onSubmit={submit} noValidate>
      <label htmlFor={id}>{spec.label}</label>
      <div className="amount-row">
        <div className={`amount-field${isMonths ? ' is-months' : ''}`}>
          {!isMonths && <span aria-hidden="true">$</span>}
          <input
            id={id}
            inputMode={isMonths ? 'numeric' : 'decimal'}
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
          />
          {isMonths && <span aria-hidden="true">months</span>}
        </div>
        <button type="submit" className="btn btn-primary">
          {spec.submitLabel}
        </button>
      </div>
      {error && (
        <p className="field-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function MultiSelect({ spec, onSubmit }: { spec: MultiSpec; onSubmit: (ids: NextStepId[]) => void }) {
  const [selected, setSelected] = useState<NextStepId[]>(spec.selected);
  const toggle = (id: NextStepId) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <fieldset className="multi">
      <legend>Next steps</legend>
      {spec.options.map((o) => (
        <label key={o.id} className="check">
          <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
          <span>{o.label}</span>
        </label>
      ))}
      <button type="button" className="btn btn-primary" onClick={() => onSubmit(selected)} disabled={selected.length === 0}>
        {spec.submitLabel}
      </button>
    </fieldset>
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
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask anything about saving for your first home…"
        autoComplete="off"
        maxLength={LIMITS.maxCustomerChars}
      />
      <button type="submit" className="btn btn-dark" disabled={disabled || !text.trim()} aria-label="Send message">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
        </svg>
      </button>
    </form>
  );
}
